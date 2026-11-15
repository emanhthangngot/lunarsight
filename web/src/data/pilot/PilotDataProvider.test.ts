import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PilotDataProvider } from './PilotDataProvider';

const PUBLIC_ROOT = resolve(import.meta.dirname, '../../../public');

function stubPilotPublicFetch() {
  const requestedUrls: string[] = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    requestedUrls.push(url);
    if (!url.startsWith('/data/pilot/')) {
      return new Response('Not Found', { status: 404 });
    }
    const bytes = await readFile(resolve(PUBLIC_ROOT, url.slice(1)));
    return new Response(bytes, { status: 200 });
  });
  return requestedUrls;
}

describe('PilotDataProvider real NASA asset contracts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists all processed Artemis candidate sites without mock sites', async () => {
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    expect(sites.length).toBeGreaterThanOrEqual(15);
    expect(sites.every((s) => s.provenance.kind === 'processed')).toBe(true);

    const site04 = sites.find((s) => s.id === 'site-04');
    const site01 = sites.find((s) => s.id === 'site-01');
    const malapert = sites.find((s) => s.id === 'site-23');
    const dm2 = sites.find((s) => s.id === 'dm2');
    expect(site04?.name.toLowerCase()).toContain('shackleton rim');
    expect(site01?.name.toLowerCase()).toContain('connecting ridge');
    expect(malapert?.name).toContain('Malapert Massif');
    expect(dm2?.name).toContain('Nobile Rim 2');
  });

  it('lazily loads regional DEM first and fetches site-specific 5 m DEM layers on demand', async () => {
    const requestedUrls = stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    const site04 = sites.find((s) => s.id === 'site-04')!;
    const dm2 = sites.find((s) => s.id === 'dm2')!;

    const terrain = await provider.getTerrain();
    expect(terrain.provenance.kind).toBe('processed');
    // Only manifest + regional DEM fetched on startup (no eager download of all 30+ site binaries)
    expect(requestedUrls).toEqual([
      '/data/pilot/terrain_manifest.json',
      '/data/pilot/terrain_south_pole_480m.bin',
    ]);
    // Regional DEM already resolves south-polar sites including DM2 (-83.95°) and rejects north of -78°
    expect(terrain.heightAt(dm2.latDeg, dm2.lonDegE)).not.toBeNull();
    expect(terrain.heightAt(-75.0, 0)).toBeNull();

    // Requesting horizon mask at non-preset height lazily fetches site-04 fine DEM layers
    const customMask = await provider.getHorizonMask(site04, 5.0);
    expect(customMask).not.toBeNull();
    expect(requestedUrls.some((u) => u.includes('terrain_site04_5m.bin'))).toBe(true);
    expect(terrain.heightAt(site04.latDeg, site04.lonDegE)).toBeCloseTo(1737.178, 1);
  });

  it('provides precomputed 150 km PGDA horizon masks across catalog sites and ray-marches non-preset heights', async () => {
    stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    const site01 = sites.find((s) => s.id === 'site-01')!;
    const dm2 = sites.find((s) => s.id === 'dm2')!;

    const presetMask = await provider.getHorizonMask(site01, 2.5);
    expect(presetMask).not.toBeNull();
    expect(presetMask!.azimuthsDeg).toHaveLength(360);
    expect(presetMask!.maxRangeM).toBe(150_000);
    expect(presetMask!.provenance.kind).toBe('processed');

    const dm2Mask = await provider.getHorizonMask(dm2, 2.5);
    expect(dm2Mask).not.toBeNull();
    expect(dm2Mask!.azimuthsDeg).toHaveLength(360);
    expect(dm2Mask!.elevationsDeg.every(Number.isFinite)).toBe(true);

    // Non-preset observer height falls back to live ray-marching on loaded PGDA DEM
    const customHeightMask = await provider.getHorizonMask(site01, 5.0);
    expect(customHeightMask).not.toBeNull();
    expect(customHeightMask!.observerHeightM).toBe(5.0);
    expect(customHeightMask!.elevationsDeg[0]!).toBeLessThanOrEqual(presetMask!.elevationsDeg[0]!);
  });

  it('serves 3-month JPL Horizons ephemeris across catalog sites and rejects outside coverage', async () => {
    stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    const site04 = sites.find((s) => s.id === 'site-04')!;
    const malapert = sites.find((s) => s.id === 'site-23')!;

    const start = Date.parse('2027-01-01T00:00:00Z');
    const end = Date.parse('2027-03-15T00:00:00Z');

    const s04 = await provider.getEphemeris(site04, start, start + 6 * 3600_000, 3600, 1);
    expect(s04.provenance.kind).toBe('processed');
    expect(s04.sunAzDeg[0]).toBeCloseTo(59.1008, 1);
    expect(s04.sunElDeg[0]).toBeCloseTo(1.1243, 1);
    expect(s04.earthAzDeg[0]).toBeCloseTo(163.1606, 1);
    expect(s04.earthElDeg[0]).toBeCloseTo(-6.4541, 1);

    const s23 = await provider.getEphemeris(malapert, end, end + 3600_000, 3600, 1);
    expect(s23.provenance.kind).toBe('processed');
    expect(s23.timesUtcMs).toHaveLength(2);

    await expect(
      provider.getEphemeris(site04, Date.parse('2026-06-01T00:00:00Z'), Date.parse('2026-06-02T00:00:00Z'), 3600),
    ).rejects.toThrow(/outside processed coverage/i);

    await expect(
      provider.getEphemeris({ id: 'custom:-89.5:0', latDeg: -89.5, lonDegE: 0 }, start, start + 3600_000, 3600),
    ).rejects.toThrow(/outside coverage/i);
  });
});

describe('processed observer and missing-sample identity', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('rejects a catalog ID paired with another observer before serving either preset', async () => {
    stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const site = (await provider.listSites()).find((entry) => entry.id === 'site-04')!;
    const wrongObserver = { ...site, latDeg: 0, lonDegE: 0 };
    const start = Date.parse('2027-01-01T00:00:00Z');
    await expect(provider.getHorizonMask(wrongObserver, 1)).rejects.toThrow(/canonical observer/i);
    await expect(provider.getEphemeris(wrongObserver, start, start + 3600_000, 3600, 1)).rejects.toThrow(/canonical observer/i);
    // Longitude wrapping is the same observer, not a reason to reject a valid source.
    const normalized = await provider.getEphemeris({ ...site, lonDegE: site.lonDegE - 360 }, start, start, 3600, 1);
    expect(normalized.sunElDeg[0]).toBeCloseTo(1.1243, 1);
  });

  it('rejects unsupported static heights and discloses unrecorded historical altitude', async () => {
    stubPilotPublicFetch();
    const provider = new PilotDataProvider();
    const site = (await provider.listSites()).find((entry) => entry.id === 'site-04')!;
    const start = Date.parse('2027-01-01T00:00:00Z');
    for (const height of [0, 0.25, 2.5, 10, 1000]) {
      await expect(provider.getEphemeris(site, start, start, 3600, height)).rejects.toThrow(/recorded 1 m/i);
    }
    const recorded = await provider.getEphemeris(site, start, start, 3600, 1);
    expect(recorded.observer).toMatchObject({ observerHeightM: 1, groundHeightM: null, ellipsoidAltitudeKm: null, datumStatus: 'conditional' });
    expect(recorded.provenance.notes).toContain('Shackleton');
  });

  it('does not turn missing source angles into computed zero directions', async () => {
    const provider = new PilotDataProvider();
    const site = (await provider.listSites()).find((entry) => entry.id === 'site-04')!;
    const start = Date.parse('2027-01-01T00:00:00Z');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      siteId: site.id, frame: 'MOON_ME', startUtcMs: start, stepSeconds: 3600,
      timesUtcMs: [start], sunAzDeg: [], sunElDeg: [1], earthAzDeg: [2], earthElDeg: [3],
      provenance: { kind: 'processed', source: 'Synthetic incomplete fixture', version: 'test', generatedAt: '2027-01-01T00:00:00Z' },
    })));
    await expect(provider.getEphemeris(site, start, start, 3600, 1)).rejects.toThrow(/Missing\/nonfinite ephemeris samples/i);
  });

  it('does not present a retrospectively invented legacy query altitude', async () => {
    const provider = new PilotDataProvider();
    const site = (await provider.listSites()).find((entry) => entry.id === 'site-04')!;
    const start = Date.parse('2027-01-01T00:00:00Z');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({
      siteId: site.id, frame: 'MOON_ME', startUtcMs: start, stepSeconds: 3600,
      timesUtcMs: [start], sunAzDeg: [0], sunElDeg: [1], earthAzDeg: [2], earthElDeg: [3],
      observer: { latDeg: site.latDeg, lonDegE: site.lonDegE, observerHeightM: 1, groundHeightM: 9999, ellipsoidAltitudeKm: null, datumStatus: 'conditional', metadataOrigin: 'legacy-pipeline-height' },
      provenance: { kind: 'processed', source: 'Synthetic invalid metadata fixture', version: 'test', generatedAt: '2027-01-01T00:00:00Z' },
    })));
    await expect(provider.getEphemeris(site, start, start, 3600, 1)).rejects.toThrow(/must remain null/i);
  });
});
