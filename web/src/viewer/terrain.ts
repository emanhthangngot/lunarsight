import {
  AttributeCompression,
  BoundingSphere,
  Cartesian2,
  Cartesian3,
  Credit,
  Ellipsoid,
  EllipsoidalOccluder,
  Event,
  GeographicTilingScheme,
  Math as CesiumMath,
  OrientedBoundingBox,
  QuantizedMeshTerrainData,
  Rectangle,
  TerrainProvider,
  type Request,
  type TerrainData,
} from 'cesium';
import type { TerrainSource } from '../data/contract';

type HeightFunctionTerrain = Extract<TerrainSource, { type: 'heightFunction' }>;
type HeightAt = HeightFunctionTerrain['heightAt'];

const TILE_SAMPLES = 33;
/**
 * Refinement caps. Tile latitude span is 180°/2^level, i.e. 33 samples every
 * 333 m (L9), 167 m (L10), 83 m (L11), 42 m (L12), 21 m (L13). Rendered horizons need
 * ~mask-step resolution (25 m) only near the observer; far terrain subtends tiny angles.
 * Offline check against the provider's masks (all 5 mock sites, 120 azimuths, 2 m eye):
 * these rings keep the fully-refined skyline within 0.035° of the mask, while geographic
 * tiling near the pole would otherwise request thousands of tiles.
 */
const BASE_MAX_LEVEL = 9;
const FOCUS_RINGS: ReadonlyArray<readonly [distanceM: number, level: number]> = [[600, 13], [1_500, 12], [5_000, 11], [15_000, 10]];
/**
 * Cesium keeps refining a terrain tile whose data has no children by *upsampling* it until the
 * screen-space error is met: no new detail, but thousands of extra tiles near the pole (geographic
 * tiling). Refuse refinement once a tile's data says it has no children. Private Cesium API
 * (`_surface.tileProvider.canRefine`, `_childTileMask`), verified against 1.147.0; if the
 * internals change this silently becomes a no-op and Cesium's default behaviour returns.
 */
export function stopRefiningPastData(globe: object): void {
  const surface = (globe as { _surface?: { tileProvider?: { canRefine?: (tile: { data?: { terrainData?: unknown } }) => boolean } } })._surface;
  const provider = surface?.tileProvider;
  const original = provider?.canRefine?.bind(provider);
  if (!provider || !original) return;
  provider.canRefine = (tile) => {
    const data = tile.data?.terrainData;
    if (data && typeof data === 'object' && '_childTileMask' in data && data._childTileMask === 0) return false;
    return original(tile);
  };
}

/** Exact poles are unsupported by the data contract; stay a hair away from them. */
const MAX_ABS_LAT_DEG = 89.99999;
const QUANTIZED_MAX = 32767;
/** At most 8× latitude rows (33 × 257 vertices, within 16-bit indices). */
const MAX_ROW_FACTOR = 8;

export interface TerrainFocus { latDeg: number; lonDegE: number }

/** Great-circle surface distance on the Moon sphere (m). */
function arcDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const cos = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * Ellipsoid.MOON.maximumRadius;
}

export interface TileGrid {
  /** Row-major, row 0 = north edge, column 0 = west edge; metres above the sphere, 0 = no data. */
  heights: Float64Array;
  /** Unit surface normals in Moon-fixed axes, 3 per vertex. */
  normals: Float64Array;
  latitudes: Float64Array;
  longitudes: Float64Array;
}

/**
 * Samples a tile on a regular lat/lon grid and derives smooth per-vertex normals by central
 * differences (one extra sample ring beyond the tile so neighbouring tiles agree).
 * Smooth normals avoid the faceted sliver shading of near-pole geographic tiles.
 * `rows` may exceed `cols` (extra latitude samples for narrow near-pole tiles).
 */
export function sampleTileGrid(heightAt: HeightAt, rect: { west: number; south: number; east: number; north: number }, cols: number, radiusM: number, rows = cols): TileGrid {
  const n = cols;
  const dLon = (rect.east - rect.west) / (n - 1);
  const dLat = (rect.north - rect.south) / (rows - 1);
  const w = n + 2;
  const ring = new Float64Array(w * (rows + 2));
  for (let r = 0; r < rows + 2; r++) {
    const lat = Math.max(-MAX_ABS_LAT_DEG, Math.min(MAX_ABS_LAT_DEG, CesiumMath.toDegrees(rect.north - (r - 1) * dLat)));
    for (let c = 0; c < w; c++) {
      const h = heightAt(lat, CesiumMath.toDegrees(rect.west + (c - 1) * dLon));
      ring[r * w + c] = h === null || !Number.isFinite(h) ? 0 : h;
    }
  }
  const heights = new Float64Array(n * rows);
  const normals = new Float64Array(n * rows * 3);
  const latitudes = new Float64Array(rows);
  const longitudes = new Float64Array(n);
  for (let c = 0; c < n; c++) longitudes[c] = rect.west + c * dLon;
  for (let r = 0; r < rows; r++) {
    const latRad = CesiumMath.toRadians(Math.max(-MAX_ABS_LAT_DEG, Math.min(MAX_ABS_LAT_DEG, CesiumMath.toDegrees(rect.north - r * dLat))));
    latitudes[r] = latRad;
    const northM = dLat * radiusM;
    const eastM = Math.max(dLon * radiusM * Math.cos(latRad), 1e-3);
    const sinLat = Math.sin(latRad), cosLat = Math.cos(latRad);
    for (let c = 0; c < n; c++) {
      const i = (r + 1) * w + (c + 1);
      heights[r * n + c] = ring[i]!;
      const dhdE = (ring[i + 1]! - ring[i - 1]!) / (2 * eastM);
      const dhdN = (ring[i - w]! - ring[i + w]!) / (2 * northM);
      // Local ENU normal (−∂h/∂E, −∂h/∂N, 1) rotated into Moon-fixed axes.
      const lon = longitudes[c]!;
      const sinLon = Math.sin(lon), cosLon = Math.cos(lon);
      const e = -dhdE, nn = -dhdN, u = 1;
      const x = e * -sinLon + nn * -sinLat * cosLon + u * cosLat * cosLon;
      const y = e * cosLon + nn * -sinLat * sinLon + u * cosLat * sinLon;
      const z = nn * cosLat + u * sinLat;
      const length = Math.hypot(x, y, z);
      normals.set([x / length, y / length, z / length], (r * n + c) * 3);
    }
  }
  return { heights, normals, latitudes, longitudes };
}

/**
 * Terrain provider for a `heightAt` function. Builds quantized-mesh tiles with vertex normals
 * (so the surface material gets smooth shading). Heights are metres above the Moon sphere.
 * `null` (no data) is rendered as exactly 0 m, which the material draws as a flat "no data"
 * colour; it is never presented as a measured height.
 */
class HeightFunctionTerrainProvider {
  readonly tilingScheme = new GeographicTilingScheme({ ellipsoid: Ellipsoid.MOON });
  readonly errorEvent = new Event();
  readonly credit = new Credit('Fictional mock terrain (LunarSight)');
  readonly hasWaterMask = false;
  readonly hasVertexNormals = true;
  readonly availability = undefined;
  private readonly levelZeroError = TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(Ellipsoid.MOON, TILE_SAMPLES, 2);
  private readonly occluder = new EllipsoidalOccluder(Ellipsoid.MOON);
  private readonly indices = new Map<number, Uint16Array | Uint32Array>();
  private readonly north: number;
  private readonly south: number;
  private readonly focusLat: number | null;
  private readonly focusLon: number;

  constructor(private readonly terrain: HeightFunctionTerrain, focus: TerrainFocus | null) {
    this.north = CesiumMath.toRadians(terrain.coverage.northDeg);
    this.south = CesiumMath.toRadians(terrain.coverage.southDeg);
    this.focusLat = focus ? CesiumMath.toRadians(focus.latDeg) : null;
    this.focusLon = focus ? CesiumMath.toRadians(focus.lonDegE) : 0;
  }

  getLevelMaximumGeometricError(level: number): number {
    return this.levelZeroError / (1 << level);
  }

  getTileDataAvailable(): boolean | undefined { return undefined; }

  loadTileDataAvailability(): undefined { return undefined; }

  private maxLevel(rect: Rectangle): number {
    if (this.focusLat === null) return BASE_MAX_LEVEL;
    const halfDiagonal = arcDistanceM(rect.north, rect.west, rect.south, rect.east) / 2;
    const distance = Math.max(0, arcDistanceM((rect.north + rect.south) / 2, (rect.east + rect.west) / 2, this.focusLat, this.focusLon) - halfDiagonal);
    for (const [ringM, level] of FOCUS_RINGS) if (distance < ringM) return level;
    return BASE_MAX_LEVEL;
  }

  requestTileGeometry(x: number, y: number, level: number, _request?: Request): Promise<TerrainData> | undefined {
    const rect = this.tilingScheme.tileXYToRectangle(x, y, level);
    const outside = rect.south > this.north || rect.north < this.south;
    const n = TILE_SAMPLES;
    // Geographic tiles near the pole are slivers (east-west width ∝ cos lat). Give them extra
    // latitude rows instead of more quadtree levels: k× rows reach the same north-south spacing
    // log2(k) levels earlier, with up to 4^log2(k) fewer tiles and draw calls.
    const cosLat = Math.cos((rect.north + rect.south) / 2);
    const k = outside ? 1 : Math.min(MAX_ROW_FACTOR, Math.max(1, 2 ** Math.floor(Math.log2(0.5 / Math.max(cosLat, 1e-6)))));
    const rows = (n - 1) * k + 1;
    const radius = Ellipsoid.MOON.maximumRadius;
    const grid = outside
      ? { heights: new Float64Array(n * rows), normals: null, latitudes: null, longitudes: null }
      : sampleTileGrid(this.terrain.heightAt, rect, n, radius, rows);
    let minH = Infinity, maxH = -Infinity;
    for (const h of grid.heights) { if (h < minH) minH = h; if (h > maxH) maxH = h; }
    const span = maxH - minH > 1e-6 ? maxH - minH : 1;
    const count = n * rows;
    const quantized = new Uint16Array(count * 3);
    const encodedNormals = new Uint8Array(count * 2);
    const positions: Cartesian3[] = [];
    const oct = new Cartesian2();
    const normal = new Cartesian3();
    const west: number[] = [], south: number[] = [], east: number[] = [], north: number[] = [];
    for (let r = 0; r < rows; r++) {
      const lat = grid.latitudes ? grid.latitudes[r]! : rect.north - (r * (rect.north - rect.south)) / (rows - 1);
      for (let c = 0; c < n; c++) {
        const i = r * n + c;
        const lon = grid.longitudes ? grid.longitudes[c]! : rect.west + (c * (rect.east - rect.west)) / (n - 1);
        const h = grid.heights[i]!;
        quantized[i] = Math.round((c / (n - 1)) * QUANTIZED_MAX);
        quantized[count + i] = Math.round(((rows - 1 - r) / (rows - 1)) * QUANTIZED_MAX);
        quantized[2 * count + i] = Math.round(((h - minH) / span) * QUANTIZED_MAX);
        const position = Cartesian3.fromRadians(lon, lat, h, Ellipsoid.MOON);
        positions.push(position);
        if (grid.normals) Cartesian3.fromElements(grid.normals[i * 3]!, grid.normals[i * 3 + 1]!, grid.normals[i * 3 + 2]!, normal);
        else Cartesian3.normalize(position, normal);
        AttributeCompression.octEncode(normal, oct);
        encodedNormals[i * 2] = oct.x;
        encodedNormals[i * 2 + 1] = oct.y;
        if (c === 0) west.push(i);
        if (c === n - 1) east.push(i);
        if (r === 0) north.push(i);
        if (r === rows - 1) south.push(i);
      }
    }
    let indices = this.indices.get(rows);
    if (!indices) { indices = TerrainProvider.getRegularGridIndices(n, rows); this.indices.set(rows, indices); }
    const boundingSphere = BoundingSphere.fromPoints(positions);
    const skirt = this.getLevelMaximumGeometricError(level) * 5;
    // Stop refinement beyond the level cap (finer near the focus; reached earlier by tall
    // tiles) and outside coverage.
    const refine = !outside && level < this.maxLevel(rect) - Math.log2(k);
    const horizonPoint = this.occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(boundingSphere.center, positions, minH) as Cartesian3 | undefined;
    const data = new QuantizedMeshTerrainData({
      quantizedVertices: quantized,
      indices,
      encodedNormals,
      minimumHeight: minH,
      maximumHeight: maxH,
      boundingSphere,
      orientedBoundingBox: OrientedBoundingBox.fromRectangle(rect, minH, maxH, Ellipsoid.MOON),
      // Required by the constructor; replaced below when no culling point exists.
      horizonOcclusionPoint: horizonPoint ?? Cartesian3.ZERO,
      westIndices: west, southIndices: south, eastIndices: east, northIndices: north,
      westSkirtHeight: skirt, southSkirtHeight: skirt, eastSkirtHeight: skirt, northSkirtHeight: skirt,
      childTileMask: refine ? 15 : 0,
    });
    // No finite horizon-culling point (large tiles that dip below the sphere, e.g. level 0):
    // Cesium skips horizon culling for tiles without one. Any substitute point would wrongly
    // cull tiles that contain the camera (private field, verified against Cesium 1.147.0).
    if (!horizonPoint && '_horizonOcclusionPoint' in data) (data as { _horizonOcclusionPoint: Cartesian3 | undefined })._horizonOcclusionPoint = undefined;
    return Promise.resolve(data);
  }
}

export function createHeightFunctionProvider(terrain: HeightFunctionTerrain, focus: TerrainFocus | null): TerrainProvider {
  // Structurally implements Cesium's TerrainProvider interface (Cesium's class is abstract).
  return new HeightFunctionTerrainProvider(terrain, focus) as unknown as TerrainProvider;
}

function clampLat(latDeg: number): number {
  return Math.max(-MAX_ABS_LAT_DEG, Math.min(MAX_ABS_LAT_DEG, latDeg));
}

/** Ground height (m above the sphere) at a site; null when the terrain has no data there. */
export function sampleGroundHeight(terrain: HeightFunctionTerrain, latDeg: number, lonDegE: number): number | null {
  return terrain.heightAt(clampLat(latDeg), lonDegE);
}

/** Coarse scan of coverage for the colour-ramp/legend range. */
export function estimateHeightRange(terrain: TerrainSource): { minM: number; maxM: number } {
  if (terrain.type !== 'heightFunction') return { minM: -5000, maxM: 5000 };
  let min = Infinity;
  let max = -Infinity;
  const { southDeg, northDeg } = terrain.coverage;
  const latSteps = 48;
  const lonSteps = 144;
  for (let i = 0; i <= latSteps; i++) {
    const lat = clampLat(southDeg + ((northDeg - southDeg) * i) / latSteps);
    for (let j = 0; j < lonSteps; j++) {
      const h = terrain.heightAt(lat, (360 * j) / lonSteps);
      if (h === null || !Number.isFinite(h)) continue;
      if (h < min) min = h;
      if (h > max) max = h;
    }
  }
  if (!(max > min)) return { minM: -5000, maxM: 5000 };
  // Round outward to 500 m so legend labels are readable.
  return { minM: Math.floor(min / 500) * 500, maxM: Math.ceil(max / 500) * 500 };
}
