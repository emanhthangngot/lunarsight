import type { EphemerisSeries, HorizonMask } from '../data/contract';
import { interpolateHorizonMask, isVisible } from '../geo/horizon';

export type Visibility = boolean | null;
export interface VisibilitySamples {
  sunVisible: Visibility[];
  earthVisible: Visibility[];
  both: Visibility[];
}
export interface WindowMetrics {
  windowHours: number;
  sunlitPercent: number | null;
  earthVisiblePercent: number | null;
  bothPercent: number | null;
  sunlitHours: number | null;
  earthVisibleHours: number | null;
  bothHours: number | null;
  longestDarknessHours: number | null;
  longestEarthBlackoutHours: number | null;
}
export interface VisibilityAnalysis extends VisibilitySamples { metrics: WindowMetrics }
export interface VisibilityEvent { utcMs: number; remainingHours: number; index: number }
export interface CursorEvents {
  sunset: VisibilityEvent | null;
  sunrise: VisibilityEvent | null;
  earthset: VisibilityEvent | null;
  earthrise: VisibilityEvent | null;
}

/** Intervals are left-held samples [t_i,t_(i+1)); the terminal sample has no
 * extrapolated duration. Any unknown interval makes the affected aggregate null.
 */
function summarizeTrack(times: readonly number[], states: readonly Visibility[]) {
  let visibleHours = 0, longestHidden = 0, hiddenRun = 0;
  let unknown = false;
  for (let i = 0; i + 1 < times.length; i++) {
    const hours = (times[i + 1]! - times[i]!) / 3_600_000;
    if (!Number.isFinite(hours) || hours <= 0) throw new RangeError('Times must be finite and strictly increasing');
    if (states[i] === null) { unknown = true; hiddenRun = 0; }
    else if (states[i]) { visibleHours += hours; hiddenRun = 0; }
    else { hiddenRun += hours; longestHidden = Math.max(longestHidden, hiddenRun); }
  }
  return { visibleHours: unknown ? null : visibleHours, longestHidden: unknown ? null : longestHidden };
}

export function summarizeWindow(times: readonly number[], samples: VisibilitySamples): WindowMetrics {
  const n = times.length;
  if ([samples.sunVisible, samples.earthVisible, samples.both].some((track) => track.length !== n)) {
    throw new RangeError('Visibility and time array sizes differ');
  }
  const windowHours = n < 2 ? 0 : (times[n - 1]! - times[0]!) / 3_600_000;
  const sun = summarizeTrack(times, samples.sunVisible), earth = summarizeTrack(times, samples.earthVisible), both = summarizeTrack(times, samples.both);
  const duration = (value: number | null) => windowHours > 0 ? value : null;
  const percent = (hours: number | null) => windowHours > 0 && hours !== null ? 100 * hours / windowHours : null;
  return {
    windowHours,
    sunlitPercent: percent(sun.visibleHours), earthVisiblePercent: percent(earth.visibleHours), bothPercent: percent(both.visibleHours),
    sunlitHours: duration(sun.visibleHours), earthVisibleHours: duration(earth.visibleHours), bothHours: duration(both.visibleHours),
    longestDarknessHours: duration(sun.longestHidden), longestEarthBlackoutHours: duration(earth.longestHidden),
  };
}

export function analyzeVisibility(series: EphemerisSeries, mask: HorizonMask | null): VisibilityAnalysis {
  const n = series.timesUtcMs.length;
  if ([series.sunAzDeg, series.sunElDeg, series.earthAzDeg, series.earthElDeg].some((values) => values.length !== n)) {
    throw new RangeError('Ephemeris array sizes differ');
  }
  const samples: VisibilitySamples = { sunVisible: [], earthVisible: [], both: [] };
  for (let i = 0; i < n; i++) {
    const sunMask = mask === null ? null : interpolateHorizonMask(mask.azimuthsDeg, mask.elevationsDeg, series.sunAzDeg[i]!);
    const earthMask = mask === null ? null : interpolateHorizonMask(mask.azimuthsDeg, mask.elevationsDeg, series.earthAzDeg[i]!);
    const sun = isVisible(series.sunElDeg[i]!, sunMask), earth = isVisible(series.earthElDeg[i]!, earthMask);
    samples.sunVisible.push(sun); samples.earthVisible.push(earth);
    // Unknown cannot be labelled hidden, even when the other body is hidden.
    samples.both.push(sun === null || earth === null ? null : sun && earth);
  }
  return { ...samples, metrics: summarizeWindow(series.timesUtcMs, samples) };
}

export function nextTransition(times: readonly number[], states: readonly Visibility[], cursorIndex: number, toVisible: boolean): VisibilityEvent | null {
  if (states.length !== times.length || cursorIndex < 0 || cursorIndex >= times.length) return null;
  for (let i = cursorIndex + 1; i < times.length; i++) {
    const previous = states[i - 1], current = states[i];
    // A gap could contain an earlier event; do not claim a later known event is next.
    if (previous === null || current === null) return null;
    if (previous !== current && current === toVisible) {
      return { utcMs: times[i]!, remainingHours: (times[i]! - times[cursorIndex]!) / 3_600_000, index: i };
    }
  }
  return null;
}

export function eventsAtCursor(times: readonly number[], samples: VisibilitySamples, cursorIndex: number): CursorEvents {
  return {
    sunset: nextTransition(times, samples.sunVisible, cursorIndex, false),
    sunrise: nextTransition(times, samples.sunVisible, cursorIndex, true),
    earthset: nextTransition(times, samples.earthVisible, cursorIndex, false),
    earthrise: nextTransition(times, samples.earthVisible, cursorIndex, true),
  };
}
