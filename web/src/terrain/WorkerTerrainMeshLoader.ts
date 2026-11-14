import type { LocalTerrainMesh, TerrainMeshLoader, TerrainMeshRequest } from '../data/contract';
import { validateCoordinates } from '../geo/coordinates';
import type { DemInitMessage, MeshBuildRequest, MeshBuildResponse, MeshWorker } from './workerProtocol';

interface PendingMesh { id: number; cancel(message: string): void }
const abortError = (message: string) => new DOMException(message, 'AbortError');

/** One lazy owned Worker, one in-flight request and two LRU source meshes.
 * Every load represents the latest consumer intent: it supersedes an older job,
 * including when the requested result is cached. Abort terminates CPU work rather
 * than queuing a cancellation behind synchronous geometry generation.
 */
export class WorkerTerrainMeshLoader implements TerrainMeshLoader {
  private worker: MeshWorker | null = null;
  private pending: PendingMesh | null = null;
  private readonly cache = new Map<string, LocalTerrainMesh>();
  private nextId = 0;
  private disposed = false;

  constructor(
    private readonly createWorker: () => MeshWorker,
    private readonly initMessage?: DemInitMessage,
    private readonly prepareForRequest?: (request: TerrainMeshRequest) => Promise<DemInitMessage | null>,
  ) {}

  load(request: TerrainMeshRequest, signal?: AbortSignal): Promise<LocalTerrainMesh> {
    if (this.disposed) return Promise.reject(new Error('Terrain mesh loader is disposed'));
    if (signal?.aborted) return Promise.reject(abortError('Terrain mesh request aborted'));
    let normalized: TerrainMeshRequest;
    try {
      const point = validateCoordinates(request.latDeg, request.lonDegE);
      if (request.quality !== 'balanced' && request.quality !== 'high') throw new RangeError('Unknown mesh quality');
      normalized = { ...point, quality: request.quality };
    } catch (reason) { return Promise.reject(reason); }
    const key = JSON.stringify([normalized.latDeg, normalized.lonDegE, normalized.quality]);
    this.pending?.cancel('Terrain mesh request superseded');
    const cached = this.cache.get(key);
    if (cached) {
      this.cache.delete(key); this.cache.set(key, cached);
      // No postMessage/transfer on cache hits: returned client arrays remain usable.
      return Promise.resolve(cached);
    }
    let worker: MeshWorker;
    const isNewWorker = this.worker === null;
    try { worker = this.worker ?? this.createWorker(); this.worker = worker; }
    catch (reason) { return Promise.reject(reason); }
    if (isNewWorker && this.initMessage) {
      try { worker.postMessage(this.initMessage); }
      catch (reason) { this.worker = null; worker.terminate(); return Promise.reject(reason); }
    }
    const id = ++this.nextId;
    // The project targets ES2022; Worker event completion uses its Promise executor.
    return new Promise<LocalTerrainMesh>((resolve, reject) => {
      const current = () => this.pending?.id === id && this.worker === worker;
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        worker.removeEventListener('messageerror', onMessageError);
      };
      const fail = (reason: unknown) => {
        if (!current()) return;
        cleanup(); this.pending = null; this.worker = null;
        worker.terminate();
        reject(reason);
      };
      const onAbort = () => fail(abortError('Terrain mesh request aborted'));
      const onError = (event: ErrorEvent) => fail(new Error(event.message || 'Terrain mesh Worker failed'));
      const onMessageError = () => fail(new Error('Terrain mesh Worker response could not be decoded'));
      const onMessage = (event: MessageEvent<MeshBuildResponse>) => {
        if (!current() || event.data.id !== id) return;
        if (event.data.type === 'error') {
          const error = event.data.name === 'RangeError' ? new RangeError(event.data.message) : new Error(event.data.message);
          error.name = event.data.name;
          fail(error); return;
        }
        if (event.data.type !== 'mesh') return;
        cleanup(); this.pending = null;
        this.cache.set(key, event.data.mesh);
        while (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value!);
        resolve(event.data.mesh);
      };
      this.pending = { id, cancel: (message) => fail(abortError(message)) };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.addEventListener('messageerror', onMessageError);
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      const message: MeshBuildRequest = { type: 'build', id, request: normalized };
      const postBuild = () => {
        if (!current()) return;
        try { worker.postMessage(message); }
        catch (reason) { fail(reason); }
      };
      if (this.prepareForRequest) {
        void this.prepareForRequest(normalized).then(
          (updatedInit) => {
            if (!current()) return;
            if (updatedInit) {
              try { worker.postMessage(updatedInit); }
              catch (reason) { fail(reason); return; }
            }
            postBuild();
          },
          fail,
        );
      } else {
        postBuild();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending?.cancel('Terrain mesh loader disposed');
    this.worker?.terminate();
    this.worker = null;
    this.cache.clear();
  }
}
