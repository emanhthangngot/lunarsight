import type { ScenarioInputs } from '../state/scenario';
import { utc } from './format';

export function ScenarioPanel({ draft, pending, dirty, onChange, onSubmit }: {
  draft: ScenarioInputs; pending: boolean; dirty: boolean; onChange(patch: Partial<ScenarioInputs>): void; onSubmit(): void;
}) {
  const numberValue = (value: number) => Number.isFinite(value) ? value : '';
  const startValue = Number.isFinite(draft.startUtcMs) ? new Date(draft.startUtcMs).toISOString().slice(0, 16) : '';
  const end = draft.startUtcMs + draft.durationDays * 86_400_000;
  return <section className="panel" aria-labelledby="scenario-title">
    <div className="section-heading"><h2 id="scenario-title">Scenario window</h2><span className="quiet-meta">UTC</span></div>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="form-stack" noValidate>
      <label>Start date / time (UTC)<input name="startUtc" type="datetime-local" value={startValue} onChange={(e) => onChange({ startUtcMs: e.target.value ? Date.parse(e.target.value + 'Z') : NaN })} /></label>
      <div className="field-pair">
        <label>Duration (days)<input name="durationDays" type="number" min="0.01" max="90" step="any" value={numberValue(draft.durationDays)} onChange={(e) => onChange({ durationDays: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        <label>Step (seconds)<input name="stepSeconds" type="number" min="60" step="60" value={numberValue(draft.stepSeconds)} onChange={(e) => onChange({ stepSeconds: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
      </div>
      <label>Observer above terrain (m)<input name="observerHeightM" type="number" min="0" max="1000" step="any" value={numberValue(draft.observerHeightM)} onChange={(e) => onChange({ observerHeightM: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
      <div className="preset-row" aria-label="Observer height presets">{[1, 2.5, 10].map((height) => <button key={height} type="button" aria-pressed={draft.observerHeightM === height} onClick={() => onChange({ observerHeightM: height })}>{height} m</button>)}</div>
      <p className="muted">End UTC: <span className="tabular">{utc(end)}</span><br />1 day = 24 hours.</p>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Computing…' : 'Apply scenario'}</button>
      <p className="muted" role="status">{dirty ? 'Unapplied draft — panels retain the identified submitted result.' : 'Inputs match the displayed result.'}</p>
    </form>
  </section>;
}
