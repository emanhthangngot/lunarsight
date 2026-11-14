import type { EphemerisSeries, HorizonMask, LunarDataProvider, Provenance, SiteSummary, TerrainSource } from '../contract';
import { validateCoordinates } from '../../geo/coordinates';
import { rayMarchHorizonMask } from '../../geo/horizonRayMarch';
import { createLazyDemTerrainSource, type DemManifest, type LazyDemTerrainSource } from './demTerrain';
import pilotSitesRaw from './sites.json';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;

interface PrecomputedHorizonAsset {
  siteId: string;
  azimuthsDeg: number[];
  maxRangeM: number;
  heights: Record<string, number[]>;
  provenance: Provenance;
}

function interpolateAngleDeg(a1: number, a2: number, alpha: number): number {
  let diff = (a2 - a1) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (a1 + alpha * diff + 360) % 360;
}

function formatHeightKey(heightM: number): string {
  return Number.isInteger(heightM) ? String(heightM) : String(heightM);
}

const CATALOG_SITES = pilotSitesRaw as unknown as SiteSummary[];
const CATALOG_SITE_IDS = new Set(CATALOG_SITES.map((s) => s.id));

/**
 * PilotDataProvider serves processed NASA PGDA LOLA DEMs, spherical ray-marched
 * horizon masks (0–150 km), and 3-month JPL Horizons ephemerides (Q1 2027) for
 * the full Artemis south-polar candidate site catalog, lazily loading per-site assets.
 */
export class PilotDataProvider implements LunarDataProvider {
  readonly kind = 'processed' as const;
  private terrainPromise: Promise<LazyDemTerrainSource> | null = null;
  private readonly horizonCache = new Map<string, Promise<PrecomputedHorizonAsset | null>>();
  private readonly ephemerisCache = new Map<string, Promise<EphemerisSeries>>();

  async listSites(): Promise<SiteSummary[]> {
    return CATALOG_SITES.map((site) => ({
      ...site,
      provenance: { ...site.provenance },
    }));
  }

  async getTerrain(): Promise<TerrainSource> {
    return this.getLazyTerrain();
  }

  private getLazyTerrain(): Promise<LazyDemTerrainSource> {
    if (!this.terrainPromise) {
      this.terrainPromise = this.loadTerrain().catch((error) => {
        this.terrainPromise = null;
        throw error;
      });
    }
    return this.terrainPromise;
  }

  private async loadTerrain(): Promise<LazyDemTerrainSource> {
    const manifestResp = await fetch('/data/pilot/terrain_manifest.json');
    if (!manifestResp.ok) {
      throw new Error(`Failed to load terrain manifest (${manifestResp.status})`);
    }
    const manifest = (await manifestResp.json()) as DemManifest;
    return createLazyDemTerrainSource(manifest, (meta) => meta.url);
  }

  private loadPrecomputedHorizon(siteId: string): Promise<PrecomputedHorizonAsset | null> {
    if (!CATALOG_SITE_IDS.has(siteId)) {
      return Promise.resolve(null);
    }
    let cached = this.horizonCache.get(siteId);
    if (!cached) {
      cached = fetch(`/data/pilot/horizon_${siteId}.json`)
        .then(async (resp) => {
          if (resp.status === 404) return null;
          if (!resp.ok) throw new Error(`Failed to load horizon asset for "${siteId}" (${resp.status})`);
          return (await resp.json()) as PrecomputedHorizonAsset;
        })
        .catch((err) => {
          this.horizonCache.delete(siteId);
          throw err;
        });
      this.horizonCache.set(siteId, cached);
    }
    return cached;
  }

  private loadPrecomputedEphemeris(siteId: string): Promise<EphemerisSeries> {
    let cached = this.ephemerisCache.get(siteId);
    if (!cached) {
      cached = fetch(`/data/pilot/ephemeris_${siteId}.json`)
        .then(async (resp) => {
          if (!resp.ok) {
            throw new Error(`Failed to load JPL Horizons asset for "${siteId}" (${resp.status})`);
          }
          return (await resp.json()) as EphemerisSeries;
        })
        .catch((err) => {
          this.ephemerisCache.delete(siteId);
          throw err;
        });
      this.ephemerisCache.set(siteId, cached);
    }
    return cached;
  }

  async getHorizonMask(site: SiteLocation, observerHeightM: number): Promise<HorizonMask | null> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }

    const asset = await this.loadPrecomputedHorizon(site.id);
    const presetElevations = asset?.heights[formatHeightKey(observerHeightM)];
    if (asset && presetElevations) {
      return {
        siteId: site.id,
        observerHeightM,
        azimuthsDeg: asset.azimuthsDeg,
        elevationsDeg: presetElevations,
        maxRangeM: asset.maxRangeM,
        provenance: { ...asset.provenance },
      };
    }

    // Arbitrary heights or custom south-polar coordinates ray-march the real loaded PGDA DEM.
    const terrain = await this.getLazyTerrain();
    await terrain.ensureLayersFor(point.latDeg, point.lonDegE);
    return rayMarchHorizonMask(
      { ...site, ...point },
      observerHeightM,
      terrain.heightAt,
      terrain.coverage.northDeg,
      {
        ...terrain.provenance,
        notes: `1-degree spherical ray-marched mask on PGDA LOLA DEM at ${observerHeightM} m AGL (0–150 km).`,
      },
    );
  }

  async getEphemeris(
    site: SiteLocation,
    startUtcMs: number,
    endUtcMs: number,
    stepSeconds: number,
    observerHeightM = 0,
  ): Promise<EphemerisSeries> {
    validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }
    if (![startUtcMs, endUtcMs, stepSeconds].every(Number.isFinite) || endUtcMs < startUtcMs || stepSeconds <= 0 || stepSeconds * 1000 < 1) {
      throw new RangeError('Use finite UTC bounds, end >= start, and a step of at least 1 ms');
    }

    if (!CATALOG_SITE_IDS.has(site.id)) {
      throw new RangeError(
        `Processed JPL Horizons ephemeris is outside coverage for "${site.id}". Select a catalog site in static pilot mode.`,
      );
    }

    const ephem = await this.loadPrecomputedEphemeris(site.id);

    const pilotStartMs = ephem.startUtcMs;
    const pilotStepMs = ephem.stepSeconds * 1000;
    const pilotCount = ephem.timesUtcMs.length;
    const pilotEndMs = pilotStartMs + (pilotCount - 1) * pilotStepMs;

    if (startUtcMs < pilotStartMs || endUtcMs > pilotEndMs) {
      throw new RangeError(
        `Requested UTC window is outside processed coverage (${new Date(pilotStartMs).toISOString().slice(0, 10)} to ${new Date(pilotEndMs).toISOString().slice(0, 10)} UTC).`,
      );
    }

    const count = Math.floor((endUtcMs - startUtcMs) / (stepSeconds * 1000)) + 1;
    if (!Number.isSafeInteger(count) || count > 1_000_000) {
      throw new RangeError('Ephemeris request exceeds 1,000,000 samples');
    }

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
      provenance: { ...ephem.provenance },
    };
  }
}
