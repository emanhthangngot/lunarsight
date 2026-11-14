import { describe, expect, it } from 'vitest';
import { PilotDataProvider } from './PilotDataProvider';

describe('PilotDataProvider contracts', () => {
  it('lists verified Artemis candidate sites alongside mock sites', async () => {
    const provider = new PilotDataProvider();
    const sites = await provider.listSites();
    expect(sites.length).toBeGreaterThanOrEqual(7);

    const site04 = sites.find((s) => s.id === 'site-04');
    expect(site04).toBeDefined();
    expect(site04!.name).toContain('Connecting Ridge');
    expect(site04!.category).toBe('artemis-candidate');
    expect(site04!.nameVerified).toBe(true);
    expect(site04!.provenance.kind).toBe('processed');

    const site01 = sites.find((s) => s.id === 'site-01');
    expect(site01).toBeDefined();
    expect(site01!.name).toContain('de Gerlache Rim');
    expect(site01!.category).toBe('artemis-candidate');

    const mockSite = sites.find((s) => s.id === 'mock-ridge-a');
    expect(mockSite).toBeDefined();
    expect(mockSite!.provenance.kind).toBe('mock');
  });

  it('provides real near/far fused horizon mask for Site 04', async () => {
    const provider = new PilotDataProvider();
    const site04 = (await provider.listSites()).find((s) => s.id === 'site-04')!;

    const mask = await provider.getHorizonMask(site04, 1.0);
    expect(mask).not.toBeNull();
    expect(mask!.azimuthsDeg.length).toBe(360);
    expect(mask!.elevationsDeg.length).toBe(360);
    expect(mask!.maxRangeM).toBe(25000);
    expect(mask!.provenance.kind).toBe('processed');
    expect(mask!.provenance.source).toContain('PGDA');
  });

  it('interpolates real JPL Horizons ephemeris for Site 04 during January 2027', async () => {
    const provider = new PilotDataProvider();
    const site04 = (await provider.listSites()).find((s) => s.id === 'site-04')!;

    const start = Date.parse('2027-01-01T00:00:00Z');
    const end = Date.parse('2027-01-01T06:00:00Z');
    const stepSeconds = 3600; // hourly

    const series = await provider.getEphemeris(site04, start, end, stepSeconds, 1.0);
    expect(series.siteId).toBe('site-04');
    expect(series.frame).toBe('MOON_ME');
    expect(series.provenance.kind).toBe('processed');
    expect(series.provenance.source).toContain('Horizons');
    expect(series.timesUtcMs.length).toBe(7);

    // Initial values from sun.json: Azi: 59.1008, Elev: 1.1243
    expect(series.sunAzDeg[0]).toBeCloseTo(59.1008, 1);
    expect(series.sunElDeg[0]).toBeCloseTo(1.1243, 1);

    // Initial values from earth.json: Azi: 163.1606, Elev: -6.4541
    expect(series.earthAzDeg[0]).toBeCloseTo(163.1606, 1);
    expect(series.earthElDeg[0]).toBeCloseTo(-6.4541, 1);
  });

  it('falls back to deterministic mock model for dates outside pilot January 2027', async () => {
    const provider = new PilotDataProvider();
    const site04 = (await provider.listSites()).find((s) => s.id === 'site-04')!;

    // Query in 2026 (outside January 2027 Horizons table)
    const start2026 = Date.parse('2026-06-01T00:00:00Z');
    const series = await provider.getEphemeris(site04, start2026, start2026 + 7200_000, 3600);
    expect(series.provenance.kind).toBe('mock');
  });
});
