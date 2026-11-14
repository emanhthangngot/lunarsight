import { MOON_RADIUS_M, RAD_TO_DEG, normalizeLongitude } from './coordinates';

/** Small-angle curvature model accepted by mock v1: d is surface arc distance;
 * deltaHeightM = target terrain height - observer absolute height.
 */
export function horizonElevationDeg(distanceM: number, deltaHeightM: number, radiusM = MOON_RADIUS_M): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0 || !Number.isFinite(deltaHeightM) || !Number.isFinite(radiusM) || radiusM <= 0) {
    throw new RangeError('Invalid horizon geometry');
  }
  return Math.atan2(deltaHeightM - distanceM * distanceM / (2 * radiusM), distanceM) * RAD_TO_DEG;
}

/** Ascending mask samples in [0,360); interpolation bridges the last/first pair. */
export function interpolateHorizonMask(azimuthsDeg: readonly number[], elevationsDeg: readonly number[], azDeg: number): number | null {
  const az = normalizeLongitude(azDeg);
  if (azimuthsDeg.length !== elevationsDeg.length) throw new RangeError('Mask array sizes differ');
  const n = azimuthsDeg.length;
  if (n === 0) return null;
  // Validate at this public boundary; callers may eventually load processed files.
  for (let i = 0; i < n; i++) {
    const a = azimuthsDeg[i]!;
    if (!Number.isFinite(a) || a < 0 || a >= 360 || !Number.isFinite(elevationsDeg[i]) || (i > 0 && a <= azimuthsDeg[i - 1]!)) {
      throw new RangeError('Mask samples must be finite, ascending and within [0,360)');
    }
  }
  if (n === 1) return elevationsDeg[0]!;
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (azimuthsDeg[mid]! <= az) lo = mid + 1;
    else hi = mid;
  }
  const left = (lo + n - 1) % n, right = lo % n;
  const x0 = azimuthsDeg[left]!;
  const x1 = azimuthsDeg[right]! + (right === 0 ? 360 : 0);
  const x = az < x0 ? az + 360 : az;
  const fraction = (x - x0) / (x1 - x0);
  return elevationsDeg[left]! + fraction * (elevationsDeg[right]! - elevationsDeg[left]!);
}

/** Centre must be strictly above the terrain mask. Missing remains unknown. */
export function isVisible(elDeg: number | null, maskElDeg: number | null): boolean | null {
  if (elDeg === null || maskElDeg === null || !Number.isFinite(elDeg) || !Number.isFinite(maskElDeg)) return null;
  return elDeg > maskElDeg;
}
