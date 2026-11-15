export type DataKind = 'mock' | 'processed';

export interface Provenance {
  kind: DataKind;
  source: string;
  version: string;
  generatedAt: string;
  notes?: string;
}

export type SiteCategory = 'mock' | 'custom' | 'apollo' | 'clps' | 'artemis-candidate' | 'international';

export interface SiteSummary {
  id: string;
  name: string;
  category: SiteCategory;
  latDeg: number;
  lonDegE: number;
  nameVerified: boolean;
  description?: string;
  provenance: Provenance;
}

export interface CoverageBounds { southDeg: number; northDeg: number; westDegE: number; eastDegE: number }

export type TerrainMeshQuality = 'balanced' | 'high';

export interface TerrainMeshRequest {
  latDeg: number;
  lonDegE: number;
  quality: TerrainMeshQuality;
}

export interface TerrainMeshChunk {
  id: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  heightsM: Float32Array;
}

export interface LocalTerrainMesh {
  origin: { latDeg: number; lonDegE: number; heightM: number };
  chunks: TerrainMeshChunk[];
  maxRangeM: number;
  partialCoverage: boolean;
  minHeightM: number;
  maxHeightM: number;
  provenance: Provenance;
}

export interface TerrainMeshLoader {
  load(request: TerrainMeshRequest, signal?: AbortSignal): Promise<LocalTerrainMesh>;
  dispose(): void;
}

export interface TerrainSource {
  type: 'heightFunction';
  provenance: Provenance;
  coverage: CoverageBounds;
  /** Scientific CPU lookup; null=no data, heights metres above Moon sphere. */
  heightAt(latDeg: number, lonDegE: number): number | null;
  /** Consumer owns loader; Worker creation is lazy. */
  createMeshLoader(): TerrainMeshLoader;
}

export interface HorizonMask {
  siteId: string;
  observerHeightM: number;
  azimuthsDeg: number[];
  elevationsDeg: number[];
  maxRangeM: number;
  provenance: Provenance;
}

/** Observer identity retained with source-derived ephemerides; null is unrecorded,
 * not a height inferred retrospectively from a newer DEM. */
export interface EphemerisObserver {
  latDeg: number;
  lonDegE: number;
  observerHeightM: number;
  groundHeightM: number | null;
  ellipsoidAltitudeKm: number | null;
  datumStatus: 'conditional';
  metadataOrigin: 'legacy-pipeline-height' | 'pipeline-record' | 'runtime-dem-query';
}

export interface EphemerisSeries {
  siteId: string;
  frame: 'MOON_ME';
  startUtcMs: number;
  stepSeconds: number;
  timesUtcMs: number[];
  sunAzDeg: number[]; sunElDeg: number[];
  earthAzDeg: number[]; earthElDeg: number[];
  observer?: EphemerisObserver;
  provenance: Provenance;
}

export interface LunarDataProvider {
  readonly kind: DataKind;
  /** Omitted only when requested observer heights are genuinely supported. */
  readonly supportedObserverHeightsM?: readonly number[];
  listSites(): Promise<SiteSummary[]>;
  getTerrain(): Promise<TerrainSource>;
  getHorizonMask(site: Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>, observerHeightM: number): Promise<HorizonMask | null>;
  getEphemeris(site: Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>, startUtcMs: number, endUtcMs: number, stepSeconds: number, observerHeightM?: number): Promise<EphemerisSeries>;
}
