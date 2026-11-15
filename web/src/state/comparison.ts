import type { SiteSummary } from '../data/contract';
import { ScenarioComputer, describeFailure, isAbortError, scenarioKey, type BackendAnalysisProvider, type ScenarioInputs, type ScenarioResult } from './scenario';

/** Window/cadence/height shared by both sides; taken from the workspace's applied result (A's settings). */
export interface ComparisonSettings {
  startUtcMs: number;
  durationDays: number;
  stepSeconds: number;
  observerHeightM: number;
}

export function settingsOf(inputs: ScenarioInputs): ComparisonSettings {
  return { startUtcMs: inputs.startUtcMs, durationDays: inputs.durationDays, stepSeconds: inputs.stepSeconds, observerHeightM: inputs.observerHeightM };
}

/** Both sides get identical settings; only the site differs. */
export function pairInputs(settings: ComparisonSettings, siteA: SiteSummary, siteB: SiteSummary): { a: ScenarioInputs; b: ScenarioInputs } {
  return { a: { site: siteA, ...settings }, b: { site: siteB, ...settings } };
}

export function pairKey(a: ScenarioInputs, b: ScenarioInputs): string {
  return scenarioKey(a) + '|' + scenarioKey(b);
}

export type SideOutcome =
  | { status: 'ready'; result: ScenarioResult }
  | { status: 'error'; message: string; outsideCoverage: boolean };

export interface PairOutcome { key: string; a: SideOutcome; b: SideOutcome }

/** B − A; unknown on either side stays unknown (never treated as zero). */
export function metricDelta(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : b - a;
}

/**
 * Latest-wins A/B runner. Each side has its own ScenarioComputer (independent caches and
 * request ids); every run aborts the previous pair, so a late pair can never overwrite one
 * computed for changed sites or settings. `run` resolves null when superseded or cancelled.
 */
export class ComparisonRunner {
  private readonly sides: readonly [ScenarioComputer, ScenarioComputer];
  private controller: AbortController | null = null;
  private sequence = 0;

  constructor(provider: BackendAnalysisProvider) {
    this.sides = [new ScenarioComputer(provider), new ScenarioComputer(provider)];
  }

  async run(a: ScenarioInputs, b: ScenarioInputs): Promise<PairOutcome | null> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const run = ++this.sequence;
    const side = (computer: ScenarioComputer, inputs: ScenarioInputs, tag: string): Promise<SideOutcome | null> =>
      computer.compute(inputs, `C${run}${tag}`, controller.signal).then(
        (result): SideOutcome => ({ status: 'ready', result }),
        (reason: unknown): SideOutcome | null => (isAbortError(reason) ? null : { status: 'error', ...describeFailure(reason) }),
      );
    const [outcomeA, outcomeB] = await Promise.all([side(this.sides[0], a, 'A'), side(this.sides[1], b, 'B')]);
    if (controller.signal.aborted || this.controller !== controller || !outcomeA || !outcomeB) return null;
    this.controller = null;
    return { key: pairKey(a, b), a: outcomeA, b: outcomeB };
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
