import { DEG_TO_RAD, MOON_RADIUS_M, RAD_TO_DEG, normalizeLongitude, validateCoordinates } from './coordinates';

export type Vector3 = readonly [number, number, number];
export interface EnuBasis { east: Vector3; north: Vector3; up: Vector3 }
export interface SurfaceObserver { latDeg: number; lonDegE: number; heightM: number }
export interface BodySubPoint { latDeg: number; lonDegE: number; distanceM: number }

/** Moon-fixed Cartesian axes: x at (0,0E), y at (0,90E), z north. */
export function localEnuBasis(latDeg: number, lonDegE: number): EnuBasis {
  const point = validateCoordinates(latDeg, lonDegE);
  const lat = point.latDeg * DEG_TO_RAD;
  const lon = point.lonDegE * DEG_TO_RAD;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
  return {
    east: [-sinLon, cosLon, 0],
    north: [-sinLat * cosLon, -sinLat * sinLon, cosLat],
    up: [cosLat * cosLon, cosLat * sinLon, sinLat],
  };
}

const dot = (a: Vector3, b: Vector3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Height is absolute metres above the reference sphere, not above terrain.
 * Distance is body-centre to Moon-centre. Subtract the observer before projecting
 * into ENU: this includes finite-distance parallax (especially important for Earth).
 */
export function subPointToAzEl(observer: SurfaceObserver, body: BodySubPoint, radiusM = MOON_RADIUS_M): { azDeg: number; elDeg: number } {
  const basis = localEnuBasis(observer.latDeg, observer.lonDegE);
  if (!Number.isFinite(observer.heightM) || !Number.isFinite(radiusM) || radiusM <= 0 || radiusM + observer.heightM <= 0) {
    throw new RangeError('Invalid observer radius/height');
  }
  if (!Number.isFinite(body.latDeg) || Math.abs(body.latDeg) > 90 || !Number.isFinite(body.distanceM) || body.distanceM <= 0) {
    throw new RangeError('Invalid body sub-point/distance');
  }
  const lat = body.latDeg * DEG_TO_RAD;
  const lon = normalizeLongitude(body.lonDegE) * DEG_TO_RAD;
  const r = radiusM + observer.heightM;
  const offset: Vector3 = [
    body.distanceM * Math.cos(lat) * Math.cos(lon) - r * basis.up[0],
    body.distanceM * Math.cos(lat) * Math.sin(lon) - r * basis.up[1],
    body.distanceM * Math.sin(lat) - r * basis.up[2],
  ];
  if (Math.hypot(...offset) === 0) throw new RangeError('Body coincides with observer');
  const east = dot(offset, basis.east), north = dot(offset, basis.north);
  return {
    // Azimuth at zenith/nadir has no physical meaning; conventionally return 0.
    azDeg: Math.hypot(east, north) <= body.distanceM * 1e-14 ? 0 : normalizeLongitude(Math.atan2(east, north) * RAD_TO_DEG),
    elDeg: Math.atan2(dot(offset, basis.up), Math.hypot(east, north)) * RAD_TO_DEG,
  };
}
