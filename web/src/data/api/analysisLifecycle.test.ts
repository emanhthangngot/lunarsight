import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioInputs } from '../../state/scenario';
import { ApiDataProvider, type AnalysisJobModel, type ServerAnalysisResult } from './ApiDataProvider';

const provenance = { kind: 'processed' as const, source: 'Synthetic API lifecycle fixture', version: 'test', generatedAt: '2027-01-01T00:00:00Z' };
const inputs: ScenarioInputs = {
  site: { id: 'custom:-89:0', name: 'Synthetic site', category: 'custom', latDeg: -89, lonDegE: 0, nameVerified: false, provenance },
  startUtcMs: 1798761600000, durationDays: 1, stepSeconds: 3600, observerHeightM: 1,
};
function job(status: AnalysisJobModel['status'], extra: Partial<AnalysisJobModel> = {}): AnalysisJobModel {
  return { id: 'job-a', calcHash: 'synthetic', status, progress: 0, resultId: null, errorMessage: null, outsideCoverage: false, createdAt: '2027-01-01T00:00:00Z', updatedAt: '2027-01-01T00:00:00Z', ...extra };
}
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
const result: ServerAnalysisResult = {
  id: 'res-a', calcHash: 'synthetic', inputs, createdAt: '2027-01-01T00:00:00Z', mask: null,
  ephemeris: { siteId: inputs.site.id, frame: 'MOON_ME', startUtcMs: inputs.startUtcMs, stepSeconds: 3600, timesUtcMs: [inputs.startUtcMs], sunAzDeg: [0], sunElDeg: [1], earthAzDeg: [2], earthElDeg: [3], provenance },
  analysis: { sunVisible: [null], earthVisible: [null], both: [null], metrics: { windowHours: 0, sunlitPercent: null, earthVisiblePercent: null, bothPercent: null, sunlitHours: null, earthVisibleHours: null, bothHours: null, longestDarknessHours: null, longestEarthBlackoutHours: null } },
};

describe('bounded public analysis lifecycle', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(['transport', 'body'] as const)('expires a stalled %s instead of keeping the workspace pending forever', async (stalled) => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', () => {
      if (stalled === 'transport') return new Promise<Response>(() => {});
      const response = json({});
      response.json = () => new Promise(() => {});
      return Promise.resolve(response);
    });
    const pending = new ApiDataProvider('http://fixture.test').runAnalysis(inputs, 'R-deadline');
    const expired = expect(pending).rejects.toThrow(/timed out after 120 seconds/i);
    await vi.advanceTimersByTimeAsync(120_000);
    await expired;
  });

  it('aborts an in-flight poll and cancels only with the submission-owned capability', async () => {
    vi.useFakeTimers();
    let cancellationCapability: string | null = null;
    let cancellationHadAdminHeader = false;
    const observed: { pollSignal?: AbortSignal | null } = {};
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/analyses')) return json({ status: 'accepted', result: null, job: job('queued'), cancelToken: 'synthetic-owner-capability' }, 202);
      if (url.endsWith('/cancel')) {
        const headers = new Headers(init?.headers);
        cancellationCapability = headers.get('X-Analysis-Cancel-Token');
        cancellationHadAdminHeader = headers.has('Authorization');
        return json(job('cancelled'));
      }
      observed.pollSignal = init?.signal ?? null;
      return new Promise<Response>(() => {});
    });
    const controller = new AbortController();
    const pending = new ApiDataProvider('http://fixture.test').runAnalysis(inputs, 'R-abort', controller.signal);
    const aborted = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(150);
    controller.abort();
    await aborted;
    expect(observed.pollSignal?.aborted).toBe(true);
    expect(cancellationCapability).toBe('synthetic-owner-capability');
    expect(cancellationHadAdminHeader).toBe(false);
  });

  it.each([
    ['failed', true, 'Outside coverage'],
    ['failed', false, 'Upstream failed'],
    ['cancelled', false, 'Cancelled by owner'],
    ['succeeded', false, null],
  ] as const)('retains the %s terminal failure exit without returning a fabricated result', async (status, outsideCoverage, errorMessage) => {
    vi.stubGlobal('fetch', async () => json({ status: 'accepted', result: null, job: job(status, { outsideCoverage, errorMessage }) }, 202));
    const pending = new ApiDataProvider('http://fixture.test').runAnalysis(inputs, 'R-terminal');
    if (outsideCoverage) await expect(pending).rejects.toBeInstanceOf(RangeError);
    else await expect(pending).rejects.toThrow(errorMessage ?? /missing resultId/i);
  });

  it('surfaces admission failure and preserves a cached result identity', async () => {
    vi.stubGlobal('fetch', async () => json({ detail: 'Analysis capacity is full' }, 429));
    await expect(new ApiDataProvider('http://fixture.test').runAnalysis(inputs, 'R-full')).rejects.toThrow('Analysis capacity is full');
    vi.stubGlobal('fetch', async () => json({ status: 'cached', result, job: null }));
    const cached = await new ApiDataProvider('http://fixture.test').runAnalysis(inputs, 'R-local');
    expect(cached.id).toBe('R-local');
    expect(cached.serverResultId).toBe('res-a');
    expect(cached.inputs).toEqual(inputs);
  });
});
