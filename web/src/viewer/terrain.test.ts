import { describe, expect, it } from 'vitest';
import { localEnuBasis } from '../geo';
import { sampleTileGrid } from './terrain';

// Protects the vertex normals that light the 3D surface: a sign or axis error would put
// lit slopes on the wrong side of every ridge (the shading would contradict the Sun).
describe('tile grid normals', () => {
  const R = 1_737_400;
  const rad = Math.PI / 180;
  const rect = { west: 40 * rad, east: 40.2 * rad, south: -86.2 * rad, north: -86 * rad };

  it('tilts away from the uphill direction (slope rising toward geographic north)', () => {
    // Height rises 0.1 m per metre northward: normal leans south by atan(0.1).
    const grid = sampleTileGrid((lat) => (lat + 86.1) * rad * R * 0.1, rect, 9, R);
    const i = 4 * 9 + 4;
    const n = [grid.normals[i * 3]!, grid.normals[i * 3 + 1]!, grid.normals[i * 3 + 2]!] as const;
    const { east, north, up } = localEnuBasis(grid.latitudes[4]! / rad, grid.longitudes[4]! / rad);
    const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
    expect(dot(n, north) / dot(n, up)).toBeCloseTo(-0.1, 3);
    expect(dot(n, east)).toBeCloseTo(0, 6);
  });

  it('is the local vertical on flat terrain and keeps no-data as 0 m', () => {
    const grid = sampleTileGrid(() => null, rect, 5, R);
    expect(Array.from(grid.heights).every((h) => h === 0)).toBe(true);
    const { up } = localEnuBasis(grid.latitudes[2]! / rad, grid.longitudes[2]! / rad);
    const i = 2 * 5 + 2;
    expect(grid.normals[i * 3]! * up[0] + grid.normals[i * 3 + 1]! * up[1] + grid.normals[i * 3 + 2]! * up[2]).toBeCloseTo(1, 9);
  });
});
