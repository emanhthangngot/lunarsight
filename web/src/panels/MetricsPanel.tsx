import { eventsAtCursor, type VisibilityEvent } from '../analysis/visibility';
import type { ScenarioInputs, ScenarioResult } from '../state/scenario';
import { number, sourceLabel, utc, visibility, windowLabel } from './format';

function Countdown({ label, event }: { label: string; event: VisibilityEvent | null }) {
  return <div><dt>{label}</dt><dd>{event ? 'in ' + number(event.remainingHours, ' h') : 'None in window'}{event && <small>{utc(event.utcMs)} UTC</small>}</dd></div>;
}

function Primary({ label, hours, percent, note }: { label: string; hours: number | null; percent?: number | null; note: string }) {
  return <div className="summary-metric">
    <dt>{label}</dt>
    <dd><strong>{number(hours, ' h')}</strong>{percent !== undefined && <span>{percent === null ? 'share unknown' : number(percent, '% of window')}</span>}</dd>
    <p>{note}</p>
  </div>;
}

/**
 * Compact site summary for the applied result. While another site is computing, the previous
 * site's numbers are hidden (never shown under the new site's name); while the same site is
 * recomputing, they stay visible and are marked stale.
 */
export function MetricsPanel({ result, pendingInputs, stale, cursorIndex, onCancel }: {
  result: ScenarioResult | null; pendingInputs: ScenarioInputs | null; stale: boolean; cursorIndex: number; onCancel(): void;
}) {
  if (!result) {
    return <section className="panel metrics-panel" aria-labelledby="metrics-title" aria-busy={pendingInputs !== null}>
      <div className="section-heading"><h2 id="metrics-title">Site summary</h2></div>
      {pendingInputs
        ? <div className="pending-card" role="status"><span className="spinner" aria-hidden="true" /><div><strong>Computing {pendingInputs.site.name}</strong><p>{windowLabel(pendingInputs)}</p></div><button type="button" className="quiet-button" onClick={onCancel}>Cancel</button></div>
        : <p className="muted">No result. Choose a covered site and window; missing values are never shown as zero.</p>}
    </section>;
  }
  const { metrics } = result.analysis;
  const events = eventsAtCursor(result.ephemeris.timesUtcMs, result.analysis, cursorIndex);
  const unknown = result.mask === null;
  const i = cursorIndex;
  return <section className="panel metrics-panel" aria-labelledby="metrics-title" aria-busy={stale}>
    <div className="section-heading"><h2 id="metrics-title">Site summary</h2><span className="tag" title="Result identity">{result.id}</span></div>
    <p className="summary-site">{result.inputs.site.name}</p>
    <p className="summary-meta">{windowLabel(result.inputs)}<br />{sourceLabel(result.ephemeris.provenance.kind)}</p>
    {stale && <div className="notice pending-inline" role="status"><span>Recomputing — values below are {result.id} until it finishes.</span><button type="button" className="quiet-button" onClick={onCancel}>Cancel</button></div>}
    {unknown && <p className="notice">Horizon mask unavailable: visibility times are unknown, not zero.</p>}
    <dl className="summary-metrics">
      <Primary label="Sunlit time" hours={metrics.sunlitHours} percent={metrics.sunlitPercent} note="Sun centre above the terrain horizon" />
      <Primary label="Longest darkness" hours={metrics.longestDarknessHours} note="Longest continuous run without the Sun" />
      <Primary label="Earth-visible time" hours={metrics.earthVisibleHours} percent={metrics.earthVisiblePercent} note="Earth centre above the terrain horizon" />
    </dl>
    <details className="summary-details">
      <summary>More metrics and the time cursor</summary>
      <dl className="detail-grid">
        <div><dt>Sun and Earth both visible</dt><dd>{number(metrics.bothHours, ' h')}<small>{number(metrics.bothPercent, '% of window')}</small></dd></div>
        <div><dt>Longest Earth blackout</dt><dd>{number(metrics.longestEarthBlackoutHours, ' h')}</dd></div>
        <div><dt>Window length</dt><dd>{number(metrics.windowHours, ' h')}</dd></div>
      </dl>
      <h3 className="detail-heading">At the time cursor · {utc(result.ephemeris.timesUtcMs[i])} UTC</h3>
      <dl className="detail-grid">
        <div><dt>Sun</dt><dd>{number(result.ephemeris.sunElDeg[i], '°')}<small>{visibility(result.analysis.sunVisible[i])}</small></dd></div>
        <div><dt>Earth</dt><dd>{number(result.ephemeris.earthElDeg[i], '°')}<small>{visibility(result.analysis.earthVisible[i])}</small></dd></div>
        {!unknown && <><Countdown label="Next sunset" event={events.sunset} /><Countdown label="Next sunrise" event={events.sunrise} /><Countdown label="Next Earthset" event={events.earthset} /><Countdown label="Next Earthrise" event={events.earthrise} /></>}
      </dl>
      <p className="muted">Centre visibility, no refraction. Events are sample-bounded (±{result.inputs.stepSeconds / 3600} h) and clipped to this window. Visibility is not power, radio-link performance or mission success.</p>
    </details>
  </section>;
}
