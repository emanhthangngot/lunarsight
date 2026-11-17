import type { Visibility } from './visibility';

/**
 * First sample at which the Sun and the Earth are both known to be above the terrain horizon.
 * Unknown samples never qualify; null means the window has no such sample.
 */
export function firstBothVisibleIndex(both: readonly Visibility[]): number | null {
  const index = both.indexOf(true);
  return index === -1 ? null : index;
}
