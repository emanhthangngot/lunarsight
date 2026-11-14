import { mockHeightAt, mockTerrainProvenance } from '../data/mock/terrainField';
import { createDemHeightAt } from '../data/pilot/demTerrain';
import { buildLocalTerrainMesh } from './buildLocalTerrainMesh';
import type { MeshBuildResponse, WorkerInboundMessage } from './workerProtocol';

// Structural worker typing avoids loading conflicting Window/Worker global libs.
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerInboundMessage>) => void) | null;
  postMessage(message: MeshBuildResponse, transfer: Transferable[]): void;
};

let activeHeightAt = mockHeightAt;
let activeProvenance = mockTerrainProvenance();

scope.onmessage = ({ data }) => {
  if (data.type === 'init') {
    activeHeightAt = createDemHeightAt(data.layers, data.coverage);
    activeProvenance = data.provenance;
    return;
  }
  if (data.type !== 'build') return;
  try {
    const mesh = buildLocalTerrainMesh(data.request, activeHeightAt, activeProvenance);
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
