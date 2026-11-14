import type { EphemerisSeries, HorizonMask, LunarDataProvider, SiteSummary, TerrainSource } from '../contract';
import { validateCoordinates } from '../../geo/coordinates';
import { WorkerTerrainMeshLoader } from '../../terrain/WorkerTerrainMeshLoader';
import { createDemHeightAt, type DemLayerData, type DemManifest } from '../pilot/demTerrain';

type SiteLocation = Pick<SiteSummary, 'id' | 'latDeg' | 'lonDegE'>;

async function readErrorDetail(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown };
    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }
  } catch {
    // Ignore non-JSON error bodies
  }
  return fallback;
}

/**
 * ApiDataProvider connects the Three.js workspace to the LunarSight FastAPI backend
 * without changing UI or Worker contracts.
 */
export class ApiDataProvider implements LunarDataProvider {
  readonly kind = 'processed' as const;
  private readonly baseUrl: string;
  private terrainPromise: Promise<TerrainSource> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private resolveUrl(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  async listSites(): Promise<SiteSummary[]> {
    const resp = await fetch(this.resolveUrl('/api/sites'));
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load sites (${resp.status})`));
    }
    return (await resp.json()) as SiteSummary[];
  }

  async getTerrain(): Promise<TerrainSource> {
    if (!this.terrainPromise) {
      this.terrainPromise = this.loadTerrain().catch((error) => {
        this.terrainPromise = null;
        throw error;
      });
    }
    return this.terrainPromise;
  }

  private async loadTerrain(): Promise<TerrainSource> {
    const manifestResp = await fetch(this.resolveUrl('/api/terrain/manifest'));
    if (!manifestResp.ok) {
      throw new Error(await readErrorDetail(manifestResp, `Failed to load terrain manifest (${manifestResp.status})`));
    }
    const manifest = (await manifestResp.json()) as DemManifest;

    const layers: DemLayerData[] = await Promise.all(
      manifest.layers.map(async (meta) => {
        const resp = await fetch(this.resolveUrl(meta.url));
        if (!resp.ok) {
          throw new Error(`Failed to load DEM layer ${meta.id} (${resp.status})`);
        }
        const buffer = await resp.arrayBuffer();
        const data = new Float32Array(buffer);
        if (data.length !== meta.rows * meta.cols) {
          throw new Error(`DEM layer ${meta.id} size mismatch: expected ${meta.rows * meta.cols}, got ${data.length}`);
        }
        return {
          xMinM: meta.xMinM,
          yMaxM: meta.yMaxM,
          spacingM: meta.spacingM,
          rows: meta.rows,
          cols: meta.cols,
          data,
        };
      }),
    );

    const heightAt = createDemHeightAt(layers, manifest.coverage);

    return {
      type: 'heightFunction',
      provenance: { ...manifest.provenance },
      coverage: { ...manifest.coverage },
      heightAt,
      createMeshLoader: () =>
        new WorkerTerrainMeshLoader(
          () =>
            new Worker(new URL('../../terrain/localMesh.worker.ts', import.meta.url), {
              type: 'module',
            }),
          {
            type: 'init',
            layers,
            coverage: manifest.coverage,
            provenance: manifest.provenance,
          },
        ),
    };
  }

  async getHorizonMask(site: SiteLocation, observerHeightM: number): Promise<HorizonMask | null> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }

    const params = new URLSearchParams({
      latDeg: String(point.latDeg),
      lonDegE: String(point.lonDegE),
      observerHeightM: String(observerHeightM),
    });
    if (!site.id.startsWith('custom:')) {
      params.set('siteId', site.id);
    }

    const resp = await fetch(this.resolveUrl(`/api/horizon?${params.toString()}`));
    if (resp.status === 404) {
      return null;
    }
    if (resp.status === 422) {
      throw new RangeError(await readErrorDetail(resp, 'Horizon mask input is invalid or outside coverage'));
    }
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load horizon mask (${resp.status})`));
    }
    return (await resp.json()) as HorizonMask;
  }

  async getEphemeris(
    site: SiteLocation,
    startUtcMs: number,
    endUtcMs: number,
    stepSeconds: number,
    observerHeightM = 0,
  ): Promise<EphemerisSeries> {
    const point = validateCoordinates(site.latDeg, site.lonDegE);
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0) {
      throw new RangeError('Observer height must be finite and nonnegative');
    }
    if (![startUtcMs, endUtcMs, stepSeconds].every(Number.isFinite) || endUtcMs < startUtcMs || stepSeconds <= 0) {
      throw new RangeError('Use finite UTC bounds, end >= start, and a positive step');
    }

    const params = new URLSearchParams({
      latDeg: String(point.latDeg),
      lonDegE: String(point.lonDegE),
      startUtcMs: String(Math.round(startUtcMs)),
      endUtcMs: String(Math.round(endUtcMs)),
      stepSeconds: String(Math.round(stepSeconds)),
      observerHeightM: String(observerHeightM),
    });
    if (!site.id.startsWith('custom:')) {
      params.set('siteId', site.id);
    }

    const resp = await fetch(this.resolveUrl(`/api/ephemeris?${params.toString()}`));
    if (resp.status === 422 || resp.status === 404) {
      throw new RangeError(
        await readErrorDetail(resp, 'Requested coordinates or time window are outside coverage'),
      );
    }
    if (!resp.ok) {
      throw new Error(await readErrorDetail(resp, `Failed to load ephemeris (${resp.status})`));
    }
    return (await resp.json()) as EphemerisSeries;
  }
}
