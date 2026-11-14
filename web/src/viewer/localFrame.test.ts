import { describe, expect, it } from 'vitest';
import { MOON_RADIUS_M, subPointToAzEl } from '../geo';
import { bodyDirectionLocal, toLocal } from './localFrame';

// Protects the contract-3 local frame used for terrain markers, camera and sky bodies.
// A sign or axis error would put the Sun, Earth or sites on the wrong side of the scene.
describe('local frame (x East, y Up, z South)', () => {
  const origin = { latDeg: -88.6, lonDegE: 284, heightM: 1030 };

  it('maps azimuth clockwise from north and elevation up', () => {
    const north = bodyDirectionLocal(0, 0);
    expect(north[0]).toBeCloseTo(0, 12);
    expect(north[1]).toBeCloseTo(0, 12);
    expect(north[2]).toBeCloseTo(-1, 12);
    const east = bodyDirectionLocal(90, 0);
    expect(east[0]).toBeCloseTo(1, 12);
    expect(east[2]).toBeCloseTo(0, 12);
    expect(bodyDirectionLocal(217, 90)[1]).toBeCloseTo(1, 12);
  });

  it('places the origin at zero and a point straight above on +y', () => {
    expect(toLocal(origin, origin).map((v) => Math.abs(v) < 1e-6)).toEqual([true, true, true]);
    const above = toLocal(origin, { ...origin, heightM: origin.heightM + 2.5 });
    expect(above[0]).toBeCloseTo(0, 6);
    expect(above[1]).toBeCloseTo(2.5, 6);
    expect(above[2]).toBeCloseTo(0, 6);
  });

  it('keeps lunar curvature: a point 10 km due north at the same height lies below the tangent plane', () => {
    const d = 10_000;
    const north = toLocal(origin, { latDeg: origin.latDeg + (d / (MOON_RADIUS_M + origin.heightM)) * (180 / Math.PI), lonDegE: origin.lonDegE, heightM: origin.heightM });
    expect(north[0]).toBeCloseTo(0, 3);
    expect(north[2]).toBeLessThan(-9_990);
    // Drop ≈ d² / 2R (≈ 28.8 m), not a flat height plane.
    expect(north[1]).toBeCloseTo(-(d * d) / (2 * (MOON_RADIUS_M + origin.heightM)), 0);
  });

  it.each([
    [-87, 30, 10, 20],
    [-85.5, 211, -40, 300],
    [-89.2, 0, 0, 90],
  ])('a far body lies along the topocentric az/el direction (obs %s,%s → body %s,%s)', (obsLat, obsLon, bodyLat, bodyLon) => {
    const observer = { latDeg: obsLat, lonDegE: obsLon, heightM: 500 };
    const distanceM = 1e13;
    const { azDeg, elDeg } = subPointToAzEl(observer, { latDeg: bodyLat, lonDegE: bodyLon, distanceM });
    const local = toLocal(observer, { latDeg: bodyLat, lonDegE: bodyLon, heightM: distanceM - MOON_RADIUS_M });
    const length = Math.hypot(...local);
    const expected = bodyDirectionLocal(azDeg, elDeg);
    local.forEach((c, i) => expect(c / length).toBeCloseTo(expected[i]!, 6));
  });
});
