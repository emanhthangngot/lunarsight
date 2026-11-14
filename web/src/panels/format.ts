export function utc(value: number | undefined): string {
  return value !== undefined && Number.isFinite(value) && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString().replace('.000Z', 'Z').replace('T', ' ') : 'Unavailable';
}
export function number(value: number | null | undefined, unit = '', decimals = 1): string {
  return value === null || value === undefined || !Number.isFinite(value) ? 'Unknown' : value.toFixed(decimals) + unit;
}
export function visibility(value: boolean | null | undefined): string { return value === true ? 'Visible' : value === false ? 'Hidden' : 'Unknown'; }
