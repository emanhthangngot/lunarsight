import { useState, type FormEvent } from 'react';
import type { SiteSummary, TerrainSource } from '../data/contract';
import { validateCoordinates } from '../geo/coordinates';

function SiteButton({ site, current, computing, onSelect }: { site: SiteSummary; current: boolean; computing: boolean; onSelect(): void }) {
  return <button type="button" className="site-option" aria-pressed={current} onClick={onSelect}>
    <span className="site-option-heading"><strong>{site.name}</strong>{computing ? <span className="tag">Computing…</span> : current ? <span className="tag">Shown</span> : null}</span>
    <span className="coordinate-text">{site.latDeg.toFixed(3)}° · {site.lonDegE.toFixed(3)}° E</span>
    {!site.nameVerified && <small>Name not catalog-verified</small>}
  </button>;
}

/** Primary demo shortlist; every other catalog site stays one click away, and in search. */
export function SitePanel({ sites, shortlist, shownSiteId, pendingSiteId, terrain, onSelect }: {
  sites: SiteSummary[]; shortlist: SiteSummary[]; shownSiteId: string | null; pendingSiteId: string | null; terrain: TerrainSource | null; onSelect(site: SiteSummary): void;
}) {
  const [latitude, setLatitude] = useState('-88.5');
  const [longitude, setLongitude] = useState('0');
  const [message, setMessage] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const shortlistIds = new Set(shortlist.map((site) => site.id));
  const others = sites.filter((site) => !shortlistIds.has(site.id));
  const isProcessed = terrain?.provenance.kind === 'processed';
  function choose(site: SiteSummary) { setMessage(null); onSelect(site); }
  function custom(event: FormEvent) {
    event.preventDefault();
    try {
      if (!latitude.trim() || !longitude.trim()) throw new RangeError('Enter both latitude and east longitude');
      const point = validateCoordinates(Number(latitude), Number(longitude));
      if (!terrain) throw new Error('Terrain metadata is not available yet');
      const outside = point.latDeg > terrain.coverage.northDeg || point.latDeg < terrain.coverage.southDeg || (terrain.type === 'heightFunction' && terrain.heightAt(point.latDeg, point.lonDegE) === null);
      onSelect({
        id: 'custom:' + point.latDeg + ':' + point.lonDegE, name: 'Custom coordinate', category: 'custom', ...point, nameVerified: false,
        description: isProcessed ? 'User-entered coordinates evaluated on the processed DEM.' : 'User-entered coordinates evaluated on mock terrain, not a catalog site.',
        provenance: { ...terrain.provenance, notes: (terrain.provenance.notes ?? '') + ' User-entered coordinate; name and position are not catalog-verified.' },
      });
      setInvalid(false);
      setMessage(outside ? `Outside terrain coverage (latitude must be between ${terrain.coverage.southDeg}° and ${terrain.coverage.northDeg}°). Analysis will show unavailable, not fabricated values.` : 'Analysing the custom coordinate with the current inputs. Longitude normalized to ' + point.lonDegE + '° E.');
    } catch (reason) {
      setInvalid(true); setMessage(reason instanceof Error ? reason.message : 'Invalid coordinates');
    }
  }
  const button = (site: SiteSummary) => <SiteButton key={site.id} site={site} current={site.id === shownSiteId} computing={site.id === pendingSiteId} onSelect={() => choose(site)} />;
  return <section className="panel" aria-labelledby="site-title">
    <div className="section-heading"><h2 id="site-title">Landing site</h2><span className="quiet-meta">{sites.length} {isProcessed ? 'catalog' : 'fictional'} sites</span></div>
    <p className="muted">{isProcessed ? 'South-polar candidate sites from processed NASA data.' : 'Fictional south-polar locations.'} Choosing a site analyses it immediately.</p>
    <div className="site-options">{shortlist.map(button)}</div>
    {others.length > 0 && <details className="custom-details">
      <summary>More catalog sites ({others.length})</summary>
      <div className="site-options">{others.map(button)}</div>
    </details>}
    <details className="custom-details" open={shownSiteId?.startsWith('custom:') ?? false}>
      <summary>Custom coordinate</summary>
      <form onSubmit={custom} noValidate className="form-stack">
        <label>Latitude (°)<input name="latitude" type="number" step="any" value={latitude} onChange={(e) => setLatitude(e.target.value)} aria-invalid={invalid} aria-describedby="coordinate-help" /></label>
        <label>East longitude (°)<input name="longitude" type="number" step="any" value={longitude} onChange={(e) => setLongitude(e.target.value)} aria-invalid={invalid} aria-describedby="coordinate-help" /></label>
        <p id="coordinate-help" className="muted">Exact poles unsupported. Longitude wraps to [0°, 360°).</p>
        <button type="submit">Analyse coordinates</button>
        {message && <p role={invalid ? 'alert' : 'status'} className={invalid ? 'error-text' : 'notice'}>{message}</p>}
      </form>
    </details>
  </section>;
}
