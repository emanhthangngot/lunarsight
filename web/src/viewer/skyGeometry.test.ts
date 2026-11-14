import { describe, expect, it } from 'vitest';
import { subPointToAzEl } from '../geo';
import { azElToEnu, billboardDiameterPixels, skyDirectionFixed } from './skyGeometry';

// Protects the az/el → Moon-fixed direction used for the 3D light and sky markers:
// a sign or axis mix-up would put the Sun on the wrong side of the terrain.
describe('sky direction in Moon-fixed axes', () => {
  it('maps azimuth clockwise from north and elevation up', () => {
    const [e0, n0, u0] = azElToEnu(0, 0);
    expect([e0, n0, u0]).toEqual([0, 1, 0]);
    const [e1, n1] = azElToEnu(90, 0);
    expect(e1).toBeCloseTo(1, 12);
    expect(n1).toBeCloseTo(0, 12);
    expect(azElToEnu(123, 90)[2]).toBeCloseTo(1, 12);
  });

  it.each([
    [-87, 30, 10, 20],
    [-85.5, 211, -40, 300],
    [-89.2, 0, 0, 90],
  ])('agrees with topocentric az/el for a far body (obs %s,%s → body %s,%s)', (obsLat, obsLon, bodyLat, bodyLon) => {
    const distanceM = 1e15; // effectively at infinity: parallax < 1e-8 deg
    const { azDeg, elDeg } = subPointToAzEl({ latDeg: obsLat, lonDegE: obsLon, heightM: 0 }, { latDeg: bodyLat, lonDegE: bodyLon, distanceM });
    const dir = skyDirectionFixed(obsLat, obsLon, azDeg, elDeg);
    const lat = (bodyLat * Math.PI) / 180;
    const lon = (bodyLon * Math.PI) / 180;
    const expected = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
    dir.forEach((c, i) => expect(c).toBeCloseTo(expected[i]!, 6));
  });

  it('puts the zenith along the local surface normal', () => {
    const [x, y, z] = skyDirectionFixed(-88, 45, 17, 90);
    const lat = (-88 * Math.PI) / 180;
    const lon = (45 * Math.PI) / 180;
    expect(x).toBeCloseTo(Math.cos(lat) * Math.cos(lon), 12);
    expect(y).toBeCloseTo(Math.cos(lat) * Math.sin(lon), 12);
    expect(z).toBeCloseTo(Math.sin(lat), 12);
  });
});

describe('apparent sky-body size while zooming', () => {
  it.each([
    [1000, Math.PI / 2, 1000, 100],
    [500, Math.PI / 2, 1000, 200],
    [1000, 2 * Math.atan(0.5), 1000, 200],
    [1000, Math.PI / 2, 2000, 200],
  ])('projects a 200 m image at distance %s / FOV %s / height %s', (distanceM, fov, heightPx, expectedPx) => {
    // Hand-worked similar triangles: at 1 km and 90° FOV the vertical field
    // spans 2 km, so a 200 m image occupies 10% of a 1000 CSS-pixel viewport.
    expect(billboardDiameterPixels(200, distanceM, fov, heightPx)).toBeCloseTo(expectedPx, 10);
  });
});
