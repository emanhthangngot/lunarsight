import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PilotDataProvider } from './PilotDataProvider';
import type { EphemerisObserver, EphemerisSeries, Provenance } from '../contract';
import type { DemManifest } from './demTerrain';
import type { PresetDependencyClaims } from './terrainDependency';

const observerRegistry = vi.hoisted(() => ({ sites: {} as Record<string, Partial<EphemerisObserver>> }));
vi.mock('./observerMetadata.json', () => ({ default: observerRegistry }));

interface GeneratedManifestFixture extends DemManifest {
  terrainContentHash: string;
  terrainContentHashPolicy: string;
  provenance: Provenance & { method: string };
}
interface HorizonFixture extends PresetDependencyClaims {
  siteId: string;
  azimuthsDeg: number[];
  maxRangeM: number;
  heights: Record<string, number[]>;
  provenance: Provenance;
  observer?: { latDeg: number; lonDegE: number; groundHeightM: number; observerHeightsM: number[]; datumStatus: string; metadataOrigin: string };
}
type CelestialFixture = EphemerisSeries & PresetDependencyClaims;
interface GeneratedPackFixture {
  values: Float32Array<ArrayBuffer>;
  manifest: GeneratedManifestFixture;
  horizon: HorizonFixture;
  ephemeris: CelestialFixture;
}

const start = Date.parse('2027-01-01T00:00:00Z');
const sourcePoint = { id: 'site-04', latDeg: -89.785092, lonDegE: 204.018283 };
const policy = 'pilot-terrain-f64be-sha256-v1';
const method = 'spherical-raymarch-25m-4percent-v1';
const provenance = { kind: 'processed' as const, source: 'Synthetic generated-pack fixture, not a lunar reference', version: 'same-version', generatedAt: '2027-01-01T00:00:00Z' };
const legacyObserver: EphemerisObserver = {
  latDeg: sourcePoint.latDeg, lonDegE: sourcePoint.lonDegE, observerHeightM: 1,
  groundHeightM: null, ellipsoidAltitudeKm: null,
  datumStatus: 'conditional', metadataOrigin: 'legacy-pipeline-height',
};

function pack(height = 100): GeneratedPackFixture {
  const values = new Float32Array([height, height, height, height]);
  const sha = createHash('sha256').update(new Uint8Array(values.buffer)).digest('hex');
  // Frozen wire preimage, independently specified IEEE754 values, not a call to
  // the production encoder. ±100000m / 100000m / 2x2 covers this synthetic site.
  const preimage = [policy, 'pilot-validity-v1', 'R=1737400m',
    ['c056800000000000', 'c053800000000000', '0000000000000000', '4076800000000000'],
    [['c0f86a0000000000', '40f86a0000000000', '40f86a0000000000', '4000000000000000', '4000000000000000', sha]],
  ];
  const terrainContentHash = createHash('sha256').update(JSON.stringify(preimage)).digest('hex');
  const dependency = { terrainContentHash, terrainContentHashPolicy: policy };
  const manifest = {
    version: 'same-version', coverage: { southDeg: -90, northDeg: -78, westDegE: 0, eastDegE: 360 },
    provenance: { ...provenance, method: 'pilot-validity-v1' }, ...dependency,
    layers: [{ id: 'region', url: '/data/pilot/fixture.bin', xMinM: -100000, yMaxM: 100000, spacingM: 100000,
      rows: 2, cols: 2, minHeightM: values[0]!, maxHeightM: values[0]!, source: provenance.source, sha256: sha }],
  };
  const ground = values[0]!;
  const observer = { latDeg: sourcePoint.latDeg, lonDegE: sourcePoint.lonDegE, observerHeightM: 1,
    groundHeightM: ground, ellipsoidAltitudeKm: Number(((ground + 1) / 1000).toFixed(5)),
    datumStatus: 'conditional' as const, metadataOrigin: 'pipeline-record' as const };
  const horizon = {
    siteId: sourcePoint.id, azimuthsDeg: [0, 90, 180, 270], maxRangeM: 150000, heights: { '1': [7, 8, 9, 10] },
    provenance, ...dependency, horizonMethod: method,
    observer: { latDeg: observer.latDeg, lonDegE: observer.lonDegE, groundHeightM: ground,
      observerHeightsM: [1], datumStatus: 'conditional', metadataOrigin: 'pipeline-record' },
  };
  const ephemeris: CelestialFixture = {
    siteId: sourcePoint.id, frame: 'MOON_ME', startUtcMs: start, stepSeconds: 3600,
    timesUtcMs: [start, start + 3600000], sunAzDeg: [11, 12], sunElDeg: [1, 2], earthAzDeg: [21, 22], earthElDeg: [3, 4],
    provenance, observer, ...dependency,
  };
  return { values, manifest, horizon, ephemeris };
}

function serve(
  current: GeneratedPackFixture,
  horizon: unknown = current.horizon,
  ephemeris: unknown = current.ephemeris,
  registryObserver: Partial<EphemerisObserver> | null = current.ephemeris.observer ?? null,
) {
  if (registryObserver === null) delete observerRegistry.sites[sourcePoint.id];
  else observerRegistry.sites[sourcePoint.id] = { ...registryObserver };
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('terrain_manifest.json')) return new Response(JSON.stringify(current.manifest));
    if (url.endsWith('fixture.bin')) return new Response(current.values.slice().buffer);
    if (url.endsWith('horizon_site-04.json')) return new Response(JSON.stringify(horizon));
    if (url.endsWith('ephemeris_site-04.json')) return new Response(JSON.stringify(ephemeris));
    return new Response('Unexpected synthetic request', { status: 404 });
  });
}

describe('generated static preset coherence', () => {
  beforeEach(() => { observerRegistry.sites[sourcePoint.id] = { ...legacyObserver }; });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('accepts matching actual bytes and recorded observer/query precision without relabelling them legacy', async () => {
    const current = pack(100.126);
    // Same semantic record in a different key order; registry/series are not
    // interchangeable authorities and must not be compared as JSON strings.
    serve(current, current.horizon, current.ephemeris, {
      metadataOrigin: 'pipeline-record', datumStatus: 'conditional', ellipsoidAltitudeKm: 0.10113,
      groundHeightM: current.values[0]!, observerHeightM: 1, lonDegE: sourcePoint.lonDegE, latDeg: sourcePoint.latDeg,
    });
    const provider = new PilotDataProvider();
    const mask = await provider.getHorizonMask(sourcePoint, 1);
    expect(mask?.elevationsDeg).toEqual([7, 8, 9, 10]);
    expect(mask?.provenance.notes).toContain('generated');
    const series = await provider.getEphemeris(sourcePoint, start, start + 3600000, 3600, 1);
    expect(series.sunElDeg).toEqual([1, 2]);
    expect(series.observer?.ellipsoidAltitudeKm).toBe(0.10113);
    expect(series.provenance.notes).toContain('Generated-record');
  });

  it.each<{ label: string; registry: Partial<EphemerisObserver> | null }>([
    { label: 'missing', registry: null },
    { label: 'legacy with unknown historical altitude', registry: legacyObserver },
    { label: 'recorded but unknown ground/altitude', registry: { groundHeightM: null, ellipsoidAltitudeKm: null } },
    { label: 'different coordinates', registry: { lonDegE: 205 } },
    { label: 'different height', registry: { observerHeightM: 2 } },
    { label: 'stale ground', registry: { groundHeightM: 101 } },
    { label: 'stale transmitted altitude', registry: { ellipsoidAltitudeKm: 0.102 } },
    { label: 'different metadata origin', registry: { metadataOrigin: 'runtime-dem-query' } },
  ])('rejects a generated series when its registry is $label', async ({ registry }) => {
    const current = pack(100);
    serve(current, current.horizon, current.ephemeris,
      registry === null ? null : { ...current.ephemeris.observer, ...registry });
    await expect(new PilotDataProvider().getEphemeris(sourcePoint, start, start, 3600, 1)).rejects.toThrow(/metadata registry/i);
  });

  it('does not manufacture a missing generated series observer from a recorded registry', async () => {
    const current = pack(100);
    const ephemeris = { ...current.ephemeris };
    delete ephemeris.observer;
    serve(current, current.horizon, ephemeris);
    await expect(new PilotDataProvider().getEphemeris(sourcePoint, start, start, 3600, 1)).rejects.toThrow(/metadata registry/i);
  });

  it('rejects a retained mask and celestial preset after actual terrain/manifest identity changes', async () => {
    const before = pack(100), current = pack(200);
    serve(current, before.horizon, before.ephemeris);
    const provider = new PilotDataProvider();
    await expect(provider.getHorizonMask(sourcePoint, 1)).rejects.toThrow(/preset terrain dependency/i);
    await expect(provider.getEphemeris(sourcePoint, start, start, 3600, 1)).rejects.toThrow(/preset terrain dependency/i);
  });

  it('does not certify a matching1m label and new hash while the recorded observer ground is old', async () => {
    const before = pack(100), current = pack(200);
    const dependency = { terrainContentHash: current.manifest.terrainContentHash, terrainContentHashPolicy: policy };
    serve(current, { ...before.horizon, ...dependency }, { ...before.ephemeris, ...dependency }, before.ephemeris.observer ?? null);
    const provider = new PilotDataProvider();
    await expect(provider.getHorizonMask(sourcePoint, 1)).rejects.toThrow(/observer ground/i);
    await expect(provider.getEphemeris(sourcePoint, start, start, 3600, 1)).rejects.toThrow(/observer ground/i);
  });

  it('rejects a stale actual transmitted altitude even when ground/height/hash labels match', async () => {
    const current = pack(200);
    const observer = { ...current.ephemeris.observer, ellipsoidAltitudeKm: 0.101 };
    serve(current, current.horizon, { ...current.ephemeris, observer }, observer);
    await expect(new PilotDataProvider().getEphemeris(sourcePoint, start, start, 3600, 1)).rejects.toThrow(/five-decimal pipeline query/i);
  });

  it('rejects changed bytes behind an unchanged declared hash and unsupported generated policies', async () => {
    const current = pack(100);
    current.values.fill(200); // No coherent metadata update; this is not a newly verified pack.
    serve(current);
    await expect(new PilotDataProvider().getHorizonMask(sourcePoint, 1)).rejects.toThrow(/checksum/i);
    const unsupported = pack(100);
    unsupported.horizon.terrainContentHashPolicy = 'unsupported';
    serve(unsupported);
    await expect(new PilotDataProvider().getHorizonMask(sourcePoint, 1)).rejects.toThrow(/incomplete or incompatible/i);
  });

  it('retains a wholly unqualified legacy pack as conditional without manufacturing generated proof', async () => {
    const current = pack(100);
    const manifest: DemManifest = { ...current.manifest, provenance: { ...current.manifest.provenance } };
    delete manifest.terrainContentHash;
    delete manifest.terrainContentHashPolicy;
    delete manifest.provenance.method;
    const horizon: HorizonFixture = { ...current.horizon };
    delete horizon.observer;
    delete horizon.horizonMethod;
    delete horizon.terrainContentHash;
    delete horizon.terrainContentHashPolicy;
    const ephemeris: CelestialFixture = { ...current.ephemeris };
    delete ephemeris.observer;
    delete ephemeris.terrainContentHash;
    delete ephemeris.terrainContentHashPolicy;
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith('terrain_manifest.json')) return new Response(JSON.stringify(manifest));
      if (url.endsWith('horizon_site-04.json')) return new Response(JSON.stringify(horizon));
      if (url.endsWith('ephemeris_site-04.json')) return new Response(JSON.stringify(ephemeris));
      throw new Error('Legacy preset must not require a new all-binary proof');
    });
    const provider = new PilotDataProvider();
    expect((await provider.getHorizonMask(sourcePoint, 1))?.provenance.notes).toContain('Legacy retained');
    const series = await provider.getEphemeris(sourcePoint, start, start, 3600, 1);
    expect(series.observer?.groundHeightM).toBeNull();
    expect(series.observer?.ellipsoidAltitudeKm).toBeNull();
    expect(series.provenance.notes).toContain('Legacy retained series');
  });
});
