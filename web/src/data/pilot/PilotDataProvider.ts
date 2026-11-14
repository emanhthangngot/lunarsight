import type { EphemerisSeries, HorizonMask, LunarDataProvider, Provenance, SiteSummary, TerrainSource } from '../contract';
import { validateCoordinates } from '../../geo/coordinates';
import { rayMarchHorizonMask } from '../../geo/horizonRayMarch';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import { createDemHeightAt, type DemLayerData, type DemManifest } from './demTerrain';
import ephemerisSite01Raw from './ephemeris_site01.json';
import ephemerisSite04Raw from './ephemeris_site04.json';
import horizonSite01Raw from './horizon_site01.json';
import horizonSite04Raw from './horizon_site04.json';
import pilotSitesRaw from './sites.json';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;

interface PrecomputedHorizonAsset {
  siteId: string;
  azimuthsDeg: number[];
  maxRangeM: number;
  heights: Record<string, number[]>;
  provenance: Provenance;
}

const EPHEMERIS_BY_SITE: Record<string, EphemerisSeries> = {
  'site-01': ephemerisSite01Raw as unknown as EphemerisSeries,
  'site-04': ephemerisSite04Raw as unknown as EphemerisSeries,
};

const HORIZONS_BY_SITE: Record<string, PrecomputedHorizonAsset> = {
  'site-01': horizonSite01Raw as unknown as PrecomputedHorizonAsset,
  'site-04': horizonSite04Raw as unknown as PrecomputedHorizonAsset,
};

function interpolateAngleDeg(a1: number, a2: number, alpha: number): number {
  let diff = (a2 - a1) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (a1 + alpha * diff + 360) % 360;
}

function formatHeightKey(heightM: number): string {
  return Number.isInteger(heightM) ? String(heightM) : String(heightM);
}

/**
 * PilotDataProvider serves processed NASA PGDA LOLA DEMs, spherical ray-marched
 * horizon masks (0–150 km), and 3-month JPL Horizons ephemerides (Q1 2027) for
 * verified Artemis candidate sites without mixing mock fallback data.
 */
export class PilotDataProvider implements LunarDataProvider {
  readonly kind = 'processed' as const;
  private terrainPromise: Promise<TerrainSource> | null = null;

  async listSites(): Promise<SiteSummary[]> {
    return (pilotSitesRaw as unknown as SiteSummary[]).map((site) => ({
      ...site,
      provenance: { ...site.provenance },
    }));
  }

  async getTerrain(): Promise<TerrainSource> {
    if (!this.terrainPromise) {
      this.terrainPromise = this.loadTerrain().catch((error) => {
        this.terrainPromise = null;
        throw error;
      });
    }
    return this.terrainPromise;
  }

  private async loadTerrain(): Promise<TerrainSource> {
    const manifestResp = await fetch('/data/pilot/terrain_manifest.json');
    if (!manifestResp.ok) {
      throw new Error(`Failed to load terrain manifest (${manifestResp.status})`);
    }
    const manifest = (await manifestResp.json()) as DemManifest;

    const layers: DemLayerData[] = await Promise.all(
      manifest.layers.map(async (meta) => {
        const resp = await fetch(meta.url);
        if (!resp.ok) {
          throw new Error(`Failed to load DEM layer ${meta.id} (${resp.status})`);
        }
        const buffer = await resp.arrayBuffer();
        const data = new Float32Array(buffer);
        if (data.length !== meta.rows * meta.cols) {
          throw new Error(`DEM layer ${meta.id} size mismatch: expected ${meta.rows * meta.cols}, got ${data.length}`);
        }
        return {
          xMinM: meta.xMinM,
          yMaxM: meta.yMaxM,
          spacingM: meta.spacingM,
          rows: meta.rows,
          cols: meta.cols,
          data,
        };
      }),
    );

    const heightAt = createDemHeightAt(layers, manifest.coverage);

    return {
      type: 'heightFunction',
      provenance: { ...manifest.provenance },
      coverage: { ...manifest.coverage },
      heightAt,
      createMeshLoader: () =>
        new WorkerTerrainMeshLoader(
          () =>
            new Worker(new URL('../../terrain/localMesh.worker.ts', import.meta.url), {
              type: 'module',
            }),
          {
            type: 'init',
            layers,
            coverage: manifest.coverage,
            provenance: manifest.provenance,
          },
        ),
    };
  }

  async getHorizonMask(site: SiteLocation, observerHeightM: number): Promise<HorizonMask | null> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }

    const asset = HORIZONS_BY_SITE[site.id];
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
    const terrain = await this.getTerrain();
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

    const ephem = EPHEMERIS_BY_SITE[site.id];
    if (!ephem) {
      throw new RangeError(
        `Processed JPL Horizons ephemeris is outside coverage for "${site.id}". Select Site 01 or Site 04 in static pilot mode.`,
      );
    }

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
