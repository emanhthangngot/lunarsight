import type { LocalTerrainMesh, TerrainMeshRequest } from '../data/contract';

export interface MeshBuildRequest { type: 'build'; id: number; request: TerrainMeshRequest }
export type MeshBuildResponse =
  | { type: 'mesh'; id: number; mesh: LocalTerrainMesh }
  | { type: 'error'; id: number; name: string; message: string };

/** Injectable transport boundary for deterministic client tests, never a production fallback. */
export type MeshWorker = Pick<Worker, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'terminate'>;
