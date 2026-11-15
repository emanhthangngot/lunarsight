import type { HorizonMask, Provenance, SiteSummary } from '../data/contract';
import { DEG_TO_RAD, MOON_RADIUS_M, RAD_TO_DEG, normalizeLongitude, validateCoordinates } from './coordinates';
import { horizonElevationDeg } from './horizon';

export type TerrainHeightLookup = (latDeg: number, lonDegE: number) => number | null;

/**
 * Ray-marches a 1-degree spherical horizon mask (true local ENU North azimuths)
 * up to min(maxRangeLimitM, distance to coverageNorthDeg). Returns null if the
 * observer or any sampled ray point falls outside terrain coverage.
 */
export function rayMarchHorizonMask(
  site: Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>,
  observerHeightM: number,
  heightAt: TerrainHeightLookup,
  coverageNorthDeg: number,
  provenance: Provenance,
  maxRangeLimitM = 150_000,
): HorizonMask | null {
  const point = validateCoordinates(site.latDeg, site.lonDegE);
  if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
    throw new RangeError('Observer height must be finite and nonnegative');
  }
  const groundM = heightAt(point.latDeg, point.lonDegE);
  if (groundM === null) return null;

  const edgeDistanceM = (coverageNorthDeg - point.latDeg) * DEG_TO_RAD * MOON_RADIUS_M;
  const maxRangeM = Math.min(maxRangeLimitM, edgeDistanceM * (1 - 1e-10));
  if (maxRangeM < 25) return null;

  const lat = point.latDeg * DEG_TO_RAD;
  const lon = point.lonDegE * DEG_TO_RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const azimuthsDeg: number[] = [];
  const elevationsDeg: number[] = [];

  for (let az = 0; az < 360; az++) {
    const bearing = az * DEG_TO_RAD;
    const cosBearing = Math.cos(bearing);
    const sinBearing = Math.sin(bearing);
    let highest = -Infinity;
    let distanceM = 25;

    while (true) {
      const angle = distanceM / MOON_RADIUS_M;
      const sinAngle = Math.sin(angle);
      const cosAngle = Math.cos(angle);
      const targetLat = Math.asin(Math.max(-1, Math.min(1, sinLat * cosAngle + cosLat * sinAngle * cosBearing)));
      const targetLon = lon + Math.atan2(sinBearing * sinAngle * cosLat, cosAngle - sinLat * Math.sin(targetLat));
      // Evaluate infinitesimally off the mathematical pole if crossed, matching public pole policy.
      const sampleLatDeg = Math.max(-89.9999999999, targetLat * RAD_TO_DEG);
      const heightM = heightAt(sampleLatDeg, normalizeLongitude(targetLon * RAD_TO_DEG));
      if (heightM === null) return null;
      highest = Math.max(highest, horizonElevationDeg(distanceM, heightM - groundM - observerHeightM));
      if (distanceM === maxRangeM) break;
      distanceM = Math.min(maxRangeM, distanceM + Math.max(25, distanceM * 0.04));
    }
    azimuthsDeg.push(az);
    elevationsDeg.push(highest);
  }

  return {
    siteId: site.id,
    observerHeightM,
    azimuthsDeg,
    elevationsDeg,
    maxRangeM,
    provenance,
  };
}
