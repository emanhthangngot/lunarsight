import { describe, expect, it } from 'vitest';
import type { LocalTerrainMesh, TerrainMeshRequest } from '../data/contract';
import { WorkerTerrainMeshLoader } from './WorkerTerrainMeshLoader';
import type { MeshBuildRequest, MeshBuildResponse, MeshWorker } from './workerProtocol';

// Controlled transport only: production always supplies a native module Worker.
// These cases do not claim browser-thread execution, transfer or WebGL coverage.
class ControlledWorker extends EventTarget {
  requests: MeshBuildRequest[] = [];
  terminated = false;
  postMessage(message: MeshBuildRequest): void { this.requests.push(message); }
  terminate(): void { this.terminated = true; }
  reply(mesh: LocalTerrainMesh, request = this.requests.at(-1)!): void {
    const data: MeshBuildResponse = { type: 'mesh', id: request.id, mesh };
    this.dispatchEvent(new MessageEvent('message', { data }));
  }
}
function transport() {
  const workers: ControlledWorker[] = [];
  const loader = new WorkerTerrainMeshLoader(() => {
    const worker = new ControlledWorker(); workers.push(worker);
    return worker as unknown as MeshWorker;
  });
  return { loader, workers };
}
const a: TerrainMeshRequest = { latDeg: -88.5, lonDegE: 0, quality: 'balanced' };
const b: TerrainMeshRequest = { latDeg: -88.6, lonDegE: 20, quality: 'balanced' };
function meshFor(request: TerrainMeshRequest): LocalTerrainMesh {
  return {
    origin: { latDeg: request.latDeg, lonDegE: request.lonDegE, heightM: 50 },
    chunks: [{ id: request.quality, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, -1]), normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), heightsM: new Float32Array([50, 50, 50]) }],
    maxRangeM: 1, partialCoverage: false, minHeightM: 50, maxHeightM: 50,
    provenance: { kind: 'mock', source: 'Synthetic transport fixture', version: '1', generatedAt: '2026-01-01T00:00:00Z' },
  };
}

describe('owned mesh loader cancellation and cache contract', () => {
  it('rejects superseded work and cannot publish an obsolete Worker response', async () => {
    const { loader, workers } = transport();
    const first = loader.load(a);
    const cancelled = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const second = loader.load(b);
    await cancelled;
    expect(workers[0]!.terminated).toBe(true);
    let settled = false;
    const observed = second.then(() => { settled = true; });
    workers[0]!.reply(meshFor(a));
    await Promise.resolve();
    expect(settled).toBe(false);
    const newest = meshFor(b);
    workers[1]!.reply(newest);
    expect(await second).toBe(newest);
    await observed;
    loader.dispose();
  });

  it('rejects abort/dispose promptly and keeps settled callers from cancelling new work', async () => {
    const { loader, workers } = transport();
    const controller = new AbortController();
    const first = loader.load(a, controller.signal);
    const firstMesh = meshFor(a); workers[0]!.reply(firstMesh);
    expect(await first).toBe(firstMesh);
    const nextController = new AbortController();
    const second = loader.load(b, nextController.signal);
    controller.abort(); // Listener from the settled call must no longer own this job.
    const secondMesh = meshFor(b); workers[0]!.reply(secondMesh);
    expect(await second).toBe(secondMesh);
    const pending = loader.load({ ...a, quality: 'high' }, nextController.signal);
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    nextController.abort();
    await cancelled;
    expect(workers[0]!.terminated).toBe(true);
    const active = loader.load({ ...b, quality: 'high' });
    const disposed = expect(active).rejects.toMatchObject({ name: 'AbortError' });
    loader.dispose();
    await disposed;
    expect(workers[1]!.terminated).toBe(true);
    await expect(loader.load(a)).rejects.toThrow('disposed');
  });

  it('returns usable cached arrays, touches LRU order and evicts the third source mesh', async () => {
    const { loader, workers } = transport();
    const first = loader.load(a), meshA = meshFor(a); workers[0]!.reply(meshA); await first;
    const second = loader.load(b), meshB = meshFor(b); workers[0]!.reply(meshB); await second;
    expect(await loader.load({ ...a, lonDegE: 360 })).toBe(meshA);
    const c: TerrainMeshRequest = { ...a, quality: 'high' };
    const third = loader.load(c), meshC = meshFor(c); workers[0]!.reply(meshC); await third;
    const reloadB = loader.load(b), newB = meshFor(b); workers[0]!.reply(newB);
    expect(await reloadB).toBe(newB);
    expect(meshA.chunks[0]!.positions.byteLength).toBeGreaterThan(0);
    expect(Array.from(meshA.chunks[0]!.positions)).toEqual([0, 0, 0, 1, 0, 0, 0, 0, -1]);
    loader.dispose();
  });

  it('does not start a Worker for an already-aborted request or silently build on the main thread', async () => {
    const { loader, workers } = transport();
    const controller = new AbortController(); controller.abort();
    await expect(loader.load(a, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(workers).toHaveLength(0);
    loader.dispose();
    const unavailable = new WorkerTerrainMeshLoader(() => { throw new Error('Worker unavailable'); });
    await expect(unavailable.load(a)).rejects.toThrow('Worker unavailable');
    unavailable.dispose();
  });
});
