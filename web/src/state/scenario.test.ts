import { describe, expect, it } from 'vitest';
import type { LunarDataProvider, SiteSummary } from '../data/contract';
import { createMockTerrain } from '../data/mock/terrain';
import { ComparisonRunner, metricDelta, pairInputs, settingsOf } from './comparison';
import { ScenarioComputer, defaultInputs, defaultObserverHeightM, initialWorkspace, isAbortError, workspaceReducer, type BackendAnalysisProvider, type ScenarioInputs, type ScenarioResult } from './scenario';

const provenance = { kind: 'mock' as const, source: 'Scenario boundary fixture', version: '1', generatedAt: '2026-01-01T00:00:00Z' };
const site: SiteSummary = { id: 'test', name: 'Mock Fixture', category: 'mock', nameVerified: false, latDeg: -88, lonDegE: 0, provenance };
const siteB: SiteSummary = { ...site, id: 'test-b', name: 'Mock Fixture B', lonDegE: 90 };
function fixtureProvider(extra: Partial<BackendAnalysisProvider> = {}) {
  const maskRequests: number[] = [], ephemerisHeights: number[] = [];
  const provider: BackendAnalysisProvider = {
    kind: 'mock', listSites: async () => [site, siteB],
    getTerrain: async () => ({ type: 'heightFunction', coverage: { southDeg: -90, northDeg: -84, westDegE: 0, eastDegE: 360 }, heightAt: () => 0, createMeshLoader: createMockTerrain().createMeshLoader, provenance }),
    getHorizonMask: async (requested, height) => { maskRequests.push(height); return { siteId: requested.id, observerHeightM: height, azimuthsDeg: [0, 180], elevationsDeg: [0, 0], maxRangeM: 1000, provenance }; },
    getEphemeris: async (requested, start, end, step, height = 0) => {
      ephemerisHeights.push(height);
      const times = Array.from({ length: Math.floor((end - start) / (step * 1000)) + 1 }, (_, i) => start + i * step * 1000);
      return { siteId: requested.id, frame: 'MOON_ME', startUtcMs: start, stepSeconds: step, timesUtcMs: times, sunAzDeg: times.map(() => 0), earthAzDeg: times.map(() => 0), sunElDeg: times.map(() => 1), earthElDeg: times.map(() => 1), provenance };
    },
    ...extra,
  };
  return { provider, maskRequests, ephemerisHeights };
}

/** A backend fake whose analyses settle only when the test says so; records each request's signal. */
function controllableBackend() {
  const { provider: base } = fixtureProvider();
  const calls: { inputs: ScenarioInputs; id: string; signal: AbortSignal | undefined; resolve(): void }[] = [];
  const provider: BackendAnalysisProvider = {
    ...base,
    runAnalysis: (inputs, id, signal) => new Promise<ScenarioResult>((resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
      calls.push({ inputs, id, signal, resolve: () => { void new ScenarioComputer(base).compute(inputs, id).then(resolve, reject); } });
    }),
  };
  return { provider, calls };
}

// Authority: FR-001/010/018, task-34 auto-apply/abort/A-B contracts (contract-29).
// Geometry itself remains real in its own tests; these fixtures isolate async state.
describe('scenario result identity and independence', () => {
  it('ignores an older asynchronous success or failure after a newer submission', async () => {
    const { provider } = fixtureProvider();
    const old = await new ScenarioComputer(provider).compute(defaultInputs(site), 'old');
    let state = workspaceReducer(initialWorkspace, { type: 'begin', id: 'new', inputs: defaultInputs(siteB) });
    state = workspaceReducer(state, { type: 'complete', result: old });
    expect(state.result).toBeNull();
    expect(state.pendingId).toBe('new');
    state = workspaceReducer(state, { type: 'failed', id: 'old', message: 'old failure', outsideCoverage: false });
    expect(state.error).toBeNull();
    expect(state.pendingId).toBe('new');
  });

  it('selecting site B ends with B as the result, never A numbers under B', async () => {
    const { provider } = fixtureProvider();
    const computer = new ScenarioComputer(provider);
    const a = await computer.compute(defaultInputs(site), 'R1');
    let state = workspaceReducer(workspaceReducer(initialWorkspace, { type: 'initialize', inputs: defaultInputs(site) }), { type: 'begin', id: 'R1', inputs: defaultInputs(site) });
    state = workspaceReducer(state, { type: 'complete', result: a });
    // Site selection = draft patch + immediate submission with the current inputs.
    state = workspaceReducer(state, { type: 'draft', patch: { site: siteB } });
    state = workspaceReducer(state, { type: 'begin', id: 'R2', inputs: state.draft! });
    expect(state.pendingInputs!.site.id).toBe('test-b');
    expect(state.result!.inputs.site.id).toBe('test');
    const b = await computer.compute(state.draft!, 'R2');
    state = workspaceReducer(state, { type: 'complete', result: b });
    expect(state.result!.inputs.site.id).toBe('test-b');
    expect(state.result!.ephemeris.siteId).toBe('test-b');
    expect(state.pendingId).toBeNull();
    expect(state.pendingInputs).toBeNull();
  });

  it('cancel clears pending, keeps the completed result and returns the draft site to it', async () => {
    const { provider } = fixtureProvider();
    const a = await new ScenarioComputer(provider).compute(defaultInputs(site), 'R1');
    let state = workspaceReducer(initialWorkspace, { type: 'initialize', inputs: defaultInputs(site) });
    state = workspaceReducer(workspaceReducer(state, { type: 'begin', id: 'R1', inputs: defaultInputs(site) }), { type: 'complete', result: a });
    state = workspaceReducer(state, { type: 'draft', patch: { site: siteB, durationDays: 7 } });
    state = workspaceReducer(state, { type: 'begin', id: 'R2', inputs: state.draft! });
    state = workspaceReducer(state, { type: 'cancel', id: 'R2' });
    expect(state.pendingId).toBeNull();
    expect(state.result).toBe(a);
    expect(state.draft!.site.id).toBe('test');
    expect(state.draft!.durationDays).toBe(7);
  });

  it('a failure clears pending and leaves no result instead of a zero-filled one', () => {
    let state = workspaceReducer(initialWorkspace, { type: 'begin', id: 'R1', inputs: defaultInputs(site) });
    state = workspaceReducer(state, { type: 'failed', id: 'R1', message: 'Requested UTC window is outside processed coverage', outsideCoverage: true });
    expect(state.pendingId).toBeNull();
    expect(state.result).toBeNull();
    expect(state.outsideCoverage).toBe(true);
  });

  it('forwards the abort signal to the backend analysis and rejects with AbortError', async () => {
    const { provider, calls } = controllableBackend();
    const controller = new AbortController();
    const running = new ScenarioComputer(provider).compute(defaultInputs(site), 'R1', controller.signal);
    // compute() hands the request to the backend synchronously; no waiting needed.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.signal).toBe(controller.signal);
    controller.abort();
    const reason = await running.catch((error: unknown) => error);
    expect(isAbortError(reason)).toBe(true);
    expect(calls[0]!.signal!.aborted).toBe(true);
  });

  it('stops waiting on an aborted static computation', async () => {
    const { provider } = fixtureProvider({ getHorizonMask: () => new Promise(() => {}) });
    const controller = new AbortController();
    const running = new ScenarioComputer(provider).compute(defaultInputs(site), 'R1', controller.signal);
    controller.abort();
    expect(isAbortError(await running.catch((error: unknown) => error))).toBe(true);
  });

  it('rejects a height the data source does not support and defaults to its supported height', async () => {
    const { provider, ephemerisHeights } = fixtureProvider({ kind: 'processed', supportedObserverHeightsM: [1] });
    const computer = new ScenarioComputer(provider);
    expect(defaultObserverHeightM(provider)).toBe(1);
    await expect(computer.compute(defaultInputs(site, 2.5), 'R1')).rejects.toThrow(RangeError);
    expect(ephemerisHeights).toEqual([]);
    const result = await computer.compute(defaultInputs(site, defaultObserverHeightM(provider)), 'R2');
    expect(result.inputs.observerHeightM).toBe(1);
    expect(ephemerisHeights).toEqual([1]);
  });

  it('reuses a site-height mask across date edits and recomputes parallax when height changes', async () => {
    const { provider, maskRequests, ephemerisHeights } = fixtureProvider();
    const computer = new ScenarioComputer(provider);
    const inputs = { ...defaultInputs(site), durationDays: 1 };
    await computer.compute(inputs, 'a');
    await computer.compute({ ...inputs, startUtcMs: inputs.startUtcMs + 86_400_000 }, 'b');
    await computer.compute({ ...inputs, observerHeightM: 10 }, 'c');
    expect(maskRequests).toEqual([2.5, 10]);
    expect(ephemerisHeights).toEqual([2.5, 2.5, 10]);
  });

  it('includes an unaligned requested end as a shorter interval, without overcounting', async () => {
    const { provider } = fixtureProvider();
    const result: ScenarioResult = await new ScenarioComputer(provider).compute({ ...defaultInputs(site), durationDays: 1.5 / 24 }, 'partial');
    expect(result.ephemeris.timesUtcMs.map((t) => t - result.inputs.startUtcMs)).toEqual([0, 3_600_000, 5_400_000]);
    expect(result.analysis.metrics.windowHours).toBe(1.5);
    expect(result.analysis.metrics.sunlitHours).toBe(1.5);
  });
});

describe('two-site comparison', () => {
  const applied: ScenarioInputs = { ...defaultInputs(site), durationDays: 2, stepSeconds: 1800, observerHeightM: 10 };

  it('gives both sites the exact same window, cadence and height', () => {
    const { a, b } = pairInputs(settingsOf(applied), site, siteB);
    expect(a.site.id).toBe('test');
    expect(b.site.id).toBe('test-b');
    for (const side of [a, b]) {
      expect([side.startUtcMs, side.durationDays, side.stepSeconds, side.observerHeightM]).toEqual([applied.startUtcMs, 2, 1800, 10]);
    }
  });

  it('a superseded pair is aborted and never returned; the latest pair wins', async () => {
    const { provider, calls } = controllableBackend();
    const runner = new ComparisonRunner(provider);
    const first = pairInputs(settingsOf(applied), site, siteB);
    const second = pairInputs(settingsOf({ ...applied, durationDays: 3 }), site, siteB);
    const firstRun = runner.run(first.a, first.b);
    const secondRun = runner.run(second.a, second.b);
    expect(calls).toHaveLength(4);
    expect(calls.slice(0, 2).every((call) => call.signal!.aborted)).toBe(true);
    expect(await firstRun).toBeNull();
    calls[2]!.resolve(); calls[3]!.resolve();
    const outcome = await secondRun;
    expect(outcome).not.toBeNull();
    expect(outcome!.a.status === 'ready' && outcome!.a.result.inputs.durationDays).toBe(3);
    expect(outcome!.b.status === 'ready' && outcome!.b.result.inputs.site.id).toBe('test-b');
  });

  it('reports one side unavailable without inventing its numbers', async () => {
    const { provider: good } = fixtureProvider();
    const mixed: BackendAnalysisProvider = {
      ...good,
      getEphemeris: async (requested, ...rest) => {
        if (requested.id === 'test-b') throw new RangeError('Requested UTC window is outside processed coverage');
        return good.getEphemeris(requested, ...rest);
      },
    };
    const { a, b } = pairInputs(settingsOf(applied), site, siteB);
    const outcome = await new ComparisonRunner(mixed).run(a, b);
    expect(outcome!.a.status).toBe('ready');
    expect(outcome!.b).toMatchObject({ status: 'error', outsideCoverage: true });
  });

  it('keeps an unknown side unknown in the difference', () => {
    expect(metricDelta(10, null)).toBeNull();
    expect(metricDelta(null, 4)).toBeNull();
    expect(metricDelta(10, 4)).toBe(-6);
    expect(metricDelta(0, 0)).toBe(0);
  });
});
