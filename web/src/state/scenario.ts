import type { EphemerisSeries, HorizonMask, LunarDataProvider, SiteSummary } from '../data/contract';
import { analyzeVisibility, type VisibilityAnalysis } from '../analysis/visibility';
import { validateCoordinates } from '../geo/coordinates';

export interface ScenarioInputs {
  site: SiteSummary;
  startUtcMs: number;
  durationDays: number;
  stepSeconds: number;
  observerHeightM: number;
}
export interface ScenarioResult {
  id: string;
  serverResultId?: string;
  inputs: ScenarioInputs;
  ephemeris: EphemerisSeries;
  mask: HorizonMask | null;
  analysis: VisibilityAnalysis;
}
/** Internal camera enum: 'orbital' = local site overview, 'surface' = ground view. */
export type CameraMode = 'orbital' | 'surface';
export interface WorkspaceState {
  draft: ScenarioInputs | null;
  result: ScenarioResult | null;
  pendingId: string | null;
  /** Inputs of the in-flight request: the UI names the requested site, never the old result's. */
  pendingInputs: ScenarioInputs | null;
  error: string | null;
  outsideCoverage: boolean;
  cursorIndex: number;
  cameraMode: CameraMode;
  playing: boolean;
  speed: number;
}
export const initialWorkspace: WorkspaceState = {
  draft: null, result: null, pendingId: null, pendingInputs: null, error: null, outsideCoverage: false,
  cursorIndex: 0, cameraMode: 'orbital', playing: false, speed: 5,
};

/** Demo shortlist (primary site buttons); every other catalog site stays reachable via search. */
export const DEMO_SHORTLIST_IDS: readonly string[] = ['site-04', 'site-01'];

export function shortlistSites(sites: readonly SiteSummary[]): SiteSummary[] {
  const listed = DEMO_SHORTLIST_IDS.map((id) => sites.find((site) => site.id === id)).filter((site): site is SiteSummary => site !== undefined);
  return listed.length > 0 ? listed : sites.slice(0, 2);
}

export function copyInputs(inputs: ScenarioInputs): ScenarioInputs {
  return { ...inputs, site: { ...inputs.site, provenance: { ...inputs.site.provenance } } };
}
export function scenarioKey(inputs: ScenarioInputs): string {
  return JSON.stringify([inputs.site.id, inputs.site.latDeg, inputs.site.lonDegE, inputs.startUtcMs, inputs.durationDays, inputs.stepSeconds, inputs.observerHeightM]);
}
/** Default observer height: the provider's first supported height, else 1 m for processed data, 2.5 m for mock. */
export function defaultObserverHeightM(provider: Pick<LunarDataProvider, 'kind' | 'supportedObserverHeightsM'>): number {
  return provider.supportedObserverHeightsM?.[0] ?? (provider.kind === 'processed' ? 1 : 2.5);
}
export function defaultInputs(site: SiteSummary, observerHeightM = 2.5): ScenarioInputs {
  const startUtcMs = site.category === 'artemis-candidate'
    ? Date.parse('2027-01-01T00:00:00Z')
    : Date.parse('2026-01-01T00:00:00Z');
  return { site, startUtcMs, durationDays: 30, stepSeconds: 3600, observerHeightM };
}
export function validateScenario(inputs: ScenarioInputs, supportedObserverHeightsM?: readonly number[]): void {
  validateCoordinates(inputs.site.latDeg, inputs.site.lonDegE);
  if (!Number.isFinite(inputs.startUtcMs) || !Number.isFinite(new Date(inputs.startUtcMs).getTime())) throw new RangeError('Enter a valid UTC start date and time');
  if (!Number.isFinite(inputs.durationDays) || inputs.durationDays <= 0 || inputs.durationDays > 90) throw new RangeError('Duration must be greater than 0 and at most 90 days');
  if (!Number.isFinite(inputs.stepSeconds) || inputs.stepSeconds < 60) throw new RangeError('Sample step must be at least 60 seconds');
  if (!Number.isFinite(inputs.observerHeightM) || inputs.observerHeightM < 0 || inputs.observerHeightM > 1000) throw new RangeError('Observer height must be between 0 and 1000 m');
  if (supportedObserverHeightsM && !supportedObserverHeightsM.includes(inputs.observerHeightM)) {
    throw new RangeError(`This data source was computed for an observer height of ${supportedObserverHeightsM.map((h) => h + ' m').join(', ')} only`);
  }
  if (Math.ceil(inputs.durationDays * 86400 / inputs.stepSeconds) + 1 > 25_000) throw new RangeError('At most 25,000 samples per scenario; increase the step or shorten the duration');
}

export interface BackendAnalysisProvider extends LunarDataProvider {
  runAnalysis?(inputs: ScenarioInputs, id: string, signal?: AbortSignal): Promise<ScenarioResult>;
}

export function isAbortError(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === 'AbortError';
}
function abortError(): DOMException { return new DOMException('Aborted', 'AbortError'); }

/** Rejects with AbortError as soon as `signal` aborts, otherwise settles like `promise`. */
function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (reason: unknown) => { signal.removeEventListener('abort', onAbort); reject(reason); },
    );
  });
}

/** Visible failure for a rejected computation; coverage errors keep their unavailable meaning. */
export function describeFailure(reason: unknown): { message: string; outsideCoverage: boolean } {
  const message = reason instanceof Error ? reason.message : 'Scenario computation failed';
  return { message, outsideCoverage: reason instanceof RangeError && /outside.*coverage/i.test(message) };
}

/** Bounded one-entry caches: date/step edits reuse terrain; height also changes
 * finite-distance ephemeris. Each computation captures its own immutable inputs.
 * One instance serves one request stream (the workspace, or one comparison side):
 * concurrent streams use separate instances so their one-entry caches never thrash.
 * Aborting stops waiting for the request; shared provider fetches stay cacheable.
 */
export class ScenarioComputer {
  private maskCache: { key: string; promise: Promise<HorizonMask | null> } | null = null;
  private ephemerisCache: { key: string; promise: Promise<EphemerisSeries> } | null = null;
  constructor(private readonly provider: BackendAnalysisProvider) {}

  async compute(draft: ScenarioInputs, id: string, signal?: AbortSignal): Promise<ScenarioResult> {
    if (signal?.aborted) throw abortError();
    const inputs = copyInputs(draft);
    validateScenario(inputs, this.provider.supportedObserverHeightsM);
    if (typeof this.provider.runAnalysis === 'function') {
      return untilAborted(this.provider.runAnalysis(inputs, id, signal), signal);
    }
    const { site, startUtcMs, durationDays, stepSeconds, observerHeightM } = inputs;
    const maskKey = JSON.stringify([site.id, site.latDeg, site.lonDegE, observerHeightM]);
    if (this.maskCache?.key !== maskKey) {
      this.maskCache = { key: maskKey, promise: this.provider.getHorizonMask(site, observerHeightM) };
    }
    const key = scenarioKey(inputs);
    if (this.ephemerisCache?.key !== key) {
      const end = startUtcMs + durationDays * 86_400_000;
      const promise = this.provider.getEphemeris(site, startUtcMs, end, stepSeconds, observerHeightM).then(async (series) => {
        const last = series.timesUtcMs.at(-1);
        if (last === undefined || last >= end) return series;
        // Include the actual requested end, not an extrapolated extra full step.
        // The final interval can be shorter than the nominal sampling step.
        const tail = await this.provider.getEphemeris(site, end, end, stepSeconds, observerHeightM);
        return {
          ...series,
          timesUtcMs: [...series.timesUtcMs, ...tail.timesUtcMs],
          sunAzDeg: [...series.sunAzDeg, ...tail.sunAzDeg], sunElDeg: [...series.sunElDeg, ...tail.sunElDeg],
          earthAzDeg: [...series.earthAzDeg, ...tail.earthAzDeg], earthElDeg: [...series.earthElDeg, ...tail.earthElDeg],
        };
      });
      this.ephemerisCache = { key, promise };
    }
    const [mask, ephemeris] = await untilAborted(Promise.all([this.maskCache.promise, this.ephemerisCache.promise]), signal);
    return { id, inputs, mask, ephemeris, analysis: analyzeVisibility(ephemeris, mask) };
  }
}

export type WorkspaceAction =
  | { type: 'draft'; patch: Partial<ScenarioInputs> }
  | { type: 'initialize'; inputs: ScenarioInputs }
  | { type: 'begin'; id: string; inputs: ScenarioInputs }
  | { type: 'complete'; result: ScenarioResult }
  | { type: 'failed'; id: string; message: string; outsideCoverage: boolean }
  | { type: 'cancel'; id: string }
  | { type: 'cursor'; index: number }
  | { type: 'camera'; mode: CameraMode }
  | { type: 'playing'; playing: boolean }
  | { type: 'speed'; speed: number };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'initialize': return state.draft ? state : { ...state, draft: copyInputs(action.inputs) };
    case 'draft': return state.draft ? { ...state, draft: { ...state.draft, ...action.patch }, playing: false } : state;
    case 'begin': return { ...state, pendingId: action.id, pendingInputs: copyInputs(action.inputs), error: null, outsideCoverage: false, playing: false };
    case 'complete': return state.pendingId === action.result.id ? { ...state, result: action.result, pendingId: null, pendingInputs: null, cursorIndex: 0 } : state;
    case 'failed': return state.pendingId === action.id ? { ...state, pendingId: null, pendingInputs: null, result: null, cursorIndex: 0, error: action.message, outsideCoverage: action.outsideCoverage } : state;
    // Cancelling keeps the last completed result and returns the draft's site to it, so the
    // header, viewer and numbers name the same site again; numeric draft edits are kept.
    case 'cancel': {
      if (state.pendingId !== action.id) return state;
      const draft = state.draft && state.result ? { ...state.draft, site: state.result.inputs.site } : state.draft;
      return { ...state, pendingId: null, pendingInputs: null, draft };
    }
    case 'cursor': return { ...state, cursorIndex: Math.max(0, Math.min(Math.floor(action.index), (state.result?.ephemeris.timesUtcMs.length ?? 1) - 1)) };
    case 'camera': return { ...state, cameraMode: action.mode };
    case 'playing': return { ...state, playing: action.playing };
    case 'speed': return { ...state, speed: action.speed };
  }
}
