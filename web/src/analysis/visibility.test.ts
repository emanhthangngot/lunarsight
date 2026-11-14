import { describe, expect, it } from 'vitest';
import type { EphemerisSeries, HorizonMask } from '../data/contract';
import { analyzeVisibility, eventsAtCursor, nextTransition, summarizeWindow } from './visibility';

const provenance = { kind: 'mock' as const, source: 'Mathematical test fixture', version: '1', generatedAt: '2026-01-01T00:00:00Z', notes: 'Synthetic, not JPL/LOLA.' };
const mask: HorizonMask = { siteId: 'test', observerHeightM: 0, azimuthsDeg: [0, 90, 180, 270], elevationsDeg: [0, 0, 0, 0], maxRangeM: 1000, provenance };
function series(sun: boolean[], earth: boolean[]): EphemerisSeries {
  return { siteId: 'test', frame: 'MOON_ME', startUtcMs: 0, stepSeconds: 3600, timesUtcMs: sun.map((_, i) => i * 3_600_000), sunAzDeg: sun.map(() => 0), earthAzDeg: earth.map(() => 0), sunElDeg: sun.map((v) => v ? 1 : -1), earthElDeg: earth.map((v) => v ? 1 : -1), provenance };
}

describe('sampled visibility and duration contracts (task 2, FR-008/009)', () => {
  it('uses the actual intersection, bounded by the marginals on common intervals', () => {
    const result = analyzeVisibility(series([true, true, false, false, true], [true, false, true, false, true]), mask);
    expect(result.metrics.sunlitPercent).toBe(50);
    expect(result.metrics.earthVisiblePercent).toBe(50);
    expect(result.metrics.bothPercent).toBe(25);
    expect(result.metrics.sunlitHours).toBe(2);
    expect(result.metrics.earthVisibleHours).toBe(2);
    expect(result.metrics.bothHours).toBe(1);
    const sun = result.metrics.sunlitPercent! / 100, earth = result.metrics.earthVisiblePercent! / 100, both = result.metrics.bothPercent! / 100;
    expect(both).toBeLessThanOrEqual(Math.min(sun, earth));
    expect(both).toBeGreaterThanOrEqual(sun + earth - 1);
    const forcedOverlap = analyzeVisibility(series([true, true, true, false, true], [true, true, false, true, true]), mask).metrics;
    expect(forcedOverlap.sunlitPercent).toBe(75);
    expect(forcedOverlap.earthVisiblePercent).toBe(75);
    expect(forcedOverlap.bothPercent).toBe(50);
    expect(forcedOverlap.bothPercent!).toBeGreaterThanOrEqual(forcedOverlap.sunlitPercent! + forcedOverlap.earthVisiblePercent! - 100);
  });
  it('clips leading and trailing hidden runs to the window without a phantom final step', () => {
    const leading = analyzeVisibility(series([false, false, true, false, false], [false, true, true, false, false]), mask);
    expect(leading.metrics.longestDarknessHours).toBe(2);
    expect(leading.metrics.longestEarthBlackoutHours).toBe(1);
    const trailing = analyzeVisibility(series([true, false, false, false, false], [false, false, false, false, false]), mask);
    expect(trailing.metrics.longestDarknessHours).toBe(3);
    expect(trailing.metrics.longestEarthBlackoutHours).toBe(4);
    expect(trailing.metrics.windowHours).toBe(4);
  });
  it('weights irregular final intervals by elapsed time, not sample count', () => {
    const result = summarizeWindow([0, 3_600_000, 10_800_000, 14_400_000], { sunVisible: [true, false, false, true], earthVisible: [true, true, true, true], both: [true, false, false, true] });
    expect(result.sunlitPercent).toBe(25);
    expect(result.sunlitHours).toBe(1);
    expect(result.longestDarknessHours).toBe(3);
  });
  it('interpolates mask elevations through north, not across a discontinuity', () => {
    const input = series([true, true], [true, true]);
    input.sunAzDeg = [315, 315]; input.sunElDeg = [5, 6.1];
    expect(analyzeVisibility(input, { ...mask, elevationsDeg: [10, 0, 0, 2] }).sunVisible).toEqual([false, true]);
  });
  it('propagates absent mask to unknown samples, metrics and events', () => {
    const result = analyzeVisibility(series([true, false, true], [false, true, false]), null);
    expect(result.sunVisible).toEqual([null, null, null]);
    expect(result.earthVisible).toEqual([null, null, null]);
    expect(result.both).toEqual([null, null, null]);
    expect(result.metrics.sunlitPercent).toBeNull();
    expect(result.metrics.bothHours).toBeNull();
    expect(result.metrics.longestDarknessHours).toBeNull();
    expect(eventsAtCursor([0, 3_600_000, 7_200_000], result, 0)).toEqual({ sunset: null, sunrise: null, earthset: null, earthrise: null });
  });
  it('does not divide away unknown intervals or bridge a gap to invent a next event', () => {
    const result = summarizeWindow([0, 3_600_000, 7_200_000], { sunVisible: [true, null, true], earthVisible: [true, true, true], both: [true, null, true] });
    expect(result.sunlitPercent).toBeNull();
    expect(result.earthVisiblePercent).toBe(100);
    expect(nextTransition([0, 1, 2, 3], [true, null, true, false], 0, false)).toBeNull();
  });
  it('finds cursor-relative events at sample boundaries and returns null beyond the window', () => {
    const input = series([true, false, false, true, true], [true, true, false, false, true]);
    const result = analyzeVisibility(input, mask);
    const events = eventsAtCursor(input.timesUtcMs, result, 0);
    expect(events.sunset).toEqual({ utcMs: 3_600_000, remainingHours: 1, index: 1 });
    expect(events.sunrise?.remainingHours).toBe(3);
    expect(events.earthset?.remainingHours).toBe(2);
    expect(events.earthrise?.remainingHours).toBe(4);
    expect(eventsAtCursor(input.timesUtcMs, result, 4)).toEqual({ sunset: null, sunrise: null, earthset: null, earthrise: null });
    expect(nextTransition(input.timesUtcMs, [true, true, true, true, true], 0, false)).toBeNull();
  });
});
