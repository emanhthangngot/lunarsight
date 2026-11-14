import { eventsAtCursor, type VisibilityEvent } from '../analysis/visibility';
import type { ScenarioResult } from '../state/scenario';
import { number, utc, visibility } from './format';

function Countdown({ label, event }: { label: string; event: VisibilityEvent | null }) {
  return <div className="countdown"><span>{label}</span><strong>{event ? 'in ' + number(event.remainingHours, ' h') : 'No event in window'}</strong>{event && <small>{utc(event.utcMs)} UTC</small>}</div>;
}

export function MetricsPanel({ result, cursorIndex, stale }: { result: ScenarioResult | null; cursorIndex: number; stale: boolean }) {
  if (!result) return <section className="panel"><h2>Visibility metrics</h2><p className="muted">Unavailable until a covered scenario is analyzed. No missing value is treated as zero.</p></section>;
  const { metrics } = result.analysis;
  const events = eventsAtCursor(result.ephemeris.timesUtcMs, result.analysis, cursorIndex);
  const unknown = result.mask === null;
  return <section className="panel metrics-panel" aria-labelledby="metrics-title" aria-busy={stale}>
    <div className="section-heading"><h2 id="metrics-title">Visibility window</h2><span className="tag">{result.id} · mock</span></div>
    <p className="muted">{result.inputs.site.name} · {number(metrics.windowHours, ' h')}<br />Visible above terrain horizon (mock)</p>
    {stale && <p className="notice">Stale result — recomputing. Values below belong to {result.id}.</p>}
    {unknown && <p className="notice">Horizon mask unavailable. Visibility and event countdowns are unknown.</p>}
    <div className="solar-elevation"><span>Current Sun elevation</span><strong>{number(result.ephemeris.sunElDeg[cursorIndex], '°')}</strong><span>{visibility(result.analysis.sunVisible[cursorIndex])} · {result.analysis.sunVisible[cursorIndex] === true ? 'centre above terrain horizon' : result.analysis.sunVisible[cursorIndex] === false ? 'centre at or below terrain horizon' : 'terrain visibility unavailable'}</span></div>
    {unknown ? <p className="notice">Sunset / sunrise / Earthset / Earthrise: unknown without terrain mask.</p> : <div className="countdowns"><Countdown label="Sunset" event={events.sunset} /><Countdown label="Earthset" event={events.earthset} /></div>}
    <dl className="metric-grid">
      <div><dt>Sunlit</dt><dd>{number(metrics.sunlitPercent, '%')}<small>{number(metrics.sunlitHours, ' h')}</small></dd></div>
      <div><dt>Earth-visible</dt><dd>{number(metrics.earthVisiblePercent, '%')}<small>{number(metrics.earthVisibleHours, ' h')}</small></dd></div>
      <div><dt>Both visible</dt><dd>{number(metrics.bothPercent, '%')}<small>{number(metrics.bothHours, ' h')}</small></dd></div>
      <div><dt>Longest darkness</dt><dd>{number(metrics.longestDarknessHours, ' h')}</dd></div>
      <div><dt>Longest Earth blackout</dt><dd>{number(metrics.longestEarthBlackoutHours, ' h')}</dd></div>
    </dl>
    <details className="metrics-method"><summary>Rise events & sampling method</summary>
      {!unknown && <div className="rise-events"><Countdown label="Sunrise" event={events.sunrise} /><Countdown label="Earthrise" event={events.earthrise} /></div>}
      <p className="muted">Events are sample-bounded (±{result.inputs.stepSeconds / 3600} h). Runs are clipped to this window; no event means none detected inside it. Visibility is not power, radio-link performance or mission success.</p>
    </details>
  </section>;
}
