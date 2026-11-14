import { mockHeightAt, mockTerrainProvenance } from '../data/mock/terrainField';
import { buildLocalTerrainMesh } from './buildLocalTerrainMesh';
import type { MeshBuildRequest, MeshBuildResponse } from './workerProtocol';

// Structural worker typing avoids loading conflicting Window/Worker global libs.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<MeshBuildRequest>) => void) | null;
  postMessage(message: MeshBuildResponse, transfer: Transferable[]): void;
};

scope.onmessage = ({ data }) => {
  if (data.type !== 'build') return;
  try {
    const mesh = buildLocalTerrainMesh(data.request, mockHeightAt, mockTerrainProvenance());
    const buffers = new Set<ArrayBuffer>();
    for (const chunk of mesh.chunks) {
      for (const array of [chunk.positions, chunk.normals, chunk.indices, chunk.heightsM]) {
        if (!(array.buffer instanceof ArrayBuffer)) throw new Error('Mesh buffers must be transferable ArrayBuffers');
        buffers.add(array.buffer);
      }
    }
    scope.postMessage({ type: 'mesh', id: data.id, mesh }, [...buffers]);
  } catch (reason) {
    scope.postMessage({ type: 'error', id: data.id, name: reason instanceof Error ? reason.name : 'Error', message: reason instanceof Error ? reason.message : 'Terrain mesh generation failed' }, []);
  }
};
