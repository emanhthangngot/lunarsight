import type { BodyDirection } from './types';

export type VisibilityState = 'visible' | 'hidden' | 'unknown';

export function visibleToState(visible: boolean | null): VisibilityState {
  return visible === true ? 'visible' : visible === false ? 'hidden' : 'unknown';
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
