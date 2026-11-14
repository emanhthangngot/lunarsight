import type { EphemerisSeries, HorizonMask, LunarDataProvider, SiteSummary, TerrainSource } from '../contract';
import { normalizeLongitude, southPolarInverse, validateCoordinates } from '../../geo/coordinates';
import { rayMarchHorizonMask } from '../../geo/horizonRayMarch';
import { subPointToAzEl } from '../../geo/topocentric';
import { createMockTerrain } from './terrain';
import { mockProvenance } from './terrainField';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;
const EPOCH_MS = Date.parse('2026-01-01T00:00:00Z');
const DAY_MS = 86_400_000;
// Deliberately fictional viewing phases, not real solar/lunar positions at epoch.
const SUN_LONGITUDE_AT_EPOCH_DEG = 110;
const SUN_LATITUDE_PHASE_RAD = -Math.PI / 2;

/** Deterministic fictional model, never a measurement or validated ephemeris. */
export class MockDataProvider implements LunarDataProvider {
  readonly kind = 'mock' as const;
  private readonly terrain = createMockTerrain();

  async listSites(): Promise<SiteSummary[]> {
    return [
      { id: 'mock-ridge-a', name: 'Mock Ridge A', x: 12_000, y: 20_000, description: 'Fictional elongated ridge crest.' },
      { id: 'mock-floor-b', name: 'Mock Crater Floor B', x: -24_000, y: 10_000, description: 'Fictional crater floor with surrounding raised rim.' },
      { id: 'mock-massif-c', name: 'Mock Massif C', x: 20_000, y: -25_000, description: 'Fictional high massif.' },
      { id: 'mock-rim-d', name: 'Mock Rim D', x: -40_000, y: 10_000, description: 'Fictional crater rim.' },
      { id: 'mock-plain-e', name: 'Mock Plain E', x: -5_000, y: -48_000, description: 'Fictional rolling plain below the nearby massif.' },
    ].map(({ x, y, ...site }) => ({
      ...site,
      ...southPolarInverse(x, y),
      category: 'mock' as const,
      nameVerified: false,
      provenance: mockProvenance('Fictional site name and coordinates; no catalog identity.'),
    }));
  }

  async getTerrain(): Promise<TerrainSource> {
    // Fresh metadata prevents a consumer from mutating this provider's coverage.
    return { ...this.terrain, provenance: { ...this.terrain.provenance }, coverage: { ...this.terrain.coverage } };
  }

  async getHorizonMask(site: SiteLocation, observerHeightM: number): Promise<HorizonMask | null> {
    return rayMarchHorizonMask(
      site,
      observerHeightM,
      this.terrain.heightAt,
      -84,
      mockProvenance('1-degree ray-marched terrain mask; 25 m initial/near step, growing by 4% of range, up to 150 km clipped to coverage. Curvature d²/(2R); body-centre visibility uses strict elevation > interpolated mask. No refraction; not a power or radio-link assessment.'),
    );
  }

  async getEphemeris(site: SiteLocation, startUtcMs: number, endUtcMs: number, stepSeconds: number, observerHeightM = 0): Promise<EphemerisSeries> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) throw new RangeError('Observer height must be finite and nonnegative');
    if (![startUtcMs, endUtcMs, stepSeconds].every(Number.isFinite) || endUtcMs < startUtcMs || stepSeconds <= 0 || stepSeconds * 1000 < 1) {
      throw new RangeError('Use finite UTC bounds, end >= start, and a step of at least 1 ms');
    }
    const count = Math.floor((endUtcMs - startUtcMs) / (stepSeconds * 1000)) + 1;
    if (!Number.isSafeInteger(count) || count > 1_000_000) throw new RangeError('Ephemeris request exceeds 1,000,000 samples');
    const groundM = this.terrain.heightAt(point.latDeg, point.lonDegE);
    // Outside coverage cannot acquire a fabricated ground height; reject explicitly.
    if (groundM === null) throw new RangeError('Ephemeris observer is outside mock terrain coverage');
    const result: EphemerisSeries = {
      siteId: site.id, frame: 'MOON_ME', startUtcMs, stepSeconds,
      timesUtcMs: [], sunAzDeg: [], sunElDeg: [], earthAzDeg: [], earthElDeg: [],
      provenance: mockProvenance('Analytic sub-points, epoch 2026-01-01 UTC; mock Sun longitude offset 110 degrees E, Sun latitude phase -pi/2 radians; Earth longitude/latitude phases 0. Sun: 29.530589 d longitude / 346.62 d latitude. Earth: 27.5546 d longitude / 27.2122 d latitude. Topocentric finite-distance parallax; observer equipment height ' + observerHeightM + ' m above local terrain. MOON_ME is a mock frame label, not a SPICE frame realization. Visibility convention: center.'),
    };
    const observer = { ...point, heightM: groundM + observerHeightM };
    for (let i = 0; i < count; i++) {
      const utcMs = startUtcMs + i * stepSeconds * 1000;
      const days = (utcMs - EPOCH_MS) / DAY_MS;
      const sun = subPointToAzEl(observer, {
        latDeg: 1.543 * Math.sin(2 * Math.PI * days / 346.62 + SUN_LATITUDE_PHASE_RAD),
        lonDegE: normalizeLongitude(SUN_LONGITUDE_AT_EPOCH_DEG - 360 * days / 29.530589),
        distanceM: 149_597_870_700,
      });
      const earth = subPointToAzEl(observer, {
        latDeg: 6.68 * Math.sin(2 * Math.PI * days / 27.2122),
        lonDegE: 7.9 * Math.sin(2 * Math.PI * days / 27.5546),
        distanceM: 384_400_000,
      });
      result.timesUtcMs.push(utcMs);
      result.sunAzDeg.push(sun.azDeg); result.sunElDeg.push(sun.elDeg);
      result.earthAzDeg.push(earth.azDeg); result.earthElDeg.push(earth.elDeg);
    }
    return result;
  }
}
