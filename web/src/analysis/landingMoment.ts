import type { Visibility } from './visibility';

export type LandingMomentKind =
  /** The cursor should move to `index`. */
  | 'move'
  /** The cursor is already on the first qualifying sample. */
  | 'already'
  /** Every sample is known and none qualifies. */
  | 'none'
  /** No known sample qualifies, but some samples are unknown and might. */
  | 'none-known'
  /** No horizon mask: every sample is unknown. */
  | 'mask-unavailable';

export interface LandingMoment {
  kind: LandingMomentKind;
  /** Sample to show: the qualifying one, otherwise the unchanged cursor. */
  index: number;
}

/**
 * Chooses the time sample for the landing view: the first one at which the Sun and the Earth
 * are both known to be above the terrain horizon. Unknown samples never qualify, and are never
 * reported as "no such sample".
 */
export function planLandingMoment(both: readonly Visibility[], cursorIndex: number, maskAvailable: boolean): LandingMoment {
  if (!maskAvailable) return { kind: 'mask-unavailable', index: cursorIndex };
  const first = both.indexOf(true);
  if (first === -1) return { kind: both.includes(null) ? 'none-known' : 'none', index: cursorIndex };
  return { kind: first === cursorIndex ? 'already' : 'move', index: first };
}
