export const MOON_RADIUS_M = 1_737_400;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function normalizeLongitude(lonDegE: number): number {
  if (!Number.isFinite(lonDegE)) throw new RangeError('Longitude must be finite');
  return ((lonDegE % 360) + 360) % 360;
}

/** Exact poles are unsupported: their local north/azimuth is ambiguous. */
export function validateCoordinates(latDeg: number, lonDegE: number): { latDeg: number; lonDegE: number } {
  if (!Number.isFinite(latDeg) || Math.abs(latDeg) >= 90) {
    throw new RangeError('Latitude must be finite and strictly between -90 and 90 degrees');
  }
  return { latDeg, lonDegE: normalizeLongitude(lonDegE) };
}

/** South-pole tangent stereographic plane: +y toward lon 0, +x toward lon 90E. */
export function southPolarForward(latDeg: number, lonDegE: number, radiusM = MOON_RADIUS_M): { xM: number; yM: number } {
  const point = validateCoordinates(latDeg, lonDegE);
  if (!(radiusM > 0) || !Number.isFinite(radiusM)) throw new RangeError('Radius must be positive and finite');
  const rho = 2 * radiusM * Math.tan(Math.PI / 4 + point.latDeg * DEG_TO_RAD / 2);
  const lon = point.lonDegE * DEG_TO_RAD;
  return { xM: rho * Math.sin(lon), yM: rho * Math.cos(lon) };
}

/** The plane origin maps to the mathematical pole; do not use it as an observer. */
export function southPolarInverse(xM: number, yM: number, radiusM = MOON_RADIUS_M): { latDeg: number; lonDegE: number } {
  if (![xM, yM, radiusM].every(Number.isFinite) || radiusM <= 0) throw new RangeError('Invalid projection input');
  const rho = Math.hypot(xM, yM);
  return {
    latDeg: (2 * Math.atan(rho / (2 * radiusM)) - Math.PI / 2) * RAD_TO_DEG,
    lonDegE: rho === 0 ? 0 : normalizeLongitude(Math.atan2(xM, yM) * RAD_TO_DEG),
  };
}
