import type { CoverageBounds, Provenance } from '../contract';
import { southPolarForward, validateCoordinates } from '../../geo/coordinates';

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
  coverage: CoverageBounds = { southDeg: -90, northDeg: -84, westDegE: 0, eastDegE: 360 },
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
