import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiDataProvider } from './ApiDataProvider';

describe('ApiDataProvider backend integration contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads sites, terrain manifest, and binary DEM layer from backend URLs', async () => {
    const demValues = new Float32Array([100, 102, 104, 106]);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url === 'http://127.0.0.1:8000/api/sites') {
        return new Response(
          JSON.stringify([
            {
              id: 'site-04',
              name: 'Site 04',
              category: 'artemis-candidate',
              latDeg: -89.785092,
              lonDegE: 204.018283,
              nameVerified: true,
              provenance: { kind: 'processed', source: 'PGDA', version: 'pilot-v2', generatedAt: '2026-11-14T00:00:00Z' },
            },
          ]),
          { status: 200 },
        );
      }
      if (url === 'http://127.0.0.1:8000/api/terrain/manifest') {
        return new Response(
          JSON.stringify({
            version: 'pilot-v2',
            coverage: { southDeg: -90, northDeg: -84, westDegE: 0, eastDegE: 360 },
            provenance: { kind: 'processed', source: 'PGDA', version: 'pilot-v2', generatedAt: '2026-11-14T00:00:00Z' },
            layers: [
              {
                id: 'south-pole-test',
                url: '/api/terrain/layers/south-pole-test.bin',
                xMinM: -10000,
                yMaxM: 10000,
                spacingM: 10000,
                rows: 2,
                cols: 2,
                minHeightM: 100,
                maxHeightM: 106,
                source: 'test',
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url === 'http://127.0.0.1:8000/api/terrain/layers/south-pole-test.bin') {
        return new Response(demValues.buffer, { status: 200 });
      }
      return new Response('Not Found', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = new ApiDataProvider('http://127.0.0.1:8000/');
    const sites = await provider.listSites();
    expect(sites).toHaveLength(1);
    expect(sites[0]?.id).toBe('site-04');

    const terrain = await provider.getTerrain();
    expect(terrain.provenance.kind).toBe('processed');
    expect(terrain.heightAt(-89.9, 0)).not.toBeNull();
    expect(terrain.heightAt(-80, 0)).toBeNull();
  });

  it('returns null when horizon mask is outside coverage (404) and throws RangeError on 422 ephemeris', async () => {
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/api/horizon')) {
        return new Response(JSON.stringify({ detail: 'Outside terrain coverage' }), { status: 404 });
      }
      if (url.includes('/api/ephemeris')) {
        return new Response(
          JSON.stringify({ detail: 'Coordinates (-80.0000, 0.0000) are outside coverage of the PGDA DEM mosaic.' }),
          { status: 422 },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const provider = new ApiDataProvider('http://127.0.0.1:8000');
    const customSite = { id: 'custom:-80:0', latDeg: -80, lonDegE: 0 };

    await expect(provider.getHorizonMask(customSite, 2.5)).resolves.toBeNull();
    await expect(provider.getEphemeris(customSite, 1_798_761_600_000, 1_798_765_200_000, 3600, 2.5)).rejects.toThrowError(
      RangeError,
    );
  });

  it('runs Stage 2 analysis jobs (202 polling -> result) and persists scenarios', async () => {
    const prov = { kind: 'processed', source: 'PGDA', version: 'pilot-v2', generatedAt: '2026-11-14T00:00:00Z' } as const;
    const sampleInputs = {
      site: { id: 'site-04', name: 'Site 04', category: 'artemis-candidate' as const, latDeg: -89.785092, lonDegE: 204.018283, nameVerified: true, provenance: prov },
      startUtcMs: 1_798_761_600_000,
      durationDays: 1,
      stepSeconds: 3600,
      observerHeightM: 2.5,
    };
    const serverResult = {
      id: 'res_abc123',
      calcHash: 'hash1',
      inputs: sampleInputs,
      ephemeris: {
        siteId: 'site-04', frame: 'MOON_ME', startUtcMs: 1_798_761_600_000, stepSeconds: 3600,
        timesUtcMs: [1_798_761_600_000, 1_798_765_200_000],
        sunAzDeg: [0, 1], sunElDeg: [2, 2], earthAzDeg: [0, 1], earthElDeg: [3, 3], provenance: prov,
      },
      mask: null,
      analysis: {
        sunVisible: [null, null], earthVisible: [null, null], both: [null, null],
        metrics: {
          windowHours: 1, sunlitPercent: null, earthVisiblePercent: null, bothPercent: null,
          sunlitHours: null, earthVisibleHours: null, bothHours: null, longestDarknessHours: null, longestEarthBlackoutHours: null,
        },
      },
      createdAt: '2026-11-14T00:00:00Z',
    };

    let pollCount = 0;
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/analyses') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          status: 'accepted',
          result: null,
          job: { id: 'job_1', calcHash: 'hash1', status: 'queued', progress: 0, resultId: null, errorMessage: null, outsideCoverage: false, createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z' },
        }), { status: 202 });
      }
      if (url.endsWith('/api/analysis-jobs/job_1')) {
        pollCount += 1;
        return new Response(JSON.stringify({
          id: 'job_1', calcHash: 'hash1',
          status: pollCount >= 2 ? 'succeeded' : 'running',
          progress: pollCount >= 2 ? 1 : 0.5,
          resultId: pollCount >= 2 ? 'res_abc123' : null,
          errorMessage: null, outsideCoverage: false, createdAt: '2026-11-14T00:00:00Z', updatedAt: '2026-11-14T00:00:00Z',
        }), { status: 200 });
      }
      if (url.endsWith('/api/analysis-results/res_abc123')) {
        return new Response(JSON.stringify(serverResult), { status: 200 });
      }
      if (url.endsWith('/api/scenarios') && init?.method === 'POST') {
        return new Response(JSON.stringify({
          id: 'scn_1', title: 'Saved Test', notes: null, inputs: sampleInputs, resultId: 'res_abc123', metrics: serverResult.analysis.metrics, createdAt: '2026-11-14T00:00:00Z',
        }), { status: 201 });
      }
      if (url.endsWith('/api/scenarios') && (!init?.method || init.method === 'GET')) {
        return new Response(JSON.stringify([{
          id: 'scn_1', title: 'Saved Test', notes: null, inputs: sampleInputs, resultId: 'res_abc123', metrics: serverResult.analysis.metrics, createdAt: '2026-11-14T00:00:00Z',
        }]), { status: 200 });
      }
      if (url.endsWith('/api/scenarios/scn_1') && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response('Not Found', { status: 404 });
    });

    const provider = new ApiDataProvider('http://127.0.0.1:8000');
    const result = await provider.runAnalysis(sampleInputs, 'R1');
    expect(result.id).toBe('R1');
    expect(result.serverResultId).toBe('res_abc123');
    expect(pollCount).toBe(2);

    const saved = await provider.saveScenario('Saved Test', sampleInputs, result.serverResultId);
    expect(saved.id).toBe('scn_1');
    const list = await provider.listSavedScenarios();
    expect(list).toHaveLength(1);
    await expect(provider.deleteSavedScenario('scn_1')).resolves.toBeUndefined();
  });

  it('requests Stage 3 AI Advisor grounded in immutable resultId', async () => {
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/api/advisor-responses') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            resultId: 'res_abc123',
            mode: 'deterministic',
            summary: 'Grounded summary for res_abc123.',
            recommendations: ['Verify 0.25 m mast height.'],
            limitations: ['Geometric visibility only.'],
            citations: [{ label: 'Sunlit', value: '100.0%', source: 'JPL Horizons' }],
            providerUnavailable: false,
            providerError: null,
          }),
          { status: 200 },
        );
      }
      return new Response('Not Found', { status: 404 });
    });

    const provider = new ApiDataProvider('http://127.0.0.1:8000');
    const advice = await provider.askAdvisor('res_abc123', 'Summarize risks', 'en');
    expect(advice.resultId).toBe('res_abc123');
    expect(advice.mode).toBe('deterministic');
    expect(advice.citations).toHaveLength(1);
  });
});
