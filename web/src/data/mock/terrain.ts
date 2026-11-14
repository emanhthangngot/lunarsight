import type { Provenance, TerrainSource } from '../contract';
import { southPolarForward, validateCoordinates } from '../../geo/coordinates';

export function mockProvenance(notes: string): Provenance {
  return {
    kind: 'mock',
    source: 'LunarSight deterministic mock generator',
    version: '1.1.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    notes: 'Fictional demonstration only; not JPL ephemerides or LOLA data. ' + notes,
  };
}

const craters = [
  { x: -24_000, y: 10_000, radius: 16_000, depth: 3_500, rim: 1_800 },
  { x: 55_000, y: 60_000, radius: 29_000, depth: 2_700, rim: 1_400 },
  { x: -70_000, y: -55_000, radius: 23_000, depth: 3_100, rim: 1_600 },
  { x: 70_000, y: -85_000, radius: 18_000, depth: 2_000, rim: 1_200 },
  // Small, fictional impacts add local relief without displacing the named sites.
  { x: -9_000, y: 29_000, radius: 2_400, depth: 300, rim: 120 },
  { x: 32_000, y: 7_000, radius: 3_500, depth: 420, rim: 150 },
  { x: -49_000, y: 24_000, radius: 1_900, depth: 250, rim: 85 },
  { x: 9_000, y: -10_000, radius: 1_300, depth: 150, rim: 70 },
  { x: 39_000, y: -36_000, radius: 2_800, depth: 360, rim: 140 },
  { x: -2_000, y: -56_000, radius: 3_800, depth: 450, rim: 180 },
];

/** Integer-coordinate hash: no sine hash, repeating permutation tile or random state. */
function gradientDot(ix: number, iy: number, dx: number, dy: number, seed: number): number {
  let hash = Math.imul(ix ^ seed, 0x45d9f3b) ^ Math.imul(iy, 0x27d4eb2d);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash ^= hash >>> 13;
  switch (hash & 7) {
    case 0: return dx;
    case 1: return -dx;
    case 2: return dy;
    case 3: return -dy;
    case 4: return (dx + dy) * Math.SQRT1_2;
    case 5: return (dx - dy) * Math.SQRT1_2;
    case 6: return (-dx + dy) * Math.SQRT1_2;
    default: return (-dx - dy) * Math.SQRT1_2;
  }
}

/** Quintic gradient noise is C2 across cell boundaries, with no chosen tile period. */
function gradientNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = gradientDot(ix, iy, fx, fy, seed);
  const b = gradientDot(ix + 1, iy, fx - 1, fy, seed);
  const c = gradientDot(ix, iy + 1, fx, fy - 1, seed);
  const d = gradientDot(ix + 1, iy + 1, fx - 1, fy - 1, seed);
  const lower = a + u * (b - a), upper = c + u * (d - c);
  return lower + v * (upper - lower);
}

function fractalReliefM(xM: number, yM: number): number {
  let x = xM / 18_000 + 12.37, y = yM / 18_000 - 6.79;
  let amplitudeM = 180, reliefM = 0;
  for (let octave = 0; octave < 6; octave++) {
    reliefM += amplitudeM * gradientNoise(x, y, 17 + octave * 1013);
    // Rotate, offset and decorrelate octaves so their lattice axes do not stack.
    const rotatedX = 0.8 * x + 0.6 * y;
    const rotatedY = -0.6 * x + 0.8 * y;
    x = rotatedX * 2.03 + 17.17;
    y = rotatedY * 2.03 - 9.43;
    amplitudeM *= 0.45;
  }
  return reliefM;
}

export function createMockTerrain(): Extract<TerrainSource, { type: 'heightFunction' }> {
  return {
    type: 'heightFunction',
    provenance: mockProvenance('South-polar stereographic analytic craters, ridge and massif, with six secondary craters and seeded non-tiling gradient fBm (seed 17, six octaves, lacunarity 2.03, gain 0.45). No sinusoidal ripple field. Heights in metres above the 1,737,400 m sphere.'),
    coverage: { southDeg: -90, northDeg: -84, westDegE: 0, eastDegE: 360 },
    heightAt(latDeg, lonDegE) {
      const point = validateCoordinates(latDeg, lonDegE);
      if (point.latDeg > -84) return null;
      const { xM: x, yM: y } = southPolarForward(point.latDeg, point.lonDegE);
      let height = -300 + 350 * gradientNoise(x / 48_000 + 3.71, y / 48_000 - 2.19, 101);
      for (const crater of craters) {
        const q = Math.hypot(x - crater.x, y - crater.y) / crater.radius;
        height -= crater.depth * Math.exp(-2 * q * q);
        height += crater.rim * Math.exp(-(((q - 1) / 0.13) ** 2));
      }
      // An elongated ridge and a compact massif produce contrasting horizons.
      height += 3_700 * Math.exp(-(((x - 12_000) / 8_000) ** 2) - ((y - 20_000) / 45_000) ** 2);
      height += 4_800 * Math.exp(-(((x - 20_000) / 14_000) ** 2) - ((y + 25_000) / 17_000) ** 2);
      height += fractalReliefM(x, y);
      return height;
    },
  };
}
