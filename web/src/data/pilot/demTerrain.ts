import type { CoverageBounds, Provenance, TerrainSource } from '../contract';
import { southPolarForward, validateCoordinates } from '../../geo/coordinates';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import type { DemInitMessage } from '../../terrain/workerProtocol';
import { terrainDependencyHash, validateGeneratedTerrainHeader } from './terrainDependency';

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
  sha256?: string;
}

export interface DemManifest {
  version: string;
  coverage: CoverageBounds;
  provenance: Provenance & { contentHash?: string | null; method?: string | null };
  layers: DemLayerMeta[];
  terrainContentHash?: string | null;
  terrainContentHashPolicy?: string | null;
}

export interface DemLayerData {
  xMinM: number;
  yMaxM: number;
  spacingM: number;
  rows: number;
  cols: number;
  data: Float32Array;
}

interface LoadedDemLayerData extends DemLayerData { contentHash: string }

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buffer));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
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
  /** Generated presets need a whole-pack proof; legacy compatibility returns null. */
  verifyGeneratedDependency(): Promise<string | null>;
}

function layerMatchesPoint(meta: DemLayerMeta, xM: number, yM: number, padM = 2000): boolean {
  const xMin = meta.xMinM;
  const xMax = meta.xMinM + meta.cols * meta.spacingM;
  const yMax = meta.yMaxM;
  const yMin = meta.yMaxM - meta.rows * meta.spacingM;
  return xM >= xMin - padM && xM <= xMax + padM && yM >= yMin - padM && yM <= yMax + padM;
}

async function fetchLayerBinary(meta: DemLayerMeta, url: string): Promise<LoadedDemLayerData> {
  const resp = await fetch(url);
  if (!resp.ok) {
    if (resp.status === 409) throw new Error('Scientific terrain data changed; reload the workspace to obtain a matching manifest.');
    throw new Error(`Failed to load DEM layer ${meta.id} (${resp.status})`);
  }
  const buffer = await resp.arrayBuffer();
  const data = new Float32Array(buffer);
  if (data.length !== meta.rows * meta.cols) {
    throw new Error(`DEM layer ${meta.id} size mismatch: expected ${meta.rows * meta.cols}, got ${data.length}`);
  }
  const contentHash = await sha256(buffer);
  if (meta.sha256 && meta.sha256.toLowerCase() !== contentHash) {
    throw new Error(`DEM layer ${meta.id} content checksum does not match the source manifest`);
  }
  return {
    xMinM: meta.xMinM,
    yMaxM: meta.yMaxM,
    spacingM: meta.spacingM,
    rows: meta.rows,
    cols: meta.cols,
    data,
    contentHash,
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
  const loadedById = new Map<string, LoadedDemLayerData>();
  const inFlight = new Map<string, Promise<LoadedDemLayerData>>();
  const activeLayers: DemLayerData[] = [];
  const provenance = { ...manifest.provenance };
  let revision = 0;
  let snapshotPromise: Promise<DemInitMessage> | null = null;
  let dependencyPromise: Promise<string | null> | null = null;

  const syncSortedLayers = () => {
    const ordered: DemLayerData[] = [];
    for (const meta of manifest.layers) {
      const loaded = loadedById.get(meta.id);
      if (loaded) ordered.push(loaded);
    }
    if (ordered.length !== activeLayers.length || ordered.some((layer, index) => layer !== activeLayers[index])) {
      activeLayers.splice(0, activeLayers.length, ...ordered);
      revision++;
      snapshotPromise = null;
    }
  };

  const loadMetas = async (metas: DemLayerMeta[]): Promise<void> => {
    await Promise.all(metas.filter((meta) => !loadedById.has(meta.id)).map(async (meta) => {
      let pending = inFlight.get(meta.id);
      if (!pending) {
        pending = fetchLayerBinary(meta, resolveLayerUrl(meta)).then(
          (layer) => { loadedById.set(meta.id, layer); inFlight.delete(meta.id); return layer; },
          (reason) => { inFlight.delete(meta.id); throw reason; },
        );
        inFlight.set(meta.id, pending);
      }
      await pending;
    }));
    syncSortedLayers();
  };

  const snapshotForCurrentLayers = async (): Promise<DemInitMessage> => {
    const atRevision = revision;
    if (!snapshotPromise) {
      const layers = [...activeLayers];
      const members = manifest.layers.filter((meta) => loadedById.has(meta.id)).map((meta) => {
        const layer = loadedById.get(meta.id)!;
        return [meta.id, layer.xMinM, layer.yMaxM, layer.spacingM, layer.rows, layer.cols, layer.contentHash];
      });
      const encoded = new TextEncoder().encode(JSON.stringify(['dem-mesh-v2', manifest.version, manifest.provenance.source, manifest.provenance.version, manifest.coverage, members]));
      snapshotPromise = sha256(encoded.buffer).then<DemInitMessage>((identity) => ({
        type: 'init',
        layers,
        identity,
        coverage: { ...manifest.coverage },
        provenance: {
          ...manifest.provenance,
          notes: `${manifest.provenance.notes ?? ''} Effective ordered DEM snapshot SHA-256 ${identity}; loaded layer bytes and geometry, not a scientific-validation claim.`,
        },
      }));
    }
    const snapshot = await snapshotPromise;
    // Another site's fine-layer fetch may finish while hashing. Never publish a
    // preparation result that already lost to the current complete layer state.
    if (atRevision !== revision) return snapshotForCurrentLayers();
    if (snapshot.provenance.notes === undefined) delete provenance.notes;
    else provenance.notes = snapshot.provenance.notes;
    return snapshot;
  };

  const ensureSnapshot = async (latDeg: number, lonDegE: number): Promise<DemInitMessage> => {
    const point = validateCoordinates(latDeg, lonDegE);
    const { xM, yM } = southPolarForward(point.latDeg, point.lonDegE);
    await loadMetas(manifest.layers.filter((meta) => layerMatchesPoint(meta, xM, yM)));
    return snapshotForCurrentLayers();
  };

  const verifyGeneratedDependency = (): Promise<string | null> => {
    if (!dependencyPromise) {
      dependencyPromise = (async () => {
        if (!validateGeneratedTerrainHeader(manifest)) return null;
        // This eager proof is generated-only: a declared whole-mosaic preset
        // cannot be certified by hashes of only the selected near-field tiles.
        await loadMetas(manifest.layers);
        await snapshotForCurrentLayers();
        const actualHashes = new Map([...loadedById].map(([id, layer]) => [id, layer.contentHash]));
        const actual = await terrainDependencyHash(manifest, actualHashes);
        if (actual !== manifest.terrainContentHash?.toLowerCase()) {
          throw new Error('Generated terrain dependency contradicts the current ordered DEM bytes/geometry.');
        }
        return actual;
      })().catch((reason) => { dependencyPromise = null; throw reason; });
    }
    return dependencyPromise;
  };

  const regionalMetas = manifest.layers.filter((meta) => !meta.siteId);
  await loadMetas(regionalMetas.length > 0 ? regionalMetas : manifest.layers);
  await snapshotForCurrentLayers();
  const heightAt = createDemHeightAt(activeLayers, manifest.coverage);
  return {
    type: 'heightFunction',
    provenance,
    coverage: { ...manifest.coverage },
    heightAt,
    ensureLayersFor: async (latDeg, lonDegE) => { await ensureSnapshot(latDeg, lonDegE); },
    verifyGeneratedDependency,
    createMeshLoader: () => new WorkerTerrainMeshLoader(
      () => new Worker(new URL('../../terrain/localMesh.worker.ts', import.meta.url), { type: 'module' }),
      (request) => ensureSnapshot(request.latDeg, request.lonDegE),
    ),
  };
}
