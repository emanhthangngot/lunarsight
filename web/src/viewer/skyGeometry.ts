import { localEnuBasis, type Vector3 } from '../geo';
import type { BodyDirection } from './types';

/** East/north/up unit vector for azimuth (clockwise from north) and elevation above the local horizontal. */
export function azElToEnu(azDeg: number, elDeg: number): Vector3 {
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const cosEl = Math.cos(el);
  return [Math.sin(az) * cosEl, Math.cos(az) * cosEl, Math.sin(el)];
}

/**
 * Unit vector toward a body in Moon-fixed axes (x at 0N/0E, y at 0N/90E, z north),
 * which is the same fixed frame Cesium uses for `Ellipsoid.MOON`.
 */
export function skyDirectionFixed(latDeg: number, lonDegE: number, azDeg: number, elDeg: number): Vector3 {
  const { east, north, up } = localEnuBasis(latDeg, lonDegE);
  const [e, n, u] = azElToEnu(azDeg, elDeg);
  return [
    e * east[0] + n * north[0] + u * up[0],
    e * east[1] + n * north[1] + u * up[1],
    e * east[2] + n * north[2] + u * up[2],
  ];
}

/** Perspective size in CSS pixels, independent of drawing-buffer/DPR scaling.
 * The image diameter includes any decorative padding. Inputs are positive;
 * verticalFovRad is the camera's vertical field of view, strictly below pi.
 */
export function billboardDiameterPixels(diameterM: number, distanceM: number, verticalFovRad: number, viewportHeightPx: number): number {
  return diameterM * viewportHeightPx / (2 * distanceM * Math.tan(verticalFovRad / 2));
}

export function formatSigned(valueDeg: number): string {
  return (valueDeg >= 0 ? '+' : '−') + Math.abs(valueDeg).toFixed(1) + '°';
}

/** Wording is deliberately about the terrain horizon, not power or radio-link performance. */
export function visibilityText(visible: boolean | null): string {
  if (visible === true) return 'visible above terrain horizon';
  if (visible === false) return 'hidden below terrain horizon';
  return 'visibility unknown';
}

export function describeBody(name: string, body: BodyDirection | null): string {
  if (!body) return `${name}: no time cursor`;
  return `${name} az ${body.azDeg.toFixed(1)}° el ${formatSigned(body.elDeg)} — ${visibilityText(body.visible)}`;
}
