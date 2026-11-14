import type { TerrainSource } from '../contract';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import { MOCK_COVERAGE, mockHeightAt, mockTerrainProvenance } from './terrainField';

/** Data-side adapter: scientific lookup is synchronous; visual work is lazy/off-main. */
export function createMockTerrain(): TerrainSource {
  return {
    type: 'heightFunction',
    provenance: mockTerrainProvenance(),
    coverage: { ...MOCK_COVERAGE },
    heightAt: mockHeightAt,
    createMeshLoader: () => new WorkerTerrainMeshLoader(() => new Worker(
      new URL('../../terrain/localMesh.worker.ts', import.meta.url),
      { type: 'module' },
    )),
  };
}
