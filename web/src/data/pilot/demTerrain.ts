import type { CoverageBounds, Provenance, TerrainSource } from '../contract';
import { southPolarForward, validateCoordinates } from '../../geo/coordinates';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import type { DemInitMessage } from '../../terrain/workerProtocol';

export interface DemLayerMeta {
  id: string;
  siteId?: string;
  url: string;
  xMinM: number;
  yMaxM: number;
  spacingM: number;
  rows: number;
  cols: number;
  minHeightM: number;
  maxHeightM: number;
  source: string;
}

export interface DemManifest {
  version: string;
  coverage: CoverageBounds;
  provenance: Provenance;
  layers: DemLayerMeta[];
}

export interface DemLayerData {
  xMinM: number;
  yMaxM: number;
  spacingM: number;
  rows: number;
  cols: number;
  data: Float32Array;
}

/** Bilinearly samples a GDAL-ordered row-major Float32 DEM grid in south-polar stereographic metres. */
export function sampleDemLayer(layer: DemLayerData, xM: number, yM: number): number | null {
  const { xMinM, yMaxM, spacingM, rows, cols, data } = layer;
  if (rows < 2 || cols < 2 || spacingM <= 0) return null;
  const fx = (xM - xMinM) / spacingM - 0.5;
  const fy = (yMaxM - yM) / spacingM - 0.5;
  if (fx < 0 || fy < 0 || fx > cols - 1 || fy > rows - 1) return null;

  const c0 = Math.min(cols - 2, Math.floor(fx));
  const r0 = Math.min(rows - 2, Math.floor(fy));
  const tx = fx - c0;
  const ty = fy - r0;

  const idx00 = r0 * cols + c0;
  const v00 = data[idx00]!;
  const v01 = data[idx00 + 1]!;
  const v10 = data[idx00 + cols]!;
  const v11 = data[idx00 + cols + 1]!;

  if (!Number.isFinite(v00) || !Number.isFinite(v01) || !Number.isFinite(v10) || !Number.isFinite(v11)) {
    return null;
  }

  return (1 - ty) * ((1 - tx) * v00 + tx * v01) + ty * ((1 - tx) * v10 + tx * v11);
}

/**
 * Creates a hierarchical terrain lookup function across priority-ordered DEM layers
 * (typically 5 m/px local patches -> 40 m/px site tiles -> 320 m/px regional grid).
 */
export function createDemHeightAt(
  layers: readonly DemLayerData[],
  coverage: CoverageBounds = { southDeg: -90, northDeg: -78, westDegE: 0, eastDegE: 360 },
): (latDeg: number, lonDegE: number) => number | null {
  return (latDeg: number, lonDegE: number): number | null => {
    const point = validateCoordinates(latDeg, lonDegE);
    if (point.latDeg < coverage.southDeg || point.latDeg > coverage.northDeg) return null;
    const { xM, yM } = southPolarForward(point.latDeg, point.lonDegE);
    for (let i = 0; i < layers.length; i++) {
      const value = sampleDemLayer(layers[i]!, xM, yM);
      if (value !== null) return value;
    }
    return null;
  };
}

export interface LazyDemTerrainSource extends TerrainSource {
  ensureLayersFor(latDeg: number, lonDegE: number): Promise<void>;
}

function layerMatchesPoint(meta: DemLayerMeta, xM: number, yM: number, padM = 2000): boolean {
  const xMin = meta.xMinM;
  const xMax = meta.xMinM + meta.cols * meta.spacingM;
  const yMax = meta.yMaxM;
  const yMin = meta.yMaxM - meta.rows * meta.spacingM;
  return xM >= xMin - padM && xM <= xMax + padM && yM >= yMin - padM && yM <= yMax + padM;
}

async function fetchLayerBinary(meta: DemLayerMeta, url: string): Promise<DemLayerData> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to load DEM layer ${meta.id} (${resp.status})`);
  }
  const buffer = await resp.arrayBuffer();
  const data = new Float32Array(buffer);
  if (data.length !== meta.rows * meta.cols) {
    throw new Error(`DEM layer ${meta.id} size mismatch: expected ${meta.rows * meta.cols}, got ${data.length}`);
  }
  return {
    xMinM: meta.xMinM,
    yMaxM: meta.yMaxM,
    spacingM: meta.spacingM,
    rows: meta.rows,
    cols: meta.cols,
    data,
  };
}

/**
 * Loads the DEM manifest and regional layer immediately, then lazily fetches
 * site-specific 5 m / 10 m / 40 m tiles when coordinates near that site are requested.
 */
export async function createLazyDemTerrainSource(
  manifest: DemManifest,
  resolveLayerUrl: (meta: DemLayerMeta) => string,
): Promise<LazyDemTerrainSource> {
  const loadedById = new Map<string, DemLayerData>();
  const inFlight = new Map<string, Promise<DemLayerData>>();
  const activeLayers: DemLayerData[] = [];

  const syncSortedLayers = () => {
    const ordered: DemLayerData[] = [];
    for (const meta of manifest.layers) {
      const loaded = loadedById.get(meta.id);
      if (loaded) ordered.push(loaded);
    }
    activeLayers.splice(0, activeLayers.length, ...ordered);
  };

  const loadMetas = async (metas: DemLayerMeta[]): Promise<boolean> => {
    const missing = metas.filter((m) => !loadedById.has(m.id));
    if (missing.length === 0) return false;
    await Promise.all(
      missing.map(async (meta) => {
        let pending = inFlight.get(meta.id);
        if (!pending) {
          pending = fetchLayerBinary(meta, resolveLayerUrl(meta)).then(
            (layer) => {
              loadedById.set(meta.id, layer);
              inFlight.delete(meta.id);
              return layer;
            },
            (err) => {
              inFlight.delete(meta.id);
              throw err;
            },
          );
          inFlight.set(meta.id, pending);
        }
        await pending;
      }),
    );
    syncSortedLayers();
    return true;
  };

  // Load regional background layers (!siteId) immediately; site-local tiles load on demand.
  const regionalMetas = manifest.layers.filter((meta) => !meta.siteId);
  await loadMetas(regionalMetas.length > 0 ? regionalMetas : manifest.layers);

  const ensureWithDiff = async (latDeg: number, lonDegE: number): Promise<DemInitMessage | null> => {
    const point = validateCoordinates(latDeg, lonDegE);
    const { xM, yM } = southPolarForward(point.latDeg, point.lonDegE);
    const matching = manifest.layers.filter(
      (meta) => !loadedById.has(meta.id) && layerMatchesPoint(meta, xM, yM),
    );
    if (matching.length === 0) return null;
    const changed = await loadMetas(matching);
    if (!changed) return null;
    return {
      type: 'init',
      layers: [...activeLayers],
      coverage: manifest.coverage,
      provenance: manifest.provenance,
    };
  };

  const heightAt = createDemHeightAt(activeLayers, manifest.coverage);

  return {
    type: 'heightFunction',
    provenance: { ...manifest.provenance },
    coverage: { ...manifest.coverage },
    heightAt,
    ensureLayersFor: async (latDeg, lonDegE) => {
      await ensureWithDiff(latDeg, lonDegE);
    },
    createMeshLoader: () =>
      new WorkerTerrainMeshLoader(
        () =>
          new Worker(new URL('../../terrain/localMesh.worker.ts', import.meta.url), {
            type: 'module',
          }),
        {
          type: 'init',
          layers: [...activeLayers],
          coverage: manifest.coverage,
          provenance: manifest.provenance,
        },
        (req) => ensureWithDiff(req.latDeg, req.lonDegE),
      ),
  };
}
