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
});
