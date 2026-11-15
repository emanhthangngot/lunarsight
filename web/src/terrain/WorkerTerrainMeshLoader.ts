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
  private workerIdentity: string | null = null;
  private pending: PendingMesh | null = null;
  private readonly cache = new Map<string, LocalTerrainMesh>();
  private nextId = 0;
  private disposed = false;

  constructor(
    private readonly createWorker: () => MeshWorker,
    private readonly prepareForRequest?: (request: TerrainMeshRequest) => Promise<DemInitMessage>,
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
    this.pending?.cancel('Terrain mesh request superseded');
    const id = ++this.nextId;
    return new Promise<LocalTerrainMesh>((resolve, reject) => {
      let worker: MeshWorker | null = null;
      let key = '';
      const current = () => this.pending?.id === id;
      const cleanup = () => {
        signal?.removeEventListener('abort', onAbort);
        worker?.removeEventListener('message', onMessage);
        worker?.removeEventListener('error', onError);
        worker?.removeEventListener('messageerror', onMessageError);
      };
      const fail = (reason: unknown) => {
        if (!current()) return;
        cleanup();
        this.pending = null;
        (worker ?? this.worker)?.terminate();
        this.worker = null;
        this.workerIdentity = null;
        reject(reason);
      };
      const onAbort = () => fail(abortError('Terrain mesh request aborted'));
      const onError = (event: ErrorEvent) => fail(new Error(event.message || 'Terrain mesh Worker failed'));
      const onMessageError = () => fail(new Error('Terrain mesh Worker response could not be decoded'));
      const onMessage = (event: MessageEvent<MeshBuildResponse>) => {
        if (!current() || this.worker !== worker || event.data.id !== id) return;
        if (event.data.type === 'error') {
          const error = event.data.name === 'RangeError' ? new RangeError(event.data.message) : new Error(event.data.message);
          error.name = event.data.name;
          fail(error);
          return;
        }
        if (event.data.type !== 'mesh') return;
        cleanup();
        this.pending = null;
        this.cache.set(key, event.data.mesh);
        while (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value!);
        resolve(event.data.mesh);
      };
      const build = (init?: DemInitMessage) => {
        if (!current()) return;
        const identity = init?.identity ?? 'mock-1.1.0';
        key = JSON.stringify([normalized.latDeg, normalized.lonDegE, normalized.quality, identity]);
        const cached = this.cache.get(key);
        if (cached) {
          this.cache.delete(key);
          this.cache.set(key, cached);
          cleanup();
          this.pending = null;
          resolve(cached);
          return;
        }
        try {
          worker = this.worker ?? this.createWorker();
          this.worker = worker;
          worker.addEventListener('message', onMessage);
          worker.addEventListener('error', onError);
          worker.addEventListener('messageerror', onMessageError);
          // Every new/recreated Worker receives the freshly prepared complete
          // snapshot, even when no layer fetch occurred.
          if (init && this.workerIdentity !== identity) worker.postMessage(init);
          this.workerIdentity = identity;
          const message: MeshBuildRequest = { type: 'build', id, request: normalized };
          worker.postMessage(message);
        } catch (reason) { fail(reason); }
      };
      this.pending = { id, cancel: (message) => fail(abortError(message)) };
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      if (this.prepareForRequest) {
        // Preparation precedes cache lookup: loaded DEM content, not just the
        // site/quality label, decides whether a cached mesh is reusable.
        try { void this.prepareForRequest(normalized).then(build, fail); }
        catch (reason) { fail(reason); }
      } else {
        build();
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending?.cancel('Terrain mesh loader disposed');
    this.worker?.terminate();
    this.worker = null;
    this.workerIdentity = null;
    this.cache.clear();
  }
}
