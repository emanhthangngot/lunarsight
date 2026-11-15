import type { SiteSummary } from '../data/contract';
import type { WindowMetrics } from '../analysis/visibility';
import { metricDelta, type ComparisonSettings, type PairOutcome, type SideOutcome } from '../state/comparison';
import { number, signedNumber, sourceLabel, windowLabel } from './format';

interface Row { name: string; hint: string; value(m: WindowMetrics): number | null; share?(m: WindowMetrics): number | null }

const PRIMARY: Row[] = [
  { name: 'Sunlit time', hint: 'Sun centre above the terrain horizon', value: (m) => m.sunlitHours, share: (m) => m.sunlitPercent },
  { name: 'Longest darkness', hint: 'Longest continuous run without the Sun', value: (m) => m.longestDarknessHours },
  { name: 'Earth-visible time', hint: 'Earth centre above the terrain horizon', value: (m) => m.earthVisibleHours, share: (m) => m.earthVisiblePercent },
];
const DETAIL: Row[] = [
  { name: 'Sun and Earth both visible', hint: 'Both centres above the horizon', value: (m) => m.bothHours, share: (m) => m.bothPercent },
  { name: 'Longest Earth blackout', hint: 'Longest continuous run without Earth', value: (m) => m.longestEarthBlackoutHours },
  { name: 'Window length', hint: 'Identical for both sites', value: (m) => m.windowHours },
];

function SiteSelect({ label, value, other, shortlist, others, onChange }: {
  label: string; value: string | null; other: string | null; shortlist: SiteSummary[]; others: SiteSummary[]; onChange(id: string): void;
}) {
  const option = (site: SiteSummary) => <option key={site.id} value={site.id} disabled={site.id === other}>{site.name}{site.id === other ? ' (other side)' : ''}</option>;
  return <label>{label}<select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
    {value === null && <option value="" disabled>Choose a site</option>}
    <optgroup label="Demo shortlist">{shortlist.map(option)}</optgroup>
    {others.length > 0 && <optgroup label="Other catalog sites">{others.map(option)}</optgroup>}
  </select></label>;
}

function cell(side: SideOutcome | undefined, row: Row) {
  if (!side) return <td className="cell-pending">Computing…</td>;
  if (side.status === 'error') return <td className="cell-unknown">Unavailable</td>;
  const m = side.result.analysis.metrics;
  const share = row.share?.(m);
  return <td><strong>{number(row.value(m), ' h')}</strong>{share !== undefined && <small>{number(share, '%')}</small>}</td>;
}

function delta(outcome: PairOutcome | null, row: Row) {
  if (!outcome || outcome.a.status !== 'ready' || outcome.b.status !== 'ready') return <td className="cell-unknown">—</td>;
  const value = metricDelta(row.value(outcome.a.result.analysis.metrics), row.value(outcome.b.result.analysis.metrics));
  return <td className={value === null ? 'cell-unknown' : 'cell-delta'}>{signedNumber(value, ' h')}</td>;
}

/** Two sites, one shared window: side-by-side metrics and the B − A difference. Local and in-memory. */
export function ComparisonPanel({ sites, shortlist, siteA, siteB, onSiteA, onSiteB, settings, running, outcome }: {
  sites: SiteSummary[]; shortlist: SiteSummary[]; siteA: SiteSummary | null; siteB: SiteSummary | null;
  onSiteA(id: string): void; onSiteB(id: string): void;
  settings: ComparisonSettings | null; running: boolean; outcome: PairOutcome | null;
}) {
  const shortlistIds = new Set(shortlist.map((site) => site.id));
  const others = sites.filter((site) => !shortlistIds.has(site.id));
  const rows = (list: Row[]) => list.map((row) => <tr key={row.name}><th scope="row">{row.name}<small>{row.hint}</small></th>{cell(outcome?.a, row)}{cell(outcome?.b, row)}{delta(outcome, row)}</tr>);
  const errors = outcome ? (['a', 'b'] as const).flatMap((side) => {
    const value = outcome[side];
    return value.status === 'error' ? [{ side, message: value.message }] : [];
  }) : [];
  return <section className="panel comparison-panel" aria-labelledby="comparison-title">
    <h2 id="comparison-title" className="sr-only">Compare two sites</h2>
    <div className="pair-selects">
      <SiteSelect label="Site A" value={siteA?.id ?? null} other={siteB?.id ?? null} shortlist={shortlist} others={others} onChange={onSiteA} />
      <SiteSelect label="Site B" value={siteB?.id ?? null} other={siteA?.id ?? null} shortlist={shortlist} others={others} onChange={onSiteB} />
    </div>
    {settings
      ? <p className="pair-settings">Both sites use the applied Mission inputs: <span className="tabular">{windowLabel(settings)}</span>. Change them in Mission and press Apply.</p>
      : <p className="notice">Apply a covered scenario first; the comparison uses its window, step and eye height for both sites.</p>}
    {running && <p className="pair-status" role="status"><span className="spinner" aria-hidden="true" />Computing {siteA?.name} and {siteB?.name}…</p>}
    {errors.map(({ side, message }) => <p key={side} className="error-text" role="alert">Site {side.toUpperCase()} unavailable: {message}</p>)}
    {settings && siteA && siteB && <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Two-site comparison table">
      <table>
        <caption>Hours in the shared window. Difference is B − A. No ranking or mission-success score; unknown values stay unknown.</caption>
        <thead><tr><th scope="col">Metric</th><th scope="col">A · {siteA.name}</th><th scope="col">B · {siteB.name}</th><th scope="col">Difference (B − A)</th></tr></thead>
        <tbody>{rows(PRIMARY)}</tbody>
      </table>
    </div>}
    {settings && siteA && siteB && <details className="comparison-details">
      <summary>More metrics and sources</summary>
      <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Additional comparison metrics">
        <table><thead><tr><th scope="col">Metric</th><th scope="col">A · {siteA.name}</th><th scope="col">B · {siteB.name}</th><th scope="col">Difference (B − A)</th></tr></thead>
          <tbody>{rows(DETAIL)}</tbody></table>
      </div>
      {outcome && <ul className="pair-sources">{(['a', 'b'] as const).map((side) => {
        const value = outcome[side];
        if (value.status !== 'ready') return null;
        const r = value.result;
        return <li key={side}><strong>{side.toUpperCase()} · {r.inputs.site.name}</strong> — {sourceLabel(r.ephemeris.provenance.kind)}; {r.mask ? `horizon mask to ${(r.mask.maxRangeM / 1000).toFixed(0)} km` : 'horizon mask unavailable (visibility unknown)'}.</li>;
      })}</ul>}
    </details>}
  </section>;
}
