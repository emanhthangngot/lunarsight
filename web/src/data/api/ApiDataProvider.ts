import type { WindowMetrics } from '../../analysis/visibility';
import type { EphemerisSeries, HorizonMask, LunarDataProvider, SiteSummary, TerrainSource } from '../contract';
import type { ScenarioInputs, ScenarioResult } from '../../state/scenario';
import { validateCoordinates } from '../../geo/coordinates';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import { createDemHeightAt, type DemLayerData, type DemManifest } from '../pilot/demTerrain';

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
}

export interface SavedScenarioSummary {
  id: string;
  title: string;
  notes: string | null;
  inputs: ScenarioInputs;
  resultId: string | null;
  metrics: WindowMetrics | null;
  createdAt: string;
}

export interface SavedScenarioDetail {
  id: string;
  title: string;
  notes: string | null;
  inputs: ScenarioInputs;
  result: ServerAnalysisResult | null;
  createdAt: string;
}

export interface AdvisorCitation {
  label: string;
  value: string;
  source: string;
}

export interface AdvisorResponse {
  resultId: string;
  mode: 'llm' | 'deterministic' | 'deterministic_fallback';
  summary: string;
  recommendations: string[];
  limitations: string[];
  citations: AdvisorCitation[];
  providerUnavailable: boolean;
  providerError: string | null;
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
 * (Stage 1 scientific endpoints + Stage 2 immutable analysis jobs & SQLite scenario persistence).
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

    const layers: DemLayerData[] = await Promise.all(
      manifest.layers.map(async (meta) => {
        const resp = await fetch(this.resolveUrl(meta.url));
        if (!resp.ok) {
          throw new Error(`Failed to load DEM layer ${meta.id} (${resp.status})`);
        }
        const buffer = await resp.arrayBuffer();
        const data = new Float32Array(buffer);
        if (data.length !== meta.rows * meta.cols) {
          throw new Error(`DEM layer ${meta.id} size mismatch: expected ${meta.rows * meta.cols}, got ${data.length}`);
        }
        return {
          xMinM: meta.xMinM,
          yMaxM: meta.yMaxM,
          spacingM: meta.spacingM,
          rows: meta.rows,
          cols: meta.cols,
          data,
        };
      }),
    );

    const heightAt = createDemHeightAt(layers, manifest.coverage);

    return {
      type: 'heightFunction',
      provenance: { ...manifest.provenance },
      coverage: { ...manifest.coverage },
      heightAt,
      createMeshLoader: () =>
        new WorkerTerrainMeshLoader(
          () =>
            new Worker(new URL('../../terrain/localMesh.worker.ts', import.meta.url), {
              type: 'module',
            }),
          {
            type: 'init',
            layers,
            coverage: manifest.coverage,
            provenance: manifest.provenance,
          },
        ),
    };
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
    const signalInit: RequestInit = signal ? { signal } : {};
    const submitResp = await fetch(this.resolveUrl('/api/analyses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs }),
      ...signalInit,
    });
    if (submitResp.status === 422 || submitResp.status === 404) {
      throw new RangeError(await readErrorDetail(submitResp, 'Scenario inputs are invalid or outside coverage'));
    }
    if (!submitResp.ok) {
      throw new Error(await readErrorDetail(submitResp, `Failed to submit analysis (${submitResp.status})`));
    }

    const submitted = (await submitResp.json()) as AnalysisSubmitResponse;
    if (submitted.status === 'cached' && submitted.result) {
      return toScenarioResult(submitted.result, localId);
    }
    if (!submitted.job) {
      throw new Error('Backend did not return a cached result or job receipt');
    }

    let job = submitted.job;
    while (job.status === 'queued' || job.status === 'running') {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 150);
        if (signal) {
          if (signal.aborted) {
            clearTimeout(timer);
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            void fetch(this.resolveUrl(`/api/analysis-jobs/${job.id}/cancel`), { method: 'POST' }).catch(() => {});
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }
      });

      const pollResp = await fetch(this.resolveUrl(`/api/analysis-jobs/${job.id}`), signalInit);
      if (!pollResp.ok) {
        throw new Error(await readErrorDetail(pollResp, `Failed to poll job ${job.id} (${pollResp.status})`));
      }
      job = (await pollResp.json()) as AnalysisJobModel;
    }

    if (job.status === 'failed') {
      const msg = job.errorMessage || 'Analysis job failed';
      if (job.outsideCoverage) {
        throw new RangeError(msg);
      }
      throw new Error(msg);
    }
    if (job.status === 'cancelled') {
      throw new Error(job.errorMessage || 'Analysis job was cancelled');
    }
    if (!job.resultId) {
      throw new Error('Succeeded job is missing resultId');
    }

    const resResp = await fetch(this.resolveUrl(`/api/analysis-results/${job.resultId}`), signalInit);
    if (!resResp.ok) {
      throw new Error(await readErrorDetail(resResp, `Failed to load analysis result ${job.resultId}`));
    }
    const serverResult = (await resResp.json()) as ServerAnalysisResult;
    return toScenarioResult(serverResult, localId);
  }

  async listSavedScenarios(): Promise<SavedScenarioSummary[]> {
    const resp = await fetch(this.resolveUrl('/api/scenarios'));
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load saved scenarios (${resp.status})`));
    }
    return (await resp.json()) as SavedScenarioSummary[];
  }

  async saveScenario(
    title: string,
    inputs: ScenarioInputs,
    resultId?: string,
    notes?: string,
  ): Promise<SavedScenarioSummary> {
    const resp = await fetch(this.resolveUrl('/api/scenarios'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, inputs, resultId: resultId ?? null, notes: notes ?? null }),
    });
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to save scenario (${resp.status})`));
    }
    return (await resp.json()) as SavedScenarioSummary;
  }

  async getSavedScenario(scenarioId: string): Promise<SavedScenarioDetail> {
    const resp = await fetch(this.resolveUrl(`/api/scenarios/${encodeURIComponent(scenarioId)}`));
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load scenario (${resp.status})`));
    }
    return (await resp.json()) as SavedScenarioDetail;
  }

  async deleteSavedScenario(scenarioId: string): Promise<void> {
    const resp = await fetch(this.resolveUrl(`/api/scenarios/${encodeURIComponent(scenarioId)}`), {
      method: 'DELETE',
    });
    if (!resp.ok && resp.status !== 204) {
      throw new Error(await readErrorDetail(resp, `Failed to delete scenario (${resp.status})`));
    }
  }

  /** Stage 3: request evidence-linked AI Advisor explanation grounded in an immutable resultId. */
  async askAdvisor(
    resultId: string,
    question = 'Summarize solar illumination, Earth visibility, and key operational risks for this site.',
    language: 'vi' | 'en' = 'vi',
  ): Promise<AdvisorResponse> {
    const resp = await fetch(this.resolveUrl('/api/advisor-responses'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resultId, question, language }),
    });
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load advisor response (${resp.status})`));
    }
    return (await resp.json()) as AdvisorResponse;
  }
}
