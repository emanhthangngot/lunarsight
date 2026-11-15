import type { LocalTerrainMesh, Provenance, TerrainMeshRequest } from '../data/contract';
import { DEG_TO_RAD, MOON_RADIUS_M, RAD_TO_DEG, normalizeLongitude, validateCoordinates } from '../geo/coordinates';
import { localEnuBasis } from '../geo/topocentric';

type HeightAt = (latDeg: number, lonDegE: number) => number | null;
const MAX_RANGE_M = 150_000;
const BAND_ENDS_M = [100, 1_000, 10_000, 50_000, MAX_RANGE_M] as const;
const SPACING_M = { balanced: [2, 20, 100, 500, 2_000], high: [1, 10, 50, 250, 1_000] } as const;

/** One welded indexed patch with five radial density bands. All topology, height
 * sampling, double-precision transforms and normals are computed in the Worker.
 * The exported pure function is also the narrow geometry-test boundary.
 */
export function buildLocalTerrainMesh(request: TerrainMeshRequest, heightAt: HeightAt, provenance: Provenance): LocalTerrainMesh {
  const origin = validateCoordinates(request.latDeg, request.lonDegE);
  if (request.quality !== 'balanced' && request.quality !== 'high') throw new RangeError('Unknown mesh quality');
  const ground = heightAt(origin.latDeg, origin.lonDegE);
  if (ground === null || !Number.isFinite(ground) || MOON_RADIUS_M + ground <= 0) {
    throw new RangeError('Selected site has no supported terrain ground');
  }
  const n = request.quality === 'balanced' ? 256 : 512;
  const radii: number[] = [];
  let start = 0;
  for (let band = 0; band < BAND_ENDS_M.length; band++) {
    const end = BAND_ENDS_M[band]!;
    const step = SPACING_M[request.quality][band]!;
    for (let distance = start + step; distance <= end; distance += step) radii.push(distance);
    start = end;
  }
  const capacity = 1 + radii.length * n;
  const maxTriangles = n * (2 * radii.length - 1);
  const positions64 = new Float64Array(capacity * 3);
  const heights64 = new Float64Array(capacity);
  const normalSums = new Float64Array(capacity * 3);
  const logicalToVertex = new Int32Array(capacity);
  logicalToVertex.fill(-1);
  const indices = new Uint32Array(maxTriangles * 3);
  const { east, north, up } = localEnuBasis(origin.latDeg, origin.lonDegE);
  const radius = MOON_RADIUS_M + ground;
  const ox = radius * up[0], oy = radius * up[1], oz = radius * up[2];
  const lat = origin.latDeg * DEG_TO_RAD, lon = origin.lonDegE * DEG_TO_RAD;
  const sinLat = Math.sin(lat), cosLat = Math.cos(lat);
  const sinBearing = new Float64Array(n), cosBearing = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const bearing = 2 * Math.PI * i / n;
    sinBearing[i] = Math.sin(bearing); cosBearing[i] = Math.cos(bearing);
  }
  let vertexCount = 1, indexCount = 0, partialCoverage = false;
  // The one centre vertex is the actual double-precision ground origin, not R.
  logicalToVertex[0] = 0;
  heights64[0] = ground;
  for (let ring = 0; ring < radii.length; ring++) {
    const angle = radii[ring]! / MOON_RADIUS_M;
    const sinAngle = Math.sin(angle), cosAngle = Math.cos(angle);
    for (let i = 0; i < n; i++) {
      const targetLat = Math.asin(Math.max(-1, Math.min(1, sinLat * cosAngle + cosLat * sinAngle * cosBearing[i]!)));
      const targetLon = lon + Math.atan2(sinBearing[i]! * sinAngle * cosLat, cosAngle - sinLat * Math.sin(targetLat));
      const latitudeDeg = targetLat * RAD_TO_DEG;
      // Exact poles are unsupported by the scientific scalar contract as well.
      if (Math.abs(latitudeDeg) >= 90) { partialCoverage = true; continue; }
      const height = heightAt(latitudeDeg, normalizeLongitude(targetLon * RAD_TO_DEG));
      if (height === null || !Number.isFinite(height) || MOON_RADIUS_M + height <= 0) {
        partialCoverage = true; continue;
      }
      const targetRadius = MOON_RADIUS_M + height;
      const cosTarget = Math.cos(targetLat);
      const dx = targetRadius * cosTarget * Math.cos(targetLon) - ox;
      const dy = targetRadius * cosTarget * Math.sin(targetLon) - oy;
      const dz = targetRadius * Math.sin(targetLat) - oz;
      const offset = vertexCount * 3;
      positions64[offset] = dx * east[0] + dy * east[1] + dz * east[2];
      positions64[offset + 1] = dx * up[0] + dy * up[1] + dz * up[2];
      positions64[offset + 2] = -(dx * north[0] + dy * north[1] + dz * north[2]);
      heights64[vertexCount] = height;
      logicalToVertex[1 + ring * n + i] = vertexCount++;
    }
  }

  function triangle(logicalA: number, logicalB: number, logicalC: number): void {
    const a = logicalToVertex[logicalA]!, b = logicalToVertex[logicalB]!, c = logicalToVertex[logicalC]!;
    if (a < 0 || b < 0 || c < 0) { partialCoverage = true; return; }
    const ai = a * 3, bi = b * 3, ci = c * 3;
    const abx = positions64[bi]! - positions64[ai]!, aby = positions64[bi + 1]! - positions64[ai + 1]!, abz = positions64[bi + 2]! - positions64[ai + 2]!;
    const acx = positions64[ci]! - positions64[ai]!, acy = positions64[ci + 1]! - positions64[ai + 1]!, acz = positions64[ci + 2]! - positions64[ai + 2]!;
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    if (!Number.isFinite(nx + ny + nz) || Math.hypot(nx, ny, nz) <= 1e-12) { partialCoverage = true; return; }
    indices[indexCount++] = a; indices[indexCount++] = b; indices[indexCount++] = c;
    for (let corner = 0; corner < 3; corner++) {
      const offset = corner === 0 ? ai : corner === 1 ? bi : ci;
      normalSums[offset] = normalSums[offset]! + nx;
      normalSums[offset + 1] = normalSums[offset + 1]! + ny;
      normalSums[offset + 2] = normalSums[offset + 2]! + nz;
    }
  }
  for (let i = 0; i < n; i++) triangle(0, 1 + (i + 1) % n, 1 + i);
  for (let ring = 0; ring + 1 < radii.length; ring++) {
    const inner = 1 + ring * n, outer = inner + n;
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      triangle(inner + i, inner + next, outer + i);
      triangle(inner + next, outer + next, outer + i);
    }
  }
  if (indexCount === 0) throw new RangeError('No supported terrain triangles around the selected site');

  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const heightsM = new Float32Array(vertexCount);
  let remap: Uint32Array | null = null;
  let used = 0, minHeightM = Infinity, maxHeightM = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    const nx = normalSums[offset]!, ny = normalSums[offset + 1]!, nz = normalSums[offset + 2]!;
    const magnitude = Math.hypot(nx, ny, nz);
    // Isolated valid samples have no rendered face: omit them, not fake normals.
    if (magnitude <= 1e-12) {
      if (!remap) {
        remap = new Uint32Array(vertexCount);
        for (let previous = 0; previous < i; previous++) remap[previous] = previous;
      }
      partialCoverage = true; continue;
    }
    if (remap) remap[i] = used;
    const out = used * 3;
    positions[out] = positions64[offset]!; positions[out + 1] = positions64[offset + 1]!; positions[out + 2] = positions64[offset + 2]!;
    normals[out] = nx / magnitude; normals[out + 1] = ny / magnitude; normals[out + 2] = nz / magnitude;
    const height = heights64[i]!;
    heightsM[used] = height;
    minHeightM = Math.min(minHeightM, height); maxHeightM = Math.max(maxHeightM, height);
    used++;
  }
  if (remap) for (let i = 0; i < indexCount; i++) indices[i] = remap[indices[i]!]!;
  return {
    origin: { ...origin, heightM: ground },
    chunks: [{ id: 'local-' + request.quality, positions: positions.subarray(0, used * 3), normals: normals.subarray(0, used * 3), indices: indices.subarray(0, indexCount), heightsM: heightsM.subarray(0, used) }],
    maxRangeM: MAX_RANGE_M,
    partialCoverage,
    minHeightM,
    maxHeightM,
    provenance: { ...provenance, notes: (provenance.notes ?? '') + ' Finite Moon-curved local mesh; five welded radial density bands, x East / y Up / z South. Missing vertices/faces omitted; normals are area-weighted rendered-surface normals. Not a complete scientific horizon or accuracy certification.' },
  };
}
