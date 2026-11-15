import type { EphemerisSeries, HorizonMask, LunarDataProvider, SiteSummary, TerrainSource } from '../contract';
import type { ScenarioInputs, ScenarioResult } from '../../state/scenario';
import { validateCoordinates } from '../../geo/coordinates';
import { createLazyDemTerrainSource, type DemManifest } from '../pilot/demTerrain';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;

export interface AnalysisJobModel {
  id: string;
  calcHash: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  progress: number;
  resultId: string | null;
  errorMessage: string | null;
  outsideCoverage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ServerAnalysisResult {
  id: string;
  calcHash: string;
  inputs: ScenarioInputs;
  ephemeris: EphemerisSeries;
  mask: HorizonMask | null;
  analysis: ScenarioResult['analysis'];
  createdAt: string;
}

export interface AnalysisSubmitResponse {
  status: 'cached' | 'accepted';
  result: ServerAnalysisResult | null;
  job: AnalysisJobModel | null;
  /** Submission-owned cancellation capability; never an administrator credential. */
  cancelToken?: string | null;
}

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Ignore non-JSON error bodies
  }
  return fallback;
}

function toScenarioResult(serverResult: ServerAnalysisResult, localId: string): ScenarioResult {
  return {
    id: localId,
    serverResultId: serverResult.id,
    inputs: serverResult.inputs,
    ephemeris: serverResult.ephemeris,
    mask: serverResult.mask,
    analysis: serverResult.analysis,
  };
}

/**
 * ApiDataProvider connects the Three.js workspace to the LunarSight FastAPI backend
 * (public science endpoints and bounded immutable analysis jobs; no administrative UI client).
 */
export class ApiDataProvider implements LunarDataProvider {
  readonly kind = 'processed' as const;
  private readonly baseUrl: string;
  private terrainPromise: Promise<TerrainSource> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  async listSites(): Promise<SiteSummary[]> {
    const resp = await fetch(this.resolveUrl('/api/sites'));
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load sites (${resp.status})`));
    }
    return (await resp.json()) as SiteSummary[];
  }

  async getTerrain(): Promise<TerrainSource> {
    if (!this.terrainPromise) {
      this.terrainPromise = this.loadTerrain().catch((error) => {
        this.terrainPromise = null;
        throw error;
      });
    }
    return this.terrainPromise;
  }

  private async loadTerrain(): Promise<TerrainSource> {
    const manifestResp = await fetch(this.resolveUrl('/api/terrain/manifest'));
    if (!manifestResp.ok) {
      throw new Error(await readErrorDetail(manifestResp, `Failed to load terrain manifest (${manifestResp.status})`));
    }
    const manifest = (await manifestResp.json()) as DemManifest;
    return createLazyDemTerrainSource(manifest, (meta) => this.resolveUrl(meta.url));
  }

  async getHorizonMask(site: SiteLocation, observerHeightM: number): Promise<HorizonMask | null> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }

    const params = new URLSearchParams({
      latDeg: String(point.latDeg),
      lonDegE: String(point.lonDegE),
      observerHeightM: String(observerHeightM),
    });
    if (!site.id.startsWith('custom:')) {
      params.set('siteId', site.id);
    }

    const resp = await fetch(this.resolveUrl(`/api/horizon?${params.toString()}`));
    if (resp.status === 404) {
      return null;
    }
    if (resp.status === 422) {
      throw new RangeError(await readErrorDetail(resp, 'Horizon mask input is invalid or outside coverage'));
    }
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load horizon mask (${resp.status})`));
    }
    return (await resp.json()) as HorizonMask;
  }

  async getEphemeris(
    site: SiteLocation,
    startUtcMs: number,
    endUtcMs: number,
    stepSeconds: number,
    observerHeightM = 0,
  ): Promise<EphemerisSeries> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }
    if (![startUtcMs, endUtcMs, stepSeconds].every(Number.isFinite) || endUtcMs < startUtcMs || stepSeconds <= 0) {
      throw new RangeError('Use finite UTC bounds, end >= start, and a positive step');
    }

    const params = new URLSearchParams({
      latDeg: String(point.latDeg),
      lonDegE: String(point.lonDegE),
      startUtcMs: String(Math.round(startUtcMs)),
      endUtcMs: String(Math.round(endUtcMs)),
      stepSeconds: String(Math.round(stepSeconds)),
      observerHeightM: String(observerHeightM),
    });
    if (!site.id.startsWith('custom:')) {
      params.set('siteId', site.id);
    }

    const resp = await fetch(this.resolveUrl(`/api/ephemeris?${params.toString()}`));
    if (resp.status === 422 || resp.status === 404) {
      throw new RangeError(
        await readErrorDetail(resp, 'Requested coordinates or time window are outside coverage'),
      );
    }
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load ephemeris (${resp.status})`));
    }
    return (await resp.json()) as EphemerisSeries;
  }

  /** Stage 2: submit immutable scenario analysis via POST /api/analyses + background job polling. */
  async runAnalysis(inputs: ScenarioInputs, localId: string, signal?: AbortSignal): Promise<ScenarioResult> {
    if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError');
    const controller = new AbortController();
    let jobId: string | null = null;
    let cancelToken: string | null = null;
    let rejectAborted!: (reason: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const cancelOwnedJob = () => {
      if (!jobId || !cancelToken) return;
      const cancellation = new AbortController();
      const timer = setTimeout(() => cancellation.abort(), 5_000);
      // Best effort and separately bounded: local abort never waits for server I/O.
      void fetch(this.resolveUrl(`/api/analysis-jobs/${encodeURIComponent(jobId)}/cancel`), {
        method: 'POST',
        headers: { 'X-Analysis-Cancel-Token': cancelToken },
        signal: cancellation.signal,
      }).catch(() => {}).finally(() => clearTimeout(timer));
    };
    const onAbort = () => {
      cancelOwnedJob();
      rejectAborted(controller.signal.reason);
    };
    const onCallerAbort = () => controller.abort(new DOMException('Analysis aborted', 'AbortError'));
    controller.signal.addEventListener('abort', onAbort, { once: true });
    signal?.addEventListener('abort', onCallerAbort, { once: true });
    const deadline = setTimeout(() => controller.abort(new Error('Analysis timed out after 120 seconds; server cancellation is cooperative.')), 120_000);
    if (signal?.aborted) onCallerAbort();
    const checkAbort = () => controller.signal.throwIfAborted();
    const request = async (path: string, init: RequestInit = {}) => {
      checkAbort();
      const response = await fetch(this.resolveUrl(path), { ...init, signal: controller.signal });
      checkAbort();
      return response;
    };
    const pause = () => new Promise<void>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', onPauseAbort); };
      const onPauseAbort = () => { cleanup(); reject(controller.signal.reason); };
      const timer = setTimeout(() => { cleanup(); resolve(); }, 150);
      controller.signal.addEventListener('abort', onPauseAbort, { once: true });
      if (controller.signal.aborted) onPauseAbort();
    });
    const perform = async (): Promise<ScenarioResult> => {
      const submitResp = await request('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs }),
      });
      if (submitResp.status === 422 || submitResp.status === 404) {
        throw new RangeError(await readErrorDetail(submitResp, 'Scenario inputs are invalid or outside coverage'));
      }
      if (!submitResp.ok) throw new Error(await readErrorDetail(submitResp, `Failed to submit analysis (${submitResp.status})`));
      const submitted = (await submitResp.json()) as AnalysisSubmitResponse;
      checkAbort();
      if (submitted.status === 'cached' && submitted.result) return toScenarioResult(submitted.result, localId);
      if (!submitted.job) throw new Error('Backend did not return a cached result or job receipt');
      let job = submitted.job;
      jobId = job.id;
      cancelToken = submitted.cancelToken ?? null;
      while (job.status === 'queued' || job.status === 'running') {
        await pause();
        const pollResp = await request(`/api/analysis-jobs/${encodeURIComponent(job.id)}`);
        if (!pollResp.ok) throw new Error(await readErrorDetail(pollResp, `Failed to poll job ${job.id} (${pollResp.status})`));
        job = (await pollResp.json()) as AnalysisJobModel;
        checkAbort();
      }
      if (job.status === 'failed') {
        const message = job.errorMessage || 'Analysis job failed';
        if (job.outsideCoverage) throw new RangeError(message);
        throw new Error(message);
      }
      if (job.status === 'cancelled') throw new Error(job.errorMessage || 'Analysis job was cancelled');
      if (job.status !== 'succeeded' || !job.resultId) throw new Error('Succeeded job is missing resultId or has an invalid terminal state');
      const resResp = await request(`/api/analysis-results/${encodeURIComponent(job.resultId)}`);
      if (!resResp.ok) throw new Error(await readErrorDetail(resResp, `Failed to load analysis result ${job.resultId}`));
      const serverResult = (await resResp.json()) as ServerAnalysisResult;
      checkAbort();
      return toScenarioResult(serverResult, localId);
    };
    try {
      // The deadline also covers a stalled response body or a non-cooperative transport.
      return await Promise.race([perform(), aborted]);
    } finally {
      clearTimeout(deadline);
      controller.signal.removeEventListener('abort', onAbort);
      signal?.removeEventListener('abort', onCallerAbort);
    }
  }

}
