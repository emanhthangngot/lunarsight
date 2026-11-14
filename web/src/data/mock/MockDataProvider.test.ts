import { describe, expect, it } from 'vitest';
import { MockDataProvider } from './MockDataProvider';

describe('mock data consumer contracts', () => {
  it('repeats terrain and time series across providers, with fictional provenance', async () => {
    const a = new MockDataProvider(), b = new MockDataProvider();
    const sites = await a.listSites();
    expect(sites).toEqual(await b.listSites());
    for (const site of sites) {
      expect(site.name).toMatch(/^Mock /);
      expect(site.nameVerified).toBe(false);
      expect(site.provenance.kind).toBe('mock');
    }
    const terrainA = await a.getTerrain(), terrainB = await b.getTerrain();
    if (terrainA.type !== 'heightFunction' || terrainB.type !== 'heightFunction') throw new Error('Expected analytic terrain');
    const floor = sites.find((s) => s.id === 'mock-floor-b')!;
    const massif = sites.find((s) => s.id === 'mock-massif-c')!;
    const ridge = sites.find((s) => s.id === 'mock-ridge-a')!;
    const rim = sites.find((s) => s.id === 'mock-rim-d')!;
    expect(terrainA.heightAt(floor.latDeg, floor.lonDegE)).toBeLessThan(-3000);
    expect(terrainA.heightAt(massif.latDeg, massif.lonDegE)).toBeGreaterThan(3000);
    expect(terrainA.heightAt(ridge.latDeg, ridge.lonDegE)).toBeGreaterThan(2500);
    expect(terrainA.heightAt(rim.latDeg, rim.lonDegE)).toBeGreaterThan(700);
    expect(terrainA.heightAt(floor.latDeg, floor.lonDegE)).toBe(terrainB.heightAt(floor.latDeg, floor.lonDegE));
    expect(terrainA.provenance.notes).toContain('not JPL');
    const start = Date.parse('2026-01-01T00:00:00Z');
    const series = await a.getEphemeris(floor, start, start + 7200_000, 3600);
    expect(series).toEqual(await b.getEphemeris(floor, start, start + 7200_000, 3600));
    expect(series.timesUtcMs).toEqual([start, start + 3600_000, start + 7200_000]);
    expect(series.provenance.kind).toBe('mock');
    expect(series.sunAzDeg.every(Number.isFinite)).toBe(true);
    expect(series.earthElDeg.every(Number.isFinite)).toBe(true);
    // Fictional epoch phases must separate the sky markers; parallax itself is
    // protected by the independent geometry cases and equipment-height test.
    const separationDeg = Math.abs(((series.sunAzDeg[0]! - series.earthAzDeg[0]! + 540) % 360) - 180);
    expect(separationDeg).toBeGreaterThan(90);
    expect(separationDeg).toBeLessThan(130);
  });

  it('ray marches a deterministic mask and lowers obstruction for taller observers', async () => {
    const provider = new MockDataProvider();
    const floor = (await provider.listSites()).find((site) => site.id === 'mock-floor-b')!;
    const started = performance.now();
    const mask = await provider.getHorizonMask(floor, 2);
    console.info('MASK_TIMING site=mock-floor-b azimuths=360 height=2m elapsedMs=' + (performance.now() - started).toFixed(3));
    expect(mask).not.toBeNull();
    expect(mask!.azimuthsDeg).toEqual(Array.from({ length: 360 }, (_, i) => i));
    expect(mask!.elevationsDeg.every(Number.isFinite)).toBe(true);
    expect(Math.max(...mask!.elevationsDeg)).toBeGreaterThan(0);
    expect(mask!.provenance.kind).toBe('mock');
    expect(mask).toEqual(await new MockDataProvider().getHorizonMask(floor, 2));
    const taller = await provider.getHorizonMask(floor, 100);
    expect(taller!.elevationsDeg.every((el, i) => el <= mask!.elevationsDeg[i]!)).toBe(true);
  });

  it('applies equipment height to finite-distance parallax without changing legacy defaults', async () => {
    const provider = new MockDataProvider();
    const site = (await provider.listSites())[0]!;
    const start = Date.parse('2026-01-01T00:00:00Z');
    const ground = await provider.getEphemeris(site, start, start, 3600);
    const zero = await provider.getEphemeris(site, start, start, 3600, 0);
    const tall = await provider.getEphemeris(site, start, start, 3600, 100);
    expect(zero).toEqual(ground);
    expect(tall.earthElDeg[0]).toBeLessThan(ground.earthElDeg[0]!);
    expect(tall.sunElDeg[0]).toBeLessThan(ground.sunElDeg[0]!);
    await expect(provider.getEphemeris(site, start, start, 3600, -1)).rejects.toThrow('height');
  });

  it('preserves missing coverage and rejects fabricated ephemeris ground height', async () => {
    const provider = new MockDataProvider();
    const outside = { id: 'outside', latDeg: -83.9, lonDegE: 0 };
    const terrain = await provider.getTerrain();
    if (terrain.type !== 'heightFunction') throw new Error('Expected analytic terrain');
    expect(terrain.heightAt(outside.latDeg, outside.lonDegE)).toBeNull();
    expect(await provider.getHorizonMask(outside, 2)).toBeNull();
    expect(await provider.getHorizonMask({ ...outside, latDeg: -84 }, 2)).toBeNull();
    await expect(provider.getEphemeris(outside, 0, 1000, 1)).rejects.toThrow('outside');
  });
});
