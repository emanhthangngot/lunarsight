import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalTerrainMesh, TerrainMeshRequest } from '../contract';
import { southPolarForward } from '../../geo/coordinates';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import { buildLocalTerrainMesh } from '../../terrain/buildLocalTerrainMesh';
import type { DemInitMessage, MeshBuildRequest, MeshWorker, WorkerInboundMessage } from '../../terrain/workerProtocol';
import { createDemHeightAt, createLazyDemTerrainSource, type DemManifest, type LazyDemTerrainSource } from './demTerrain';

const site = { latDeg: -89.5, lonDegE: 180 };
const request: TerrainMeshRequest = { ...site, quality: 'balanced' };
const provenance = { kind: 'processed' as const, source: 'Synthetic constant-plane transport fixture', version: 'same-version', generatedAt: '2027-01-01T00:00:00Z' };

// Controlled Worker boundary, not proof of native threads. It samples the received
// DEM exactly where a mesh observer is anchored; the independent fixture oracle
// is the known constant plane (100 m coarse / 500 m fine), not a source-text echo.
function transport(realGeometry = false) {
  const workers: PlaneWorker[] = [];
  let hold = false;
  let started: (() => void) | undefined;
  class PlaneWorker extends EventTarget {
    init: DemInitMessage | undefined;
    pending: MeshBuildRequest | undefined;
    terminated = false;
    constructor() { super(); workers.push(this); }
    terminate() { this.terminated = true; }
    postMessage(message: WorkerInboundMessage) {
      if (message.type === 'init') { this.init = message; return; }
      this.pending = message;
      started?.(); started = undefined;
      if (!hold) this.reply();
    }
    reply(job: MeshBuildRequest = this.pending!) {
      const init = this.init!;
      const heightAt = createDemHeightAt(init.layers, init.coverage);
      const ground = heightAt(job.request.latDeg, job.request.lonDegE);
      if (ground === null) throw new Error('Synthetic observer unexpectedly unavailable');
      const mesh: LocalTerrainMesh = realGeometry ? buildLocalTerrainMesh(job.request, heightAt, init.provenance) : {
        origin: { latDeg: job.request.latDeg, lonDegE: job.request.lonDegE, heightM: ground },
        chunks: [{ id: 'plane', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, -1]), normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]), heightsM: new Float32Array([ground, ground, ground]) }],
        maxRangeM: 1, partialCoverage: false, minHeightM: ground, maxHeightM: ground, provenance,
      };
      this.dispatchEvent(new MessageEvent('message', { data: { type: 'mesh', id: job.id, mesh } }));
    }
  }
  vi.stubGlobal('Worker', PlaneWorker);
  return { workers, setHold(value: boolean) { hold = value; }, nextBuild() { return new Promise<void>((resolve) => { started = resolve; }); } };
}

async function source(): Promise<LazyDemTerrainSource> {
  const { xM, yM } = southPolarForward(site.latDeg, site.lonDegE);
  const manifest: DemManifest = {
    version: 'same-version', coverage: { southDeg: -90, northDeg: -78, westDegE: 0, eastDegE: 360 }, provenance,
    layers: [
      { id: 'fine', siteId: 'fixture', url: '/fine.bin', xMinM: xM - 1000, yMaxM: yM + 1000, spacingM: 1000, rows: 2, cols: 2, minHeightM: 500, maxHeightM: 500, source: 'Synthetic fine plane' },
      { id: 'coarse', url: '/coarse.bin', xMinM: xM - 100000, yMaxM: yM + 100000, spacingM: 100000, rows: 2, cols: 2, minHeightM: 100, maxHeightM: 100, source: 'Synthetic coarse plane' },
    ],
  };
  vi.stubGlobal('fetch', async (url: string) => new Response(new Float32Array(url === '/fine.bin' ? [500, 500, 500, 500] : [100, 100, 100, 100]).buffer));
  return createLazyDemTerrainSource(manifest, (meta) => meta.url);
}

function init(height: number, identity: string): DemInitMessage {
  const { xM, yM } = southPolarForward(site.latDeg, site.lonDegE);
  return { type: 'init', identity, coverage: { southDeg: -90, northDeg: -78, westDegE: 0, eastDegE: 360 }, provenance,
    layers: [{ xMinM: xM - 10, yMaxM: yM + 10, spacingM: 10, rows: 2, cols: 2, data: new Float32Array([height, height, height, height]) }] };
}

describe('effective DEM state at the mesh boundary', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('uses fine ground when it was preloaded after loader creation but before its first build', async () => {
    transport();
    const terrain = await source();
    const loader = terrain.createMeshLoader();
    await terrain.ensureLayersFor(site.latDeg, site.lonDegE);
    const mesh = await loader.load(request);
    expect(mesh.origin.heightM).toBe(500);
    expect(terrain.heightAt(site.latDeg, site.lonDegE)).toBe(500);
    loader.dispose();
  });

  it('recreates an aborted Worker with fine data even when no further binary fetch is needed', async () => {
    const wire = transport();
    const terrain = await source();
    const loader = terrain.createMeshLoader();
    expect((await loader.load(request)).origin.heightM).toBe(500);
    wire.setHold(true);
    const started = wire.nextBuild();
    const controller = new AbortController();
    const pending = loader.load({ ...request, quality: 'high' }, controller.signal);
    const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await started;
    controller.abort();
    await cancelled;
    expect(wire.workers[0]!.terminated).toBe(true);
    wire.setHold(false);
    expect((await loader.load({ ...request, quality: 'high' })).origin.heightM).toBe(500);
    loader.dispose();
  });

  it('invalidates a same-site cached mesh when a newly loaded distant patch changes actual geometry', async () => {
    transport(true); // Real pure geometry with a controlled transport, no browser thread claim.
    const terrain = await source();
    const loader = terrain.createMeshLoader();
    const nearby = { ...request, latDeg: -89.7 }; // ~6 km from the not-yet-loaded fine patch.
    const first = await loader.load(nearby);
    expect(first.origin.heightM).toBe(100);
    expect(first.maxHeightM).toBe(100);
    await terrain.ensureLayersFor(site.latDeg, site.lonDegE);
    const second = await loader.load(nearby); // Same observer, quality and nominal version.
    expect(second.origin.heightM).toBe(100);
    expect(second.maxHeightM).toBe(500); // The actual mesh now includes the distant high patch.
    expect(first.maxHeightM).toBe(100);
    loader.dispose();
  });

  it('does not post an older asynchronous preparation into the new observer request', async () => {
    const wire = transport();
    wire.setHold(true);
    const resolvers: Array<(snapshot: DemInitMessage) => void> = [];
    const loader = new WorkerTerrainMeshLoader(() => new (globalThis.Worker as unknown as new () => MeshWorker)(), () => new Promise((resolve) => { resolvers.push(resolve); }));
    const old = loader.load(request);
    const cancelled = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    const current = loader.load({ ...request, quality: 'high' });
    await cancelled;
    const started = wire.nextBuild();
    resolvers[1]!(init(500, 'current'));
    await started;
    const currentJob = wire.workers[0]!.pending!;
    resolvers[0]!(init(100, 'obsolete'));
    await Promise.resolve();
    wire.workers[0]!.reply(currentJob);
    expect((await current).origin.heightM).toBe(500);
    loader.dispose();
  });
});
