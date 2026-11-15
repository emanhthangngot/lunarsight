import type { DataKind, TerrainSource } from '../data/contract';
import type { ScenarioResult } from '../state/scenario';
import { MOON_RADIUS_M } from '../geo/coordinates';

export function ProvenancePanel({ kind, terrain, result }: { kind: DataKind; terrain: TerrainSource | null; result: ScenarioResult | null }) {
  const records = [terrain?.provenance, result?.ephemeris.provenance, result?.mask?.provenance].filter((p) => p !== undefined);
  const isProcessed = kind === 'processed' && records.some((p) => p.kind === 'processed');
  return <section className="panel provenance-panel" aria-labelledby="provenance-title">
    <details open><summary id="provenance-title">Provenance & conventions · {kind.toUpperCase()} · {result?.id ?? 'No result'}</summary>
      <p>{isProcessed
        ? 'NASA-sourced, processed data: PGDA LOLA topography and JPL Horizons ephemerides for south-polar candidate sites. Modelled results, not independently validated; not a flight-certified power budget, radio link budget, or landing-safety score.'
        : 'Fictional demonstration only. Not JPL ephemerides or LOLA data. No scientific certification, power budget, radio link budget or landing-safety score.'}</p>
      <dl className="conventions">
        <div><dt>Frame</dt><dd>{result?.ephemeris.provenance.kind === 'processed' ? 'MOON_ME (JPL Horizons DE441 MEAN_ME)' : 'MOON_ME (mock label, not a SPICE realization)'}</dd></div>
        <div><dt>Reference sphere</dt><dd>{MOON_RADIUS_M.toLocaleString('en-US')} m · height above sphere; equipment height above local terrain</dd></div>
        <div><dt>Angles</dt><dd>Azimuth clockwise from north, 0–360° E-oriented local ENU; elevation above sphere-tangent horizontal</dd></div>
        <div><dt>Visibility</dt><dd>center · strictly above interpolated terrain mask; no refraction</dd></div>
        <div><dt>Time / sampling</dt><dd>UTC epoch milliseconds; left-held intervals, exact window-end sample; events ± nominal step</dd></div>
      </dl>
      {records.map((p, i) => <div className="provenance-record" key={i}><h3>{i === 0 ? 'Terrain' : i === 1 ? 'Ephemeris' : 'Horizon mask'} · {p.kind}</h3><p>{p.source} · v{p.version} · generator epoch {p.generatedAt}</p><p>{p.notes}</p></div>)}
      {result?.mask && <p>Mask range: {(result.mask.maxRangeM / 1000).toFixed(1)} km · 1° azimuth sampling. Finite-range masks can miss obstacles beyond {((result.mask.maxRangeM) / 1000).toFixed(0)} km.</p>}
    </details>
  </section>;
}
