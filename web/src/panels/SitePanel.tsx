import { useState, type FormEvent } from 'react';
import type { SiteSummary, TerrainSource } from '../data/contract';
import { validateCoordinates } from '../geo/coordinates';

export function SitePanel({ sites, selectedSite, terrain, onSelect }: {
  sites: SiteSummary[]; selectedSite: SiteSummary | null; terrain: TerrainSource | null; onSelect(site: SiteSummary): void;
}) {
  const [latitude, setLatitude] = useState('-88.5');
  const [longitude, setLongitude] = useState('0');
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  function custom(event: FormEvent) {
    event.preventDefault();
    try {
      if (!latitude.trim() || !longitude.trim()) throw new RangeError('Enter both latitude and east longitude');
      const point = validateCoordinates(Number(latitude), Number(longitude));
      if (!terrain) throw new Error('Terrain metadata is not available yet');
      const outside = point.latDeg > terrain.coverage.northDeg || point.latDeg < terrain.coverage.southDeg || (terrain.type === 'heightFunction' && terrain.heightAt(point.latDeg, point.lonDegE) === null);
      onSelect({
        id: 'custom:' + point.latDeg + ':' + point.lonDegE, name: 'Custom coordinate', category: 'custom', ...point, nameVerified: false,
        description: 'User-entered coordinates evaluated on mock terrain, not a catalog site.',
        provenance: { ...terrain.provenance, notes: (terrain.provenance.notes ?? '') + ' User-entered coordinate; name and position are not catalog-verified.' },
      });
      setInvalid(false);
      setMessage(outside ? 'Outside mock terrain coverage (latitude must be at or south of −84°). Analysis will show unavailable, not fabricated values.' : 'Valid custom coordinate selected. Apply scenario to analyze. Longitude normalized to ' + point.lonDegE + '° E.');
    } catch (reason) {
      setInvalid(true); setMessage(reason instanceof Error ? reason.message : 'Invalid coordinates');
    }
  }
  return <section className="panel" aria-labelledby="site-title">
    <div className="section-heading"><h2 id="site-title">Landing site</h2><span className="quiet-meta">{sites.length} fictional sites</span></div>
    <p className="muted">Fictional south-polar locations</p>
    <div className="site-options">
      {sites.map((site) => <button key={site.id} type="button" className="site-option" aria-pressed={selectedSite?.id === site.id} onClick={() => { setMessage(null); onSelect(site); }}>
        <span className="site-option-heading"><strong>{site.name}</strong><span className="tag">{site.category}</span></span>
        <span className="coordinate-text">{site.latDeg.toFixed(3)}° · {site.lonDegE.toFixed(3)}° E</span>
        {!site.nameVerified && <small>Name not catalog-verified</small>}
      </button>)}
    </div>
    <details className="custom-details" open={selectedSite?.category === 'custom'}>
      <summary>Custom coordinate</summary>
      <form onSubmit={custom} noValidate className="form-stack">
        <label>Latitude (°)<input name="latitude" type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} aria-invalid={invalid} aria-describedby="coordinate-help" /></label>
        <label>East longitude (°)<input name="longitude" type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} aria-invalid={invalid} aria-describedby="coordinate-help" /></label>
        <p id="coordinate-help" className="muted">Exact poles unsupported. Longitude wraps to [0°, 360°).</p>
        <button type="submit">Use coordinates</button>
        {message && <p role={invalid ? 'alert' : 'status'} className={invalid ? 'error-text' : 'notice'}>{message}</p>}
      </form>
    </details>
  </section>;
}
