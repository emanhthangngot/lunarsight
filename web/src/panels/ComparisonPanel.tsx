import { useState, type Dispatch, type FormEvent } from 'react';
import type { SavedScenarioSummary } from '../data/api/ApiDataProvider';
import { scenarioKey, type ScenarioResult, type WorkspaceAction } from '../state/scenario';
import { number, utc } from './format';

export function ComparisonPanel({
  comparisons,
  result,
  pending,
  dispatch,
  hasPersistence = false,
  savedScenarios = [],
  scenarioBusy = false,
  scenarioError = null,
  onSaveToServer,
  onLoadFromServer,
  onDeleteFromServer,
}: {
  comparisons: ScenarioResult[];
  result: ScenarioResult | null;
  pending: boolean;
  dispatch: Dispatch<WorkspaceAction>;
  hasPersistence?: boolean;
  savedScenarios?: SavedScenarioSummary[];
  scenarioBusy?: boolean;
  scenarioError?: string | null;
  onSaveToServer?(title: string): Promise<SavedScenarioSummary | null>;
  onLoadFromServer?(id: string): Promise<void>;
  onDeleteFromServer?(id: string): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const duplicate = result !== null && comparisons.some((c) => scenarioKey(c.inputs) === scenarioKey(result.inputs));
  const isProcessed = (comparisons[0]?.ephemeris.provenance.kind ?? result?.ephemeris.provenance.kind) === 'processed';

  const rows: { name: string; value(result: ScenarioResult): string }[] = [
    { name: 'Start UTC', value: (r) => utc(r.inputs.startUtcMs) },
    { name: 'End UTC', value: (r) => utc(r.inputs.startUtcMs + r.inputs.durationDays * 86_400_000) },
    { name: 'Duration', value: (r) => number(r.inputs.durationDays, ' d') },
    { name: 'Height', value: (r) => number(r.inputs.observerHeightM, ' m') },
    { name: 'Step', value: (r) => number(r.inputs.stepSeconds, ' s', 0) },
    { name: 'Sunlit', value: (r) => number(r.analysis.metrics.sunlitPercent, '%') },
    { name: 'Earth-visible', value: (r) => number(r.analysis.metrics.earthVisiblePercent, '%') },
    { name: 'Both', value: (r) => number(r.analysis.metrics.bothPercent, '%') },
    { name: 'Sunlit hours', value: (r) => number(r.analysis.metrics.sunlitHours, ' h') },
    { name: 'Earth hours', value: (r) => number(r.analysis.metrics.earthVisibleHours, ' h') },
    { name: 'Both hours', value: (r) => number(r.analysis.metrics.bothHours, ' h') },
    { name: 'Darkness max', value: (r) => number(r.analysis.metrics.longestDarknessHours, ' h') },
    { name: 'Blackout max', value: (r) => number(r.analysis.metrics.longestEarthBlackoutHours, ' h') },
  ];

  async function handleSaveServer(event: FormEvent) {
    event.preventDefault();
    if (!onSaveToServer || !result) return;
    const label = title.trim() || `${result.inputs.site.name} (${utc(result.inputs.startUtcMs).slice(0, 10)})`;
    const created = await onSaveToServer(label);
    if (created) setTitle('');
  }

  function copyShareLink(scenarioId: string) {
    const url = new URL(window.location.href);
    url.searchParams.set('scenario', scenarioId);
    void navigator.clipboard?.writeText(url.toString());
    setCopiedId(scenarioId);
    window.setTimeout(() => setCopiedId((prev) => (prev === scenarioId ? null : prev)), 2000);
  }

  return <section className="panel comparison-panel" aria-labelledby="comparison-title">
    <div className="section-heading"><h2 id="comparison-title">Compare scenarios</h2><span className="tag">{comparisons.length}/3</span></div>
    <button type="button" disabled={!result || pending || duplicate || comparisons.length === 3} onClick={() => dispatch({ type: 'compare' })}>Save to comparison</button>
    <p className="muted">Snapshots keep their own site, dates, height and cadence. Highlighted cells differ from the first scenario.</p>
    {comparisons.length === 0 ? <p className="empty-state">No comparisons saved. Analyze a site/date, then save it here.</p> : <div className="comparison-scroll" tabIndex={0} role="region" aria-label="Scenario comparison table; scroll horizontally if needed">
      <table><caption>{isProcessed ? 'Processed NASA visibility comparison' : 'Mock visibility comparison'} — different windows are not normalized to a shared date.</caption><thead><tr><th scope="col">Input / metric</th>{comparisons.map((r) => <th scope="col" key={r.id}><strong>{r.inputs.site.name}</strong><small>{r.id} · {r.inputs.site.latDeg.toFixed(3)}° / {r.inputs.site.lonDegE.toFixed(3)}° E</small></th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row.name}><th scope="row">{row.name}</th>{comparisons.map((r, index) => <td key={r.id} className={index > 0 && row.value(r) !== row.value(comparisons[0]!) ? 'different' : undefined}>{row.value(r)}</td>)}</tr>)}</tbody>
        <tfoot><tr><th scope="row">Workspace</th>{comparisons.map((r) => <td key={r.id}><button type="button" onClick={() => dispatch({ type: 'load', result: r })} aria-label={'Load ' + r.inputs.site.name + ' ' + r.id + ' into workspace'}>Load into workspace</button><button type="button" className="quiet-button" onClick={() => dispatch({ type: 'removeComparison', id: r.id })} aria-label={'Remove comparison ' + r.id}>Remove</button></td>)}</tr></tfoot>
      </table>
    </div>}

    {hasPersistence && (
      <div className="saved-scenarios-section">
        <div className="section-heading"><h3>Saved scenarios (server)</h3><span className="tag">{savedScenarios.length}</span></div>
        <form onSubmit={handleSaveServer} className="saved-scenario-form">
          <input
            name="scenarioTitle"
            type="text"
            placeholder={result ? `${result.inputs.site.name} snapshot` : 'Scenario title'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!result || pending || scenarioBusy}
            aria-label="Scenario title to save"
          />
          <button type="submit" className="primary-button" disabled={!result || pending || scenarioBusy}>
            {scenarioBusy ? 'Saving…' : 'Save to server'}
          </button>
        </form>
        {scenarioError && <p role="alert" className="error-text">{scenarioError}</p>}
        {savedScenarios.length === 0 ? (
          <p className="empty-state">No scenarios saved on the backend yet.</p>
        ) : (
          <ul className="saved-scenario-list">
            {savedScenarios.map((item) => (
              <li key={item.id} className="saved-scenario-item">
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.inputs.site.name} · {utc(item.inputs.startUtcMs).slice(0, 10)} · {item.inputs.durationDays} d · {item.inputs.observerHeightM} m
                    {item.metrics ? ` · Sunlit ${number(item.metrics.sunlitPercent, '%')}` : ''}
                  </small>
                </div>
                <div className="saved-scenario-actions">
                  <button type="button" disabled={scenarioBusy} onClick={() => void onLoadFromServer?.(item.id)}>Load</button>
                  <button type="button" className="quiet-button" onClick={() => copyShareLink(item.id)}>
                    {copiedId === item.id ? 'Copied!' : 'Copy link'}
                  </button>
                  <button type="button" className="quiet-button" disabled={scenarioBusy} onClick={() => void onDeleteFromServer?.(item.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )}
  </section>;
}
