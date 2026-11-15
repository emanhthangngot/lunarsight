import type { EphemerisObserver, EphemerisSeries, HorizonMask, LunarDataProvider, Provenance, SiteSummary, TerrainSource } from '../contract';
import { validateCoordinates } from '../../geo/coordinates';
import { rayMarchHorizonMask } from '../../geo/horizonRayMarch';
import { createLazyDemTerrainSource, type DemManifest, type LazyDemTerrainSource } from './demTerrain';
import pilotSitesRaw from './sites.json';
import observerMetadataRaw from './observerMetadata.json';
import { generatedPresetClaims, generatedTerrainClaims, HORIZON_METHOD, TERRAIN_CONTENT_POLICY, type PresetDependencyClaims } from './terrainDependency';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;

interface PrecomputedHorizonAsset extends PresetDependencyClaims {
  siteId: string;
  azimuthsDeg: number[];
  maxRangeM: number;
  heights: Record<string, number[]>;
  provenance: Provenance;
  observer?: {
    latDeg: number;
    lonDegE: number;
    groundHeightM: number;
    observerHeightsM: number[];
    datumStatus: string;
    metadataOrigin: string;
  } | null;
}

type PrecomputedEphemerisAsset = EphemerisSeries & PresetDependencyClaims;

function checkGeneratedGround(recorded: number, current: number | null): void {
  if (!Number.isFinite(recorded) || current === null ||
      Math.abs(recorded - current) > 8 * Number.EPSILON * Math.max(1, Math.abs(recorded), Math.abs(current))) {
    throw new Error('Generated preset observer ground does not match the current terrain dependency.');
  }
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
const LEGACY_OBSERVERS = observerMetadataRaw.sites as unknown as Record<string, EphemerisObserver>;

function sameCoordinate(a: number, b: number): boolean {
  // Round-off allowance only; not an accepted geographic/scientific tolerance.
  return Math.abs(a - b) <= 8 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b));
}

function canonicalObserver(site: SiteLocation): SiteSummary | undefined {
  const point = validateCoordinates(site.latDeg, site.lonDegE);
  const canonical = CATALOG_SITES.find((candidate) => candidate.id === site.id);
  if (canonical) {
    const expected = validateCoordinates(canonical.latDeg, canonical.lonDegE);
    if (!sameCoordinate(point.latDeg, expected.latDeg) || !sameCoordinate(point.lonDegE, expected.lonDegE)) {
      throw new RangeError(`Site ID "${site.id}" does not match its canonical observer coordinates; use an explicit custom location.`);
    }
  }
  return canonical;
}

function recordedObserver(site: SiteSummary, series: EphemerisSeries): EphemerisObserver {
  const observer = series.observer ?? LEGACY_OBSERVERS[site.id];
  if (!observer || observer.datumStatus !== 'conditional' || observer.observerHeightM !== 1) {
    throw new RangeError(`Recorded 1 m observer metadata is unavailable for "${site.id}".`);
  }
  const point = validateCoordinates(observer.latDeg, observer.lonDegE);
  const expected = validateCoordinates(site.latDeg, site.lonDegE);
  if (!sameCoordinate(point.latDeg, expected.latDeg) || !sameCoordinate(point.lonDegE, expected.lonDegE)) {
    throw new RangeError(`Ephemeris observer metadata does not match "${site.id}".`);
  }
  for (const value of [observer.groundHeightM, observer.ellipsoidAltitudeKm]) {
    if (value !== null && !Number.isFinite(value)) throw new Error('Invalid recorded observer altitude');
  }
  if (observer.metadataOrigin === 'legacy-pipeline-height') {
    if (observer.groundHeightM !== null || observer.ellipsoidAltitudeKm !== null) {
      throw new Error('Legacy observer ground/altitude were not recorded and must remain null');
    }
  } else if ((observer.metadataOrigin !== 'pipeline-record' && observer.metadataOrigin !== 'runtime-dem-query') ||
      observer.groundHeightM === null || observer.ellipsoidAltitudeKm === null) {
    throw new Error('Invalid or incomplete recorded observer provenance');
  }
  return { ...observer };
}

function validateSeries(series: EphemerisSeries, siteId: string): void {
  const count = series.timesUtcMs.length;
  if (series.siteId !== siteId || series.frame !== 'MOON_ME' || count === 0 ||
      !Number.isFinite(series.stepSeconds) || series.stepSeconds <= 0 ||
      !series.timesUtcMs.every((time, index) => Number.isSafeInteger(time) && time === series.startUtcMs + index * series.stepSeconds * 1000)) {
    throw new Error(`Invalid or nonuniform processed ephemeris for "${siteId}"`);
  }
  for (const values of [series.sunAzDeg, series.sunElDeg, series.earthAzDeg, series.earthElDeg]) {
    if (values.length !== count || !values.every(Number.isFinite)) {
      throw new Error(`Missing/nonfinite ephemeris samples for "${siteId}"; no zero angles substituted.`);
    }
  }
}

/**
 * PilotDataProvider serves processed NASA PGDA LOLA DEMs, spherical ray-marched
 * horizon masks (0–150 km), and 3-month JPL Horizons ephemerides (Q1 2027) for
 * the full Artemis south-polar candidate site catalog, lazily loading per-site assets.
 */
export class PilotDataProvider implements LunarDataProvider {
  readonly kind = 'processed' as const;
  readonly supportedObserverHeightsM = [1] as const;
  private terrainPromise: Promise<LazyDemTerrainSource> | null = null;
  private manifestPromise: Promise<DemManifest> | null = null;
  private readonly horizonCache = new Map<string, Promise<PrecomputedHorizonAsset | null>>();
  private readonly ephemerisCache = new Map<string, Promise<PrecomputedEphemerisAsset>>();

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

  private getManifest(): Promise<DemManifest> {
    if (!this.manifestPromise) {
      this.manifestPromise = fetch('/data/pilot/terrain_manifest.json').then(async (response) => {
        if (!response.ok) throw new Error(`Failed to load terrain manifest (${response.status})`);
        return (await response.json()) as DemManifest;
      }).catch((reason) => { this.manifestPromise = null; throw reason; });
    }
    return this.manifestPromise;
  }

  private async loadTerrain(): Promise<LazyDemTerrainSource> {
    const manifest = await this.getManifest();
    return createLazyDemTerrainSource(manifest, (meta) => meta.url);
  }

  private async checkedPresetTerrain(asset: PresetDependencyClaims): Promise<LazyDemTerrainSource | null> {
    const manifest = await this.getManifest();
    const generatedTerrain = generatedTerrainClaims(manifest);
    const generatedPreset = generatedPresetClaims(asset);
    if (!generatedTerrain && !generatedPreset) return null;
    if (!generatedTerrain || !generatedPreset || asset.terrainContentHashPolicy !== TERRAIN_CONTENT_POLICY) {
      throw new Error('Generated preset/terrain dependencies are incomplete or incompatible; legacy data is not generated proof.');
    }
    const terrain = await this.getLazyTerrain();
    const actual = await terrain.verifyGeneratedDependency();
    if (!actual || typeof asset.terrainContentHash !== 'string' || asset.terrainContentHash.toLowerCase() !== actual) {
      throw new Error('Generated preset terrain dependency does not match the current actual DEM pack.');
    }
    return terrain;
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

  private loadPrecomputedEphemeris(siteId: string): Promise<PrecomputedEphemerisAsset> {
    let cached = this.ephemerisCache.get(siteId);
    if (!cached) {
      cached = fetch(`/data/pilot/ephemeris_${siteId}.json`)
        .then(async (resp) => {
          if (!resp.ok) {
            throw new Error(`Failed to load JPL Horizons asset for "${siteId}" (${resp.status})`);
          }
          return (await resp.json()) as PrecomputedEphemerisAsset;
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
    canonicalObserver(site);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }

    const asset = await this.loadPrecomputedHorizon(site.id);
    const presetElevations = asset?.heights[formatHeightKey(observerHeightM)];
    if (asset && presetElevations) {
      if (asset.siteId !== site.id || asset.azimuthsDeg.length === 0 ||
          !Number.isFinite(asset.maxRangeM) || asset.maxRangeM <= 0 || asset.maxRangeM > 150000 ||
          asset.azimuthsDeg.length !== presetElevations.length ||
          asset.azimuthsDeg.some((azimuth, index) => !Number.isFinite(azimuth) || azimuth < 0 || azimuth >= 360 || (index > 0 && azimuth <= asset.azimuthsDeg[index - 1]!)) ||
          !presetElevations.every(Number.isFinite)) {
        throw new Error(`Invalid processed horizon samples for "${site.id}".`);
      }
      const generatedTerrain = await this.checkedPresetTerrain(asset);
      if (generatedTerrain) {
        const observer = asset.observer;
        const observerPoint = observer && validateCoordinates(observer.latDeg, observer.lonDegE);
        if (!observer || !observerPoint || observer.metadataOrigin !== 'pipeline-record' || observer.datumStatus !== 'conditional' ||
            asset.horizonMethod !== HORIZON_METHOD ||
            !sameCoordinate(observerPoint.latDeg, point.latDeg) || !sameCoordinate(observerPoint.lonDegE, point.lonDegE) ||
            !Array.isArray(observer.observerHeightsM)) {
          throw new Error('Generated horizon observer/method metadata is incompatible with the requested observer.');
        }
        const heights = Object.keys(asset.heights).map(Number);
        if (new Set(observer.observerHeightsM).size !== observer.observerHeightsM.length ||
            observer.observerHeightsM.length !== heights.length ||
            heights.some((height) => !Number.isFinite(height) || height < 0 || height > 1000 || !observer.observerHeightsM.includes(height)) ||
            Object.keys(asset.heights).some((key) => String(Number(key)) !== key) ||
            !observer.observerHeightsM.includes(observerHeightM)) {
          throw new Error('Generated horizon height records do not agree with its preset samples.');
        }
        checkGeneratedGround(observer.groundHeightM, generatedTerrain.heightAt(point.latDeg, point.lonDegE));
      }
      return {
        siteId: site.id,
        observerHeightM,
        azimuthsDeg: asset.azimuthsDeg,
        elevationsDeg: presetElevations,
        maxRangeM: asset.maxRangeM,
        provenance: {
          ...asset.provenance,
          notes: generatedTerrain
            ? 'Conditional generated horizon; current terrain/observer dependency checked in software, not physical science validation.'
            : `${asset.provenance.notes ?? ''} Legacy retained preset; original generation terrain/ground dependency is unrecorded, not generated-pack proof.`,
        },
      };
    }

    // Arbitrary heights or custom south-polar coordinates ray-march the real loaded PGDA DEM.
    const terrain = await this.getLazyTerrain();
    await terrain.ensureLayersFor(point.latDeg, point.lonDegE);
    await terrain.verifyGeneratedDependency();
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
    observerHeightM = 1,
  ): Promise<EphemerisSeries> {
    const canonical = canonicalObserver(site);
    if (!Number.isFinite(observerHeightM) || observerHeightM !== 1) {
      throw new RangeError('Static pilot ephemerides support only the recorded 1 m observer height. Use the API for another height.');
    }
    if (![startUtcMs, endUtcMs, stepSeconds].every(Number.isFinite) || endUtcMs < startUtcMs || stepSeconds <= 0 || stepSeconds * 1000 < 1) {
      throw new RangeError('Use finite UTC bounds, end >= start, and a step of at least 1 ms');
    }
    if (!canonical) {
      throw new RangeError(
        `Processed JPL Horizons ephemeris is outside coverage for "${site.id}". Select a catalog site in static pilot mode.`,
      );
    }
    const ephem = await this.loadPrecomputedEphemeris(site.id);
    validateSeries(ephem, site.id);
    const observer = recordedObserver(canonical, ephem);
    const generatedTerrain = await this.checkedPresetTerrain(ephem);
    if (generatedTerrain) {
      const registryObserver = LEGACY_OBSERVERS[site.id];
      if (!ephem.observer || !registryObserver ||
          registryObserver.latDeg !== observer.latDeg || registryObserver.lonDegE !== observer.lonDegE ||
          registryObserver.observerHeightM !== observer.observerHeightM ||
          registryObserver.groundHeightM !== observer.groundHeightM ||
          registryObserver.ellipsoidAltitudeKm !== observer.ellipsoidAltitudeKm ||
          registryObserver.datumStatus !== observer.datumStatus ||
          registryObserver.metadataOrigin !== observer.metadataOrigin) {
        throw new Error('Generated celestial observer is missing from or conflicts with its metadata registry.');
      }
      if (observer.metadataOrigin !== 'pipeline-record' || observer.groundHeightM === null || observer.ellipsoidAltitudeKm === null) {
        throw new Error('Generated celestial series requires its actual recorded pipeline observer.');
      }
      checkGeneratedGround(observer.groundHeightM, generatedTerrain.heightAt(observer.latDeg, observer.lonDegE));
      const nominal = (observer.groundHeightM + observer.observerHeightM) / 1000;
      const recorded = observer.ellipsoidAltitudeKm;
      const roundoff = 8 * Number.EPSILON * Math.max(1, Math.abs(nominal), Math.abs(recorded));
      const scaled = recorded * 100000;
      // Half one five-decimal kilometre step is query quantization, not an
      // accepted physical datum tolerance or a reconstructed legacy altitude.
      if (Math.abs(recorded - nominal) > 0.000005 + roundoff ||
          Math.abs(scaled - Math.round(scaled)) > 8 * Number.EPSILON * Math.max(1, Math.abs(scaled))) {
        throw new Error('Generated celestial altitude does not match its recorded five-decimal pipeline query.');
      }
    }
    const pilotStartMs = ephem.timesUtcMs[0]!;
    const pilotEndMs = ephem.timesUtcMs.at(-1)!;
    if (startUtcMs < pilotStartMs || endUtcMs > pilotEndMs) {
      throw new RangeError(
        `Requested UTC window is outside processed coverage (${new Date(pilotStartMs).toISOString().slice(0, 10)} to ${new Date(pilotEndMs).toISOString().slice(0, 10)} UTC).`,
      );
    }
    const count = Math.floor((endUtcMs - startUtcMs) / (stepSeconds * 1000)) + 1;
    if (!Number.isSafeInteger(count) || count > 1_000_000) throw new RangeError('Ephemeris request exceeds 1,000,000 samples');
    const timesUtcMs: number[] = [], sunAzDeg: number[] = [], sunElDeg: number[] = [], earthAzDeg: number[] = [], earthElDeg: number[] = [];
    const pilotStepMs = ephem.stepSeconds * 1000;
    for (let index = 0; index < count; index++) {
      const time = startUtcMs + index * stepSeconds * 1000;
      timesUtcMs.push(time);
      const floatIndex = (time - pilotStartMs) / pilotStepMs;
      const i0 = Math.floor(floatIndex), i1 = Math.min(ephem.timesUtcMs.length - 1, i0 + 1);
      const alpha = floatIndex - i0;
      sunAzDeg.push(interpolateAngleDeg(ephem.sunAzDeg[i0]!, ephem.sunAzDeg[i1]!, alpha));
      sunElDeg.push(ephem.sunElDeg[i0]! + alpha * (ephem.sunElDeg[i1]! - ephem.sunElDeg[i0]!));
      earthAzDeg.push(interpolateAngleDeg(ephem.earthAzDeg[i0]!, ephem.earthAzDeg[i1]!, alpha));
      earthElDeg.push(ephem.earthElDeg[i0]! + alpha * (ephem.earthElDeg[i1]! - ephem.earthElDeg[i0]!));
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
      observer,
      provenance: {
        ...ephem.provenance,
        notes: `${generatedTerrain ? 'Generated-record terrain/observer dependency checked; ' : 'Legacy retained series; '}source-derived ${canonical.name}; hourly precomputed apparent directions interpolated to the requested cadence, at recorded 1 m AGL. ${observer.groundHeightM === null ? 'Original queried ground/ellipsoid altitude were not retained and remain unknown.' : 'Observer altitude is retained in the generation record.'} Datum/frame compatibility remains conditional, not flight validation.`,
      },
    };
  }
}
