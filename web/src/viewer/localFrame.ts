import { DEG_TO_RAD, localEnuBasis, MOON_RADIUS_M } from '../geo';

/** Local scene vector: x = East, y = Up, z = South (−North), metres (contract-3). */
export type LocalVector = readonly [x: number, y: number, z: number];

export interface SurfacePoint {
  latDeg: number;
  lonDegE: number;
  /** Metres above the reference sphere (not above local terrain). */
  heightM: number;
}

/**
 * Unit direction toward a sky body in the local frame. Azimuth is clockwise from local
 * north, elevation above the local sphere-tangent horizontal (contract-3):
 * (cos el · sin az, sin el, −cos el · cos az).
 */
export function bodyDirectionLocal(azDeg: number, elDeg: number): LocalVector {
  const az = azDeg * DEG_TO_RAD;
  const el = elDeg * DEG_TO_RAD;
  const cosEl = Math.cos(el);
  return [cosEl * Math.sin(az), Math.sin(el), -cosEl * Math.cos(az)];
}

function moonFixed(point: SurfacePoint, radiusM: number): LocalVector {
  const lat = point.latDeg * DEG_TO_RAD;
  const lon = point.lonDegE * DEG_TO_RAD;
  const r = radiusM + point.heightM;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)];
}

/**
 * Position of `point` in the local frame of `origin` (the selected site's real ground point):
 * (dot(P−O, E), dot(P−O, U), −dot(P−O, N)) with E/N/U at the origin. Includes lunar curvature.
 * Computed in doubles; only the result is handed to the GPU.
 */
export function toLocal(origin: SurfacePoint, point: SurfacePoint, radiusM = MOON_RADIUS_M): LocalVector {
  const { east, north, up } = localEnuBasis(origin.latDeg, origin.lonDegE);
  const o = moonFixed(origin, radiusM);
  const p = moonFixed(point, radiusM);
  const d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]] as const;
  const dot = (a: readonly number[]) => d[0] * a[0]! + d[1] * a[1]! + d[2] * a[2]!;
  return [dot(east), dot(up), -dot(north)];
}

/** World-space diameter that subtends `angleDeg` at `distanceM`. */
export function angularSizeM(distanceM: number, angleDeg: number): number {
  return 2 * distanceM * Math.tan((angleDeg * DEG_TO_RAD) / 2);
}
