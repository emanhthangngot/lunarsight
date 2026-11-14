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
export type CameraMode = 'orbital' | 'surface';
export interface WorkspaceState {
  draft: ScenarioInputs | null;
  result: ScenarioResult | null;
  pendingId: string | null;
  error: string | null;
  outsideCoverage: boolean;
  cursorIndex: number;
  cameraMode: CameraMode;
  playing: boolean;
  speed: number;
  comparisons: ScenarioResult[];
}
export const initialWorkspace: WorkspaceState = {
  draft: null, result: null, pendingId: null, error: null, outsideCoverage: false,
  cursorIndex: 0, cameraMode: 'orbital', playing: false, speed: 5, comparisons: [],
};

export function copyInputs(inputs: ScenarioInputs): ScenarioInputs {
  return { ...inputs, site: { ...inputs.site, provenance: { ...inputs.site.provenance } } };
}
export function scenarioKey(inputs: ScenarioInputs): string {
  return JSON.stringify([inputs.site.id, inputs.site.latDeg, inputs.site.lonDegE, inputs.startUtcMs, inputs.durationDays, inputs.stepSeconds, inputs.observerHeightM]);
}
export function defaultInputs(site: SiteSummary): ScenarioInputs {
  const startUtcMs = site.category === 'artemis-candidate'
    ? Date.parse('2027-01-01T00:00:00Z')
    : Date.parse('2026-01-01T00:00:00Z');
  return { site, startUtcMs, durationDays: 30, stepSeconds: 3600, observerHeightM: 2.5 };
}
export function validateScenario(inputs: ScenarioInputs): void {
  validateCoordinates(inputs.site.latDeg, inputs.site.lonDegE);
  if (!Number.isFinite(inputs.startUtcMs) || !Number.isFinite(new Date(inputs.startUtcMs).getTime())) throw new RangeError('Enter a valid UTC start date and time');
  if (!Number.isFinite(inputs.durationDays) || inputs.durationDays <= 0 || inputs.durationDays > 90) throw new RangeError('Duration must be greater than 0 and at most 90 days');
  if (!Number.isFinite(inputs.stepSeconds) || inputs.stepSeconds < 60) throw new RangeError('Sample step must be at least 60 seconds');
  if (!Number.isFinite(inputs.observerHeightM) || inputs.observerHeightM < 0 || inputs.observerHeightM > 1000) throw new RangeError('Observer height must be between 0 and 1000 m');
  if (Math.ceil(inputs.durationDays * 86400 / inputs.stepSeconds) + 1 > 25_000) throw new RangeError('At most 25,000 samples per scenario; increase the step or shorten the duration');
}

export interface BackendAnalysisProvider extends LunarDataProvider {
  runAnalysis?(inputs: ScenarioInputs, id: string, signal?: AbortSignal): Promise<ScenarioResult>;
}

/** Bounded one-entry caches: date/step edits reuse terrain; height also changes
 * finite-distance ephemeris. Each computation captures its own immutable inputs.
 */
export class ScenarioComputer {
  private maskCache: { key: string; promise: Promise<HorizonMask | null> } | null = null;
  private ephemerisCache: { key: string; promise: Promise<EphemerisSeries> } | null = null;
  constructor(private readonly provider: BackendAnalysisProvider) {}

  async compute(draft: ScenarioInputs, id: string): Promise<ScenarioResult> {
    const inputs = copyInputs(draft);
    validateScenario(inputs);
    if (typeof this.provider.runAnalysis === 'function') {
      return this.provider.runAnalysis(inputs, id);
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
    const [mask, ephemeris] = await Promise.all([this.maskCache.promise, this.ephemerisCache.promise]);
    return { id, inputs, mask, ephemeris, analysis: analyzeVisibility(ephemeris, mask) };
  }
}

export type WorkspaceAction =
  | { type: 'draft'; patch: Partial<ScenarioInputs> }
  | { type: 'initialize'; inputs: ScenarioInputs }
  | { type: 'begin'; id: string }
  | { type: 'complete'; result: ScenarioResult }
  | { type: 'failed'; id: string; message: string; outsideCoverage: boolean }
  | { type: 'cursor'; index: number }
  | { type: 'camera'; mode: CameraMode }
  | { type: 'playing'; playing: boolean }
  | { type: 'speed'; speed: number }
  | { type: 'compare' }
  | { type: 'removeComparison'; id: string }
  | { type: 'load'; result: ScenarioResult };

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'initialize': return state.draft ? state : { ...state, draft: copyInputs(action.inputs) };
    case 'draft': return state.draft ? { ...state, draft: { ...state.draft, ...action.patch }, playing: false } : state;
    case 'begin': return { ...state, pendingId: action.id, error: null, outsideCoverage: false, playing: false };
    case 'complete': return state.pendingId === action.result.id ? { ...state, result: action.result, pendingId: null, cursorIndex: 0 } : state;
    case 'failed': return state.pendingId === action.id ? { ...state, pendingId: null, result: null, cursorIndex: 0, error: action.message, outsideCoverage: action.outsideCoverage } : state;
    case 'cursor': return { ...state, cursorIndex: Math.max(0, Math.min(Math.floor(action.index), (state.result?.ephemeris.timesUtcMs.length ?? 1) - 1)) };
    case 'camera': return { ...state, cameraMode: action.mode };
    case 'playing': return { ...state, playing: action.playing };
    case 'speed': return { ...state, speed: action.speed };
    case 'compare': {
      if (!state.result || state.pendingId || state.comparisons.length >= 3 || state.comparisons.some((c) => scenarioKey(c.inputs) === scenarioKey(state.result!.inputs))) return state;
      return { ...state, comparisons: [...state.comparisons, state.result] };
    }
    case 'removeComparison': return { ...state, comparisons: state.comparisons.filter((c) => c.id !== action.id) };
    case 'load': return { ...state, draft: copyInputs(action.result.inputs), result: action.result, pendingId: null, error: null, outsideCoverage: false, cursorIndex: 0, playing: false };
  }
}
