import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PilotDataProvider } from './PilotDataProvider';

const PUBLIC_ROOT = resolve(import.meta.dirname, '../../../public');

function stubPilotPublicFetch() {
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    if (!url.startsWith('/data/pilot/')) {
      return new Response('Not Found', { status: 404 });
    }
    const bytes = await readFile(resolve(PUBLIC_ROOT, url.slice(1)));
    return new Response(bytes, { status: 200 });
  });
}

describe('PilotDataProvider real NASA asset contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists processed Artemis candidate sites without mock sites', async () => {
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    expect(sites).toHaveLength(2);
    expect(sites.every((s) => s.provenance.kind === 'processed')).toBe(true);

    const site04 = sites.find((s) => s.id === 'site-04');
    const site01 = sites.find((s) => s.id === 'site-01');
    expect(site04?.name).toContain('Connecting Ridge');
    expect(site01?.name).toContain('de Gerlache Rim');
  });

  it('loads real PGDA DEM mosaic and resolves accurate site elevations', async () => {
    stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    const site04 = sites.find((s) => s.id === 'site-04')!;
    const site01 = sites.find((s) => s.id === 'site-01')!;

    const terrain = await provider.getTerrain();
    expect(terrain.provenance.kind).toBe('processed');
    expect(terrain.heightAt(site04.latDeg, site04.lonDegE)).toBeCloseTo(1737.178, 1);
    expect(terrain.heightAt(site01.latDeg, site01.lonDegE)).toBeCloseTo(1944.772, 1);
    expect(terrain.heightAt(-83.0, 0)).toBeNull();
  });

  it('provides precomputed 150 km PGDA horizon masks and ray-marches non-preset heights', async () => {
    stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const site01 = (await provider.listSites()).find((s) => s.id === 'site-01')!;

    const presetMask = await provider.getHorizonMask(site01, 2.5);
    expect(presetMask).not.toBeNull();
    expect(presetMask!.azimuthsDeg).toHaveLength(360);
    expect(presetMask!.maxRangeM).toBe(150_000);
    expect(presetMask!.provenance.kind).toBe('processed');

    // Non-preset observer height falls back to live ray-marching on loaded PGDA DEM
    const customHeightMask = await provider.getHorizonMask(site01, 5.0);
    expect(customHeightMask).not.toBeNull();
    expect(customHeightMask!.observerHeightM).toBe(5.0);
    expect(customHeightMask!.elevationsDeg[0]!).toBeLessThanOrEqual(presetMask!.elevationsDeg[0]!);
  });

  it('serves 3-month JPL Horizons ephemeris for Site 01 and Site 04 and rejects outside coverage', async () => {
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    const site04 = sites.find((s) => s.id === 'site-04')!;
    const site01 = sites.find((s) => s.id === 'site-01')!;

    const start = Date.parse('2027-01-01T00:00:00Z');
    const end = Date.parse('2027-03-15T00:00:00Z');

    const s04 = await provider.getEphemeris(site04, start, start + 6 * 3600_000, 3600, 2.5);
    expect(s04.provenance.kind).toBe('processed');
    expect(s04.sunAzDeg[0]).toBeCloseTo(59.1008, 1);
    expect(s04.sunElDeg[0]).toBeCloseTo(1.1243, 1);
    expect(s04.earthAzDeg[0]).toBeCloseTo(163.1606, 1);
    expect(s04.earthElDeg[0]).toBeCloseTo(-6.4541, 1);

    const s01 = await provider.getEphemeris(site01, end, end + 3600_000, 3600, 2.5);
    expect(s01.provenance.kind).toBe('processed');
    expect(s01.timesUtcMs).toHaveLength(2);

    await expect(
      provider.getEphemeris(site04, Date.parse('2026-06-01T00:00:00Z'), Date.parse('2026-06-02T00:00:00Z'), 3600),
    ).rejects.toThrow(/outside processed coverage/i);

    await expect(
      provider.getEphemeris({ id: 'custom:-89.5:0', latDeg: -89.5, lonDegE: 0 }, start, start + 3600_000, 3600),
    ).rejects.toThrow(/outside coverage/i);
  });
});
