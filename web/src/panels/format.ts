import type { DataKind } from '../data/contract';
import type { ScenarioInputs } from '../state/scenario';

export function utc(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().replace('.000Z', 'Z').replace('T', ' ') : 'Unavailable';
}
export function number(value: number | null | undefined, unit = '', decimals = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? 'Unknown' : value.toFixed(decimals) + unit;
}
/** Signed difference with units; unknown stays unknown, never zero. */
export function signedNumber(value: number | null, unit = '', decimals = 1): string {
  if (value === null || !Number.isFinite(value)) return 'Unknown';
  const fixed = Math.abs(value).toFixed(decimals);
  if (Number(fixed) === 0) return '0' + (decimals > 0 ? '.' + '0'.repeat(decimals) : '') + unit;
  return (value > 0 ? '+' : '−') + fixed + unit;
}
export function visibility(value: boolean | null | undefined): string { return value === true ? 'Visible' : value === false ? 'Hidden' : 'Unknown'; }
/** "2027-01-01 → 2027-01-31 UTC · 1 h step · 1 m eye height" */
export function windowLabel(inputs: Pick<ScenarioInputs, 'startUtcMs' | 'durationDays' | 'stepSeconds' | 'observerHeightM'>): string {
  const end = inputs.startUtcMs + inputs.durationDays * 86_400_000;
  const step = inputs.stepSeconds % 3600 === 0 ? inputs.stepSeconds / 3600 + ' h' : inputs.stepSeconds % 60 === 0 ? inputs.stepSeconds / 60 + ' min' : inputs.stepSeconds + ' s';
  return `${utc(inputs.startUtcMs).slice(0, 16)} → ${utc(end).slice(0, 16)} UTC · ${step} step · ${inputs.observerHeightM} m eye height`;
}
/** Source wording: processed public NASA products, not a verification claim. */
export function sourceLabel(kind: DataKind): string {
  return kind === 'processed' ? 'NASA-sourced data, processed (PGDA LOLA terrain, JPL Horizons)' : 'Mock data (fictional terrain, analytic Sun/Earth)';
}
