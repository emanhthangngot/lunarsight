import type { DemManifest } from './demTerrain';

export const TERRAIN_CONTENT_POLICY = 'pilot-terrain-f64be-sha256-v1';
export const TERRAIN_VALIDITY_METHOD = 'pilot-validity-v1';
export const HORIZON_METHOD = 'spherical-raymarch-25m-4percent-v1';

export interface PresetDependencyClaims {
  terrainContentHash?: string | null;
  terrainContentHashPolicy?: string | null;
  contentHash?: string | null;
  queryHash?: string | null;
  horizonMethod?: string | null;
  observer?: { metadataOrigin?: string } | null;
}
const present = (value: unknown) => value !== null && value !== undefined;
const isSha256 = (value: unknown): value is string => typeof value === 'string' && /^[a-fA-F0-9]{64}$/.test(value);

export function generatedTerrainClaims(manifest: DemManifest): boolean {
  return [manifest.terrainContentHash, manifest.terrainContentHashPolicy,
    manifest.provenance.contentHash, manifest.provenance.method].some(present);
}

export function generatedPresetClaims(asset: PresetDependencyClaims): boolean {
  return [asset.terrainContentHash, asset.terrainContentHashPolicy, asset.contentHash,
    asset.queryHash, asset.horizonMethod].some(present) ||
    (present(asset.observer) && asset.observer?.metadataOrigin !== 'legacy-pipeline-height');
}

export function validateGeneratedTerrainHeader(manifest: DemManifest): boolean {
  if (!generatedTerrainClaims(manifest)) return false;
  if (manifest.terrainContentHashPolicy !== TERRAIN_CONTENT_POLICY || !isSha256(manifest.terrainContentHash) ||
      (present(manifest.provenance.method) && manifest.provenance.method !== TERRAIN_VALIDITY_METHOD)) {
    throw new Error('Unsupported or incomplete generated terrain dependency policy; do not treat it as legacy data.');
  }
  if (!Array.isArray(manifest.layers) || manifest.layers.length === 0 ||
      new Set(manifest.layers.map((layer) => layer.id)).size !== manifest.layers.length ||
      manifest.layers.some((layer) => !isSha256(layer.sha256))) {
    throw new Error('Generated terrain requires unique layers with actual binary SHA-256 declarations.');
  }
  return true;
}

/** Fixed ASCII wire format, avoiding Python/JS numeric JSON serialization drift.
 * Hex values are IEEE754 Float64 big-endian bytes, in the declared field order.
 */
export async function terrainDependencyHash(manifest: DemManifest, actualHashes: ReadonlyMap<string, string>): Promise<string> {
  const buffer = new ArrayBuffer(8), view = new DataView(buffer), bytes = new Uint8Array(buffer);
  const hexNumber = (number: number): string => {
    if (!Number.isFinite(number)) throw new Error('Nonfinite generated terrain geometry');
    view.setFloat64(0, number, false);
    let hex = '';
    for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
    return hex;
  };
  const coverage = manifest.coverage;
  if (!(coverage.southDeg >= -90 && coverage.southDeg <= coverage.northDeg && coverage.northDeg <= 90 &&
        coverage.westDegE >= 0 && coverage.westDegE <= coverage.eastDegE && coverage.eastDegE <= 360)) {
    throw new Error('Invalid generated terrain coverage');
  }
  const bounds = [coverage.southDeg, coverage.northDeg, coverage.westDegE, coverage.eastDegE].map(hexNumber);
  const layers = manifest.layers.map((layer) => {
    if (!Number.isInteger(layer.rows) || !Number.isInteger(layer.cols) || layer.rows < 2 || layer.cols < 2 || layer.spacingM <= 0) {
      throw new Error('Invalid generated terrain grid geometry');
    }
    const actual = actualHashes.get(layer.id);
    if (!isSha256(actual) || !isSha256(layer.sha256) || actual.toLowerCase() !== layer.sha256.toLowerCase()) {
      throw new Error(`Generated terrain bytes contradict layer ${layer.id}'s declared dependency`);
    }
    return [layer.xMinM, layer.yMaxM, layer.spacingM, layer.rows, layer.cols].map(hexNumber).concat(actual.toLowerCase());
  });
  const payload = [TERRAIN_CONTENT_POLICY, TERRAIN_VALIDITY_METHOD, 'R=1737400m', bounds, layers];
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
