import type { ScenarioInputs } from '../state/scenario';
import { utc } from './format';

const HEIGHT_PRESETS_M = [1, 2.5, 10];

export function ScenarioPanel({ draft, pending, dirty, supportedHeightsM, onChange, onSubmit, onCancel }: {
  draft: ScenarioInputs; pending: boolean; dirty: boolean; supportedHeightsM: readonly number[] | undefined;
  onChange(patch: Partial<ScenarioInputs>): void; onSubmit(): void; onCancel(): void;
}) {
  const numberValue = (value: number) => Number.isFinite(value) ? value : '';
  const startValue = Number.isFinite(draft.startUtcMs) ? new Date(draft.startUtcMs).toISOString().slice(0, 16) : '';
  const end = draft.startUtcMs + draft.durationDays * 86_400_000;
  const presets = supportedHeightsM ?? HEIGHT_PRESETS_M;
  return <section className="panel" aria-labelledby="scenario-title">
    <div className="section-heading"><h2 id="scenario-title">Analysis window</h2><span className="quiet-meta">UTC</span></div>
    <p className="muted">Choosing a site analyses it right away with these inputs. Changes below apply when you press Apply.</p>
    <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="form-stack" noValidate>
      <label>Start date / time (UTC)<input name="startUtc" type="datetime-local" value={startValue} onChange={(e) => onChange({ startUtcMs: e.target.value ? Date.parse(e.target.value + 'Z') : NaN })} /></label>
      <div className="field-pair">
        <label>Duration (days)<input name="durationDays" type="number" min="0.01" max="90" step="any" value={numberValue(draft.durationDays)} onChange={(e) => onChange({ durationDays: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
        <label>Step (seconds)<input name="stepSeconds" type="number" min="60" step="60" value={numberValue(draft.stepSeconds)} onChange={(e) => onChange({ stepSeconds: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
      </div>
      {supportedHeightsM
        ? <div className="fixed-height" role="group" aria-labelledby="height-label">
            <span id="height-label">Observer above terrain</span>
            <div className="preset-row">{presets.map((height) => <button key={height} type="button" aria-pressed={draft.observerHeightM === height} onClick={() => onChange({ observerHeightM: height })}>{height} m</button>)}</div>
            <p className="muted">This dataset's Sun and Earth series were computed for {presets.map((h) => h + ' m').join(', ')} above the terrain only; other heights are not available here.</p>
          </div>
        : <>
            <label>Observer above terrain (m)<input name="observerHeightM" type="number" min="0" max="1000" step="any" value={numberValue(draft.observerHeightM)} onChange={(e) => onChange({ observerHeightM: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
            <div className="preset-row" aria-label="Observer height presets">{presets.map((height) => <button key={height} type="button" aria-pressed={draft.observerHeightM === height} onClick={() => onChange({ observerHeightM: height })}>{height} m</button>)}</div>
          </>}
      <p className="muted">End UTC: <span className="tabular">{utc(end)}</span> · 1 day = 24 hours.</p>
      <div className="apply-row">
        <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Computing…' : 'Apply'}</button>
        {pending && <button type="button" onClick={onCancel}>Cancel</button>}
      </div>
      <p className="form-status" role="status">{pending ? 'Computing — Apply is unavailable until this finishes or you cancel it.' : dirty ? 'Edited inputs are not applied yet; results show the last applied inputs.' : 'Results match these inputs.'}</p>
    </form>
  </section>;
}
