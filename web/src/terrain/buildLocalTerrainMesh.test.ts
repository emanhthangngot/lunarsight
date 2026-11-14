import { beforeAll, describe, expect, it } from 'vitest';
import type { LocalTerrainMesh } from '../data/contract';
import { MOON_RADIUS_M } from '../geo/coordinates';
import { buildLocalTerrainMesh } from './buildLocalTerrainMesh';

const provenance = { kind: 'mock' as const, source: 'Mathematical fixture', version: '1', generatedAt: '2026-01-01T00:00:00Z', notes: 'Synthetic geometry, not lunar observations.' };
let flat: LocalTerrainMesh;
beforeAll(() => { flat = buildLocalTerrainMesh({ latDeg: 0, lonDegE: 0, quality: 'balanced' }, () => 1234, provenance); });

// Contract 3: protect actual frame/curvature, shading direction, welded transitions
// and missing-data geometry; do not assert source text or renderer wiring.
describe('local Moon-curved mesh', () => {
  it('anchors at actual ground and keeps sphere height separate from local y', () => {
    const chunk = flat.chunks[0]!;
    expect(flat.origin.heightM).toBe(1234);
    expect(Array.from(chunk.positions.subarray(0, 3))).toEqual([0, 0, 0]);
    expect(chunk.heightsM.every((height) => height === 1234)).toBe(true);
    let northern = 0;
    for (let i = 1; i < chunk.positions.length / 3; i++) if (chunk.positions[i * 3 + 2]! < chunk.positions[northern * 3 + 2]!) northern = i;
    const angle = flat.maxRangeM / MOON_RADIUS_M;
    const shell = MOON_RADIUS_M + 1234;
    expect(chunk.positions[northern * 3]!).toBeCloseTo(0, 4);
    expect(chunk.positions[northern * 3 + 2]!).toBeLessThan(-140000);
    expect(chunk.positions[northern * 3 + 2]!).toBeCloseTo(-shell * Math.sin(angle), 1);
    expect(chunk.positions[northern * 3 + 1]!).toBeCloseTo(shell * (Math.cos(angle) - 1), 2);
  });

  it('has unit normals and outward winding; a north-rising slope leans south', () => {
    const slope = buildLocalTerrainMesh({ latDeg: -87, lonDegE: 33, quality: 'balanced' }, (lat) => (lat + 87) * Math.PI / 180 * MOON_RADIUS_M * 0.1, provenance);
    const chunk = slope.chunks[0]!;
    expect(chunk.normals[0]).toBeCloseTo(0, 4);
    expect(chunk.normals[2]! / chunk.normals[1]!).toBeCloseTo(0.1, 4);
    for (let i = 0; i < chunk.normals.length; i += 3) expect(Math.hypot(chunk.normals[i]!, chunk.normals[i + 1]!, chunk.normals[i + 2]!)).toBeCloseTo(1, 5);
    for (const triangle of [0, Math.floor(chunk.indices.length / 6), chunk.indices.length / 3 - 1]) {
      const a = chunk.indices[triangle * 3]! * 3, b = chunk.indices[triangle * 3 + 1]! * 3, c = chunk.indices[triangle * 3 + 2]! * 3;
      const ux = chunk.positions[b]! - chunk.positions[a]!, uy = chunk.positions[b + 1]! - chunk.positions[a + 1]!, uz = chunk.positions[b + 2]! - chunk.positions[a + 2]!;
      const vx = chunk.positions[c]! - chunk.positions[a]!, vy = chunk.positions[c + 1]! - chunk.positions[a + 1]!, vz = chunk.positions[c + 2]! - chunk.positions[a + 2]!;
      const dot = (uy * vz - uz * vy) * chunk.normals[a]! + (uz * vx - ux * vz) * chunk.normals[a + 1]! + (ux * vy - uy * vx) * chunk.normals[a + 2]!;
      expect(dot).toBeGreaterThan(0);
    }
  });

  it('has no open interior seam at any radial resolution transition', () => {
    const chunk = flat.chunks[0]!, count = chunk.positions.length / 3;
    const edges = new Map<number, number>();
    for (let i = 0; i < chunk.indices.length; i += 3) {
      const triangle = [chunk.indices[i]!, chunk.indices[i + 1]!, chunk.indices[i + 2]!];
      for (let corner = 0; corner < 3; corner++) {
        const a = triangle[corner]!, b = triangle[(corner + 1) % 3]!;
        const key = Math.min(a, b) * count + Math.max(a, b);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    const outerRadius = (MOON_RADIUS_M + 1234) * Math.sin(flat.maxRangeM / MOON_RADIUS_M);
    for (const [key, faces] of edges) {
      expect(faces).toBeLessThanOrEqual(2);
      if (faces === 2) continue;
      const a = Math.floor(key / count), b = key % count;
      expect(Math.abs(Math.hypot(chunk.positions[a * 3]!, chunk.positions[a * 3 + 2]!) - outerRadius)).toBeLessThan(0.05);
      expect(Math.abs(Math.hypot(chunk.positions[b * 3]!, chunk.positions[b * 3 + 2]!) - outerRadius)).toBeLessThan(0.05);
    }
  });

  it('omits unsupported vertices/faces rather than drawing zero terrain', () => {
    const partial = buildLocalTerrainMesh({ latDeg: -88.5, lonDegE: 0, quality: 'balanced' }, (lat) => lat <= -88 ? 5432 : null, provenance);
    const chunk = partial.chunks[0]!;
    expect(partial.partialCoverage).toBe(true);
    expect(chunk.heightsM.every((height) => height === 5432)).toBe(true);
    expect(chunk.positions.every(Number.isFinite)).toBe(true);
    expect(chunk.normals.every(Number.isFinite)).toBe(true);
    expect(chunk.indices.every((index) => index < chunk.positions.length / 3)).toBe(true);
    expect(partial.minHeightM).toBe(5432);
    expect(partial.maxHeightM).toBe(5432);
    expect(() => buildLocalTerrainMesh({ latDeg: -83, lonDegE: 0, quality: 'balanced' }, () => null, provenance)).toThrow('no supported terrain ground');
  });
});
