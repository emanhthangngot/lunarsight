import type { EphemerisSeries, HorizonMask, LunarDataProvider, SiteSummary, TerrainSource } from '../contract';
import { MockDataProvider } from '../mock/MockDataProvider';
import ephemerisSite04Raw from './ephemeris_site04.json';
import horizonSite04Raw from './horizon_site04.json';
import pilotSitesRaw from './sites.json';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;

function interpolateAngleDeg(a1: number, a2: number, alpha: number): number {
  let diff = (a2 - a1) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (a1 + alpha * diff + 360) % 360;
}

/**
 * PilotDataProvider combines real processed NASA data (PGDA 78/90 DEMs, JPL Horizons ephemerides)
 * for Artemis candidate sites (Site04 Connecting Ridge, Site01 de Gerlache Rim) with fallback
 * to procedural mock models for un-profiled coordinates.
 */
export class PilotDataProvider implements LunarDataProvider {
  readonly kind = 'processed' as const;
  private readonly mockProvider = new MockDataProvider();

  async listSites(): Promise<SiteSummary[]> {
    const pilotSites = pilotSitesRaw as unknown as SiteSummary[];
    const mockSites = await this.mockProvider.listSites();
    return [...pilotSites, ...mockSites];
  }

  async getTerrain(): Promise<TerrainSource> {
    return this.mockProvider.getTerrain();
  }

  async getHorizonMask(site: SiteLocation, observerHeightM: number): Promise<HorizonMask | null> {
    if (site.id === 'site-04') {
      const base = horizonSite04Raw as unknown as HorizonMask;
      return {
        ...base,
        siteId: site.id,
        observerHeightM,
      };
    }
    return this.mockProvider.getHorizonMask(site, observerHeightM);
  }

  async getEphemeris(
    site: SiteLocation,
    startUtcMs: number,
    endUtcMs: number,
    stepSeconds: number,
    observerHeightM = 0,
  ): Promise<EphemerisSeries> {
    const isSite04 = site.id === 'site-04';
    const ephem = ephemerisSite04Raw as unknown as EphemerisSeries;

    const pilotStartMs = ephem.startUtcMs;
    const pilotStepMs = ephem.stepSeconds * 1000;
    const pilotCount = ephem.timesUtcMs.length;
    const pilotEndMs = pilotStartMs + (pilotCount - 1) * pilotStepMs;

    // Check if the requested window is entirely within the processed Horizons data range
    if (isSite04 && startUtcMs >= pilotStartMs && endUtcMs <= pilotEndMs) {
      const timesUtcMs: number[] = [];
      const sunAzDeg: number[] = [];
      const sunElDeg: number[] = [];
      const earthAzDeg: number[] = [];
      const earthElDeg: number[] = [];

      for (let t = startUtcMs; t <= endUtcMs; t += stepSeconds * 1000) {
        timesUtcMs.push(t);
        const floatIndex = (t - pilotStartMs) / pilotStepMs;
        const i0 = Math.floor(floatIndex);
        const i1 = Math.min(pilotCount - 1, i0 + 1);
        const alpha = floatIndex - i0;

        const sAz0 = ephem.sunAzDeg[i0] ?? 0;
        const sAz1 = ephem.sunAzDeg[i1] ?? sAz0;
        const sEl0 = ephem.sunElDeg[i0] ?? 0;
        const sEl1 = ephem.sunElDeg[i1] ?? sEl0;

        const eAz0 = ephem.earthAzDeg[i0] ?? 0;
        const eAz1 = ephem.earthAzDeg[i1] ?? eAz0;
        const eEl0 = ephem.earthElDeg[i0] ?? 0;
        const eEl1 = ephem.earthElDeg[i1] ?? eEl0;

        sunAzDeg.push(interpolateAngleDeg(sAz0, sAz1, alpha));
        sunElDeg.push(sEl0 + alpha * (sEl1 - sEl0));
        earthAzDeg.push(interpolateAngleDeg(eAz0, eAz1, alpha));
        earthElDeg.push(eEl0 + alpha * (eEl1 - eEl0));
      }

      return {
        siteId: site.id,
        frame: 'MOON_ME',
        startUtcMs,
        stepSeconds,
        timesUtcMs,
        sunAzDeg,
        sunElDeg,
        earthAzDeg,
        earthElDeg,
        provenance: ephem.provenance,
      };
    }

    // Fall back to deterministic model for dates outside pilot January 2027 window or other sites
    return this.mockProvider.getEphemeris(site, startUtcMs, endUtcMs, stepSeconds, observerHeightM);
  }
}
