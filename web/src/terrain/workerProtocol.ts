import type { CoverageBounds, LocalTerrainMesh, Provenance, TerrainMeshRequest } from '../data/contract';
import type { DemLayerData } from '../data/pilot/demTerrain';

export interface DemInitMessage {
  type: 'init';
  layers: DemLayerData[];
  coverage: CoverageBounds;
  provenance: Provenance;
}

export interface MeshBuildRequest { type: 'build'; id: number; request: TerrainMeshRequest }
export type WorkerInboundMessage = DemInitMessage | MeshBuildRequest;

export type MeshBuildResponse =
  | { type: 'mesh'; id: number; mesh: LocalTerrainMesh }
  | { type: 'error'; id: number; name: string; message: string };

/** Injectable transport boundary for deterministic client tests, never a production fallback. */
export type MeshWorker = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;
