import { describe, expect, it } from 'vitest';
import { MOON_RADIUS_M, normalizeLongitude, southPolarForward, southPolarInverse, validateCoordinates } from './coordinates';
import { localEnuBasis, subPointToAzEl } from './topocentric';
import { horizonElevationDeg, interpolateHorizonMask, isVisible } from './horizon';

// Authority: task-1/contract-1. Mathematical fixtures, not NASA data.
// These tolerances protect floating-point arithmetic, not scientific accuracy.
describe('coordinate convention and stereographic geometry', () => {
  it.each([[360, 0], [-10, 350], [725, 5], [-360, 0]])('normalizes %s east to %s', (input, expected) => {
    expect(normalizeLongitude(input)).toBe(expected);
  });
  it.each([[90, 0], [-90, 0], [NaN, 0], [0, NaN], [91, 0], [0, Infinity]])('rejects unsupported (%s,%s)', (lat, lon) => {
    expect(() => validateCoordinates(lat, lon)).toThrow(RangeError);
  });
  it.each([[-89.8, 0], [-87, 90], [-84, 359.9], [-88, 231]])('round trips (%s,%s)', (lat, lon) => {
    const xy = southPolarForward(lat, lon);
    const back = southPolarInverse(xy.xM, xy.yM);
    expect(back.latDeg).toBeCloseTo(lat, 9);
    expect(back.lonDegE).toBeCloseTo(lon, 9);
  });
  it('orients +y toward longitude 0 and +x toward 90E', () => {
    const n = southPolarForward(-85, 0), e = southPolarForward(-85, 90);
    expect(n.xM).toBe(0);
    expect(n.yM).toBeGreaterThan(0);
    expect(e.xM).toBeCloseTo(n.yM, 8);
    expect(e.yM).toBeCloseTo(0, 8);
  });
});

describe('finite-distance topocentric directions', () => {
  const observer = { latDeg: 0, lonDegE: 0, heightM: 0 };
  it('has hand-checkable equatorial ENU axes', () => {
    const basis = localEnuBasis(0, 0);
    expect(basis.east[1]).toBe(1);
    expect(basis.north[2]).toBe(1);
    expect(basis.up[0]).toBe(1);
  });
  it('puts a body over the observer at zenith', () => {
    expect(subPointToAzEl(observer, { latDeg: 0, lonDegE: 0, distanceM: 384_400_000 }).elDeg).toBeCloseTo(90, 10);
  });
  it('puts a tangent-line sub-point on the horizon', () => {
    // Right triangle: adjacent R, hypotenuse D; cos(longitude) = R/D.
    const lonDegE = Math.acos(MOON_RADIUS_M / 384_400_000) * 180 / Math.PI;
    const result = subPointToAzEl(observer, { latDeg: 0, lonDegE, distanceM: 384_400_000 });
    expect(result.elDeg).toBeCloseTo(0, 10);
    expect(result.azDeg).toBeCloseTo(90, 10);
  });
  it.each([[45, 0, 0], [0, 45, 90], [-45, 0, 180], [0, 315, 270]])('gets azimuth for (%s,%s)', (latDeg, lonDegE, expectedAz) => {
    expect(subPointToAzEl(observer, { latDeg, lonDegE, distanceM: 384_400_000 }).azDeg).toBeCloseTo(expectedAz, 10);
  });
  it('places a near-side sub-Earth point north above a south-polar horizon', () => {
    const result = subPointToAzEl({ latDeg: -89, lonDegE: 0, heightM: 0 }, { latDeg: 0, lonDegE: 0, distanceM: 384_400_000 });
    expect(result.azDeg).toBeCloseTo(0, 10);
    // 1 degree geocentric elevation minus approximately 0.259 degrees parallax.
    expect(result.elDeg).toBeCloseTo(0.741, 3);
  });
  it('lowers Earth by parallax, with greater depression at greater observer height', () => {
    const earth = { latDeg: 0, lonDegE: 90, distanceM: 384_400_000 };
    const ground = subPointToAzEl(observer, earth);
    expect(ground.elDeg).toBeCloseTo(-0.259, 3);
    expect(subPointToAzEl({ ...observer, heightM: 10_000 }, earth).elDeg).toBeLessThan(ground.elDeg);
    expect(subPointToAzEl(observer, { ...earth, distanceM: 1e15 }).elDeg).toBeCloseTo(0, 6);
  });
});

describe('terrain obstruction semantics', () => {
  it('includes curvature below the tangent horizontal', () => {
    // At d=1000 m, R=500000 m, curvature drop is 1 m.
    expect(horizonElevationDeg(1000, 1001, 500000)).toBeCloseTo(45, 10);
    expect(horizonElevationDeg(1000, 0, 500000)).toBeCloseTo(-0.0572957604, 9);
  });
  it('interpolates across 360/0, including shifted sample origins', () => {
    expect(interpolateHorizonMask([0, 90, 180, 270], [10, 0, 0, 2], 315)).toBe(6);
    expect(interpolateHorizonMask([0, 90, 180, 270], [10, 0, 0, 2], -45)).toBe(6);
    expect(interpolateHorizonMask([30, 150, 270], [6, 0, 2], 0)).toBe(5);
    expect(interpolateHorizonMask([0, 90, 180, 270], [10, 0, 0, 2], 360)).toBe(10);
  });
  it('preserves unknown and requires the centre strictly above terrain', () => {
    expect(interpolateHorizonMask([], [], 20)).toBeNull();
    expect(isVisible(3, 3)).toBe(false);
    expect(isVisible(3.01, 3)).toBe(true);
    expect(isVisible(2.99, 3)).toBe(false);
    expect(isVisible(3, null)).toBeNull();
    expect(isVisible(null, 0)).toBeNull();
  });
});
