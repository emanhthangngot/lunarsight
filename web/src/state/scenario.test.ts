import { describe, expect, it } from 'vitest';
import type { LunarDataProvider, SiteSummary } from '../data/contract';
import { ScenarioComputer, defaultInputs, initialWorkspace, workspaceReducer, type ScenarioResult } from './scenario';

const provenance = { kind: 'mock' as const, source: 'Scenario boundary fixture', version: '1', generatedAt: '2026-01-01T00:00:00Z' };
const site: SiteSummary = { id: 'test', name: 'Mock Fixture', category: 'mock', nameVerified: false, latDeg: -88, lonDegE: 0, provenance };
function fixtureProvider() {
  const maskRequests: number[] = [], ephemerisHeights: number[] = [];
  const provider: LunarDataProvider = {
    kind: 'mock', listSites: async () => [site],
    getTerrain: async () => ({ type: 'heightFunction', coverage: { southDeg: -90, northDeg: -84, westDegE: 0, eastDegE: 360 }, heightAt: () => 0, provenance }),
    getHorizonMask: async (_site, height) => { maskRequests.push(height); return { siteId: site.id, observerHeightM: height, azimuthsDeg: [0, 180], elevationsDeg: [0, 0], maxRangeM: 1000, provenance }; },
    getEphemeris: async (_site, start, end, step, height = 0) => {
      ephemerisHeights.push(height);
      const times = Array.from({ length: Math.floor((end - start) / (step * 1000)) + 1 }, (_, i) => start + i * step * 1000);
      return { siteId: site.id, frame: 'MOON_ME', startUtcMs: start, stepSeconds: step, timesUtcMs: times, sunAzDeg: times.map(() => 0), earthAzDeg: times.map(() => 0), sunElDeg: times.map(() => 1), earthElDeg: times.map(() => 1), provenance };
    },
  };
  return { provider, maskRequests, ephemerisHeights };
}

// Authority: FR-001/010/018 and the task's selective-recomputation contract.
// Geometry itself remains real in its own tests; this fixture isolates async state.
describe('scenario result identity and independence', () => {
  it('ignores an older asynchronous success or failure after a newer submission', async () => {
    const { provider } = fixtureProvider();
    const old = await new ScenarioComputer(provider).compute(defaultInputs(site), 'old');
    let state = workspaceReducer(initialWorkspace, { type: 'begin', id: 'new' });
    state = workspaceReducer(state, { type: 'complete', result: old });
    expect(state.result).toBeNull();
    expect(state.pendingId).toBe('new');
    state = workspaceReducer(state, { type: 'failed', id: 'old', message: 'old failure', outsideCoverage: false });
    expect(state.error).toBeNull();
    expect(state.pendingId).toBe('new');
  });
  it('keeps saved comparisons isolated from draft edits and loads every scenario input', async () => {
    const { provider } = fixtureProvider();
    const computer = new ScenarioComputer(provider);
    const result = await computer.compute({ ...defaultInputs(site), durationDays: 2, observerHeightM: 10 }, 'saved');
    let state = workspaceReducer(initialWorkspace, { type: 'load', result });
    state = workspaceReducer(state, { type: 'compare' });
    state = workspaceReducer(state, { type: 'draft', patch: { durationDays: 9, observerHeightM: 1.2, startUtcMs: 1234 } });
    expect(state.comparisons[0]!.inputs.durationDays).toBe(2);
    expect(state.comparisons[0]!.inputs.observerHeightM).toBe(10);
    state = workspaceReducer(state, { type: 'load', result: state.comparisons[0]! });
    expect(state.draft).toEqual(result.inputs);
    expect(state.draft).not.toBe(result.inputs);
    expect(state.draft!.site).not.toBe(result.inputs.site);
    expect(state.pendingId).toBeNull();
    expect(state.cursorIndex).toBe(0);
  });
  it('limits comparisons to three independent scenarios and rejects duplicates', async () => {
    const { provider } = fixtureProvider();
    const computer = new ScenarioComputer(provider);
    let state = initialWorkspace;
    for (let day = 1; day <= 4; day++) {
      const result = await computer.compute({ ...defaultInputs(site), durationDays: day }, 'R' + day);
      state = workspaceReducer(state, { type: 'load', result });
      state = workspaceReducer(state, { type: 'compare' });
      state = workspaceReducer(state, { type: 'compare' });
    }
    expect(state.comparisons.map((r) => r.inputs.durationDays)).toEqual([1, 2, 3]);
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
