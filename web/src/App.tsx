import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Activity, ArrowLeftRight, ChevronDown, Clock3, Info, MapPin, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, ScanLine, X } from 'lucide-react';
import type { LunarDataProvider, SiteSummary } from './data/contract';
import { LunarViewer, type BodyDirection } from './viewer/LunarViewer';
import { SkyHorizonView } from './viewer/SkyHorizonView';
import { useWorkspace } from './state/useWorkspace';
import { scenarioKey } from './state/scenario';
import { SitePanel } from './panels/SitePanel';
import { ScenarioPanel } from './panels/ScenarioPanel';
import { MetricsPanel } from './panels/MetricsPanel';
import { ComparisonPanel } from './panels/ComparisonPanel';
import { TimelinePanel } from './panels/TimelinePanel';
import { ProvenancePanel } from './panels/ProvenancePanel';
import { OverlayDialog } from './components/OverlayDialog';
import { SiteCommand } from './components/SiteCommand';
import { utc } from './panels/format';

export function App({ provider }: { provider: LunarDataProvider }) {
  const { state, dispatch, sites, terrain, bootError, submit } = useWorkspace(provider);
  const { draft, result, pendingId, cursorIndex } = state;
  const pending = pendingId !== null;
  const dirty = !!draft && (!result || scenarioKey(draft) !== scenarioKey(result.inputs));
  const viewerSites = useMemo(() => {
    if (result?.inputs.site.category === 'custom') return [...sites, result.inputs.site];
    return sites;
  }, [sites, result?.inputs.site]);
  const selectSite = (site: SiteSummary) => dispatch({ type: 'draft', patch: { site } });
  const sun: BodyDirection | null = result ? {
    azDeg: result.ephemeris.sunAzDeg[cursorIndex]!, elDeg: result.ephemeris.sunElDeg[cursorIndex]!,
    visible: result.analysis.sunVisible[cursorIndex] ?? null,
  } : null;
  const earth: BodyDirection | null = result ? {
    azDeg: result.ephemeris.earthAzDeg[cursorIndex]!, elDeg: result.ephemeris.earthElDeg[cursorIndex]!,
    visible: result.analysis.earthVisible[cursorIndex] ?? null,
  } : null;
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1199px)').matches);
  const [showInputs, setShowInputs] = useState(() => !window.matchMedia('(max-width: 1199px)').matches);
  const [showResults, setShowResults] = useState(() => !window.matchMedia('(max-width: 1199px)').matches);
  const [showHorizon, setShowHorizon] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [insets, setInsets] = useState({ instrumentTop: 88, top: 120, bottom: 320 });
  const commandRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  const openCommands = useCallback(() => {
    setComparisonOpen(false); setProvenanceOpen(false); setCommandOpen(true);
  }, []);
  useEffect(() => {
    const breakpoint = window.matchMedia('(max-width: 1199px)');
    const change = () => {
      setCompact(breakpoint.matches);
      if (breakpoint.matches) { setShowInputs(false); setShowResults(false); }
    };
    breakpoint.addEventListener('change', change);
    return () => breakpoint.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const measure = () => {
      const commandBottom = commandRef.current?.getBoundingClientRect().bottom ?? 72;
      const dockHeight = dockRef.current?.getBoundingClientRect().height ?? 288;
      const gutter = window.innerWidth < 600 ? 8 : 16;
      const next = { instrumentTop: commandBottom + 16, top: commandBottom + 48, bottom: dockHeight + gutter * 2 };
      setInsets((previous) => previous.top === next.top && previous.bottom === next.bottom && previous.instrumentTop === next.instrumentTop ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    if (commandRef.current) observer.observe(commandRef.current);
    if (dockRef.current) observer.observe(dockRef.current);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommands(); }
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { setShowInputs(false); setShowResults(false); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [openCommands]);
  function toggleMission() { setShowInputs((value) => !value); if (compact) setShowResults(false); }
  function toggleInspector() { setShowResults((value) => !value); if (compact) setShowInputs(false); }
  const currentUtc = result ? utc(result.ephemeris.timesUtcMs[cursorIndex]) : 'No submitted time';
  const saved = !!result && state.comparisons.some((comparison) => scenarioKey(comparison.inputs) === scenarioKey(result.inputs));
  const appStyle = { '--instrument-top': insets.instrumentTop + 'px', '--dock-safe-bottom': insets.bottom + 'px' } as CSSProperties;
  const safeArea = {
    '--viewer-safe-top': insets.top + 'px',
    '--viewer-safe-bottom': insets.bottom + 'px',
    '--viewer-safe-left': showInputs ? 'calc(var(--ls-mission-width) + var(--ls-gutter) + var(--ls-gap))' : 'var(--ls-gutter)',
    '--viewer-safe-right': showResults ? 'calc(var(--ls-inspector-width) + var(--ls-gutter) + var(--ls-gap))' : 'var(--ls-gutter)',
  } as CSSProperties;

  return <main className="app-shell" data-compact={compact} style={appStyle}>
    <div className="viewer-stage" style={safeArea}>
      <LunarViewer terrain={terrain} sites={viewerSites} selectedSiteId={result?.inputs.site.id ?? null} observerHeightM={result?.inputs.observerHeightM ?? 0} cameraMode={state.cameraMode} sun={sun} earth={earth} onSelectSite={(id) => { const site = viewerSites.find((candidate) => candidate.id === id); if (site) selectSite(site); }} />
    </div>
    <header ref={commandRef} className="command-bar glass-surface">
      <a className="brand" href="#workspace" aria-label="LunarSight workspace"><Moon size={25} strokeWidth={1.3} aria-hidden="true" /><h1>LunarSight</h1></a>
      <button className="site-switcher" type="button" aria-label="Find a lunar site" aria-haspopup="dialog" aria-expanded={commandOpen} aria-keyshortcuts="Control+k Meta+k" onClick={openCommands}><MapPin size={17} aria-hidden="true" /><span>{draft?.site.name ?? 'Find a lunar site'}</span><kbd>⌘ K</kbd><ChevronDown size={14} aria-hidden="true" /></button>
      <div className="utc-pill" title={currentUtc + ' UTC'}><Clock3 size={16} aria-hidden="true" /><div><span className="utc-date">{result ? currentUtc.slice(0, 10) : 'No result'}</span><time dateTime={result ? new Date(result.ephemeris.timesUtcMs[cursorIndex]!).toISOString() : undefined}>{result ? currentUtc.slice(11).replace('Z', '') + ' UTC' : 'Time unavailable'}</time></div></div>
      <div className="mode-toggle" role="group" aria-label="Camera mode">{(['orbital', 'surface'] as const).map((mode) => <button key={mode} type="button" aria-pressed={state.cameraMode === mode} onClick={() => dispatch({ type: 'camera', mode })}>{mode === 'orbital' ? 'Orbital' : 'Surface'}</button>)}</div>
      <div className="command-utilities">
        <button className="icon-button mission-toggle" type="button" aria-label={showInputs ? 'Close Mission' : 'Open Mission'} aria-controls="mission-drawer" aria-expanded={showInputs} title="Mission inputs" onClick={toggleMission}>{showInputs ? <PanelLeftClose size={19} aria-hidden="true" /> : <PanelLeftOpen size={19} aria-hidden="true" />}</button>
        <button className="icon-button inspector-toggle" type="button" aria-label={showResults ? 'Close Inspector' : 'Open Inspector'} aria-controls="inspector-drawer" aria-expanded={showResults} title="Visibility inspector" onClick={toggleInspector}>{showResults ? <PanelRightClose size={19} aria-hidden="true" /> : <PanelRightOpen size={19} aria-hidden="true" />}</button>
        <button className="icon-button" type="button" aria-label={'Compare scenarios (' + state.comparisons.length + ' saved)'} aria-haspopup="dialog" title={'Compare scenarios · ' + state.comparisons.length + '/3'} onClick={() => setComparisonOpen(true)}><ArrowLeftRight size={18} aria-hidden="true" />{state.comparisons.length > 0 && <span className="saved-count">{state.comparisons.length}</span>}</button>
        <button className="icon-button" type="button" aria-label="Open provenance" aria-haspopup="dialog" title="Provenance & conventions" onClick={() => setProvenanceOpen(true)}><Info size={18} aria-hidden="true" /></button>
      </div>
      <strong className="mock-badge">MOCK DATA</strong>
    </header>
    <div id="workspace" className="result-status" role="status" aria-live="polite" data-status={pending ? 'pending' : state.error ? 'error' : 'ready'}>
      <span className="status-dot" aria-hidden="true" /><span>{pending ? 'Computing — prior result is stale' : state.error ? (state.outsideCoverage ? 'Outside mock coverage — result unavailable' : 'Scenario unavailable') : result ? result.inputs.site.name + ' · ' + result.id : 'Loading workspace'}</span>
      {dirty && !pending && <strong>Draft not applied</strong>}
    </div>
    {(bootError || state.error) && <div className="error-banner glass-surface" role="alert"><strong>{state.outsideCoverage ? 'Outside mock terrain coverage' : 'Scenario unavailable'}</strong><p>{bootError ?? state.error}</p>{state.outsideCoverage && <p>Choose −90° &lt; latitude ≤ −84°. Missing data is not zero.</p>}<button type="button" onClick={() => { setShowInputs(true); if (compact) setShowResults(false); }}>Edit mission inputs</button></div>}

    <aside id="mission-drawer" className="instrument-drawer mission-drawer glass-surface" data-open={showInputs} inert={!showInputs} aria-hidden={!showInputs} aria-label="Mission inputs">
      <header className="instrument-heading"><div><MapPin size={17} aria-hidden="true" /><h2>Mission</h2></div><button className="icon-button" type="button" aria-label="Collapse Mission drawer" onClick={() => setShowInputs(false)}><X size={17} aria-hidden="true" /></button></header>
      <div className="instrument-scroll"><SitePanel sites={sites} selectedSite={draft?.site ?? null} terrain={terrain} onSelect={selectSite} />
        {draft && <ScenarioPanel draft={draft} pending={pending} dirty={dirty} onChange={(patch) => dispatch({ type: 'draft', patch })} onSubmit={() => submit(draft)} />}
        <p className="integrity-note">Fictional terrain & analytic Sun/Earth geometry. Not JPL ephemerides or LOLA data.</p>
      </div>
    </aside>
    <aside id="inspector-drawer" className="instrument-drawer inspector-drawer glass-surface" data-open={showResults} inert={!showResults} aria-hidden={!showResults} aria-label="Visibility inspector">
      <header className="instrument-heading"><div><Activity size={17} aria-hidden="true" /><h2>Inspector</h2></div><button className="icon-button" type="button" aria-label="Collapse Inspector drawer" onClick={() => setShowResults(false)}><X size={17} aria-hidden="true" /></button></header>
      <div className="instrument-scroll"><MetricsPanel result={result} cursorIndex={cursorIndex} stale={pending} />
        <div className="inspector-actions"><button type="button" disabled={!result || pending || saved || state.comparisons.length === 3} onClick={() => { dispatch({ type: 'compare' }); setComparisonOpen(true); }}><ArrowLeftRight size={16} aria-hidden="true" />{saved ? 'Saved to comparison' : 'Save comparison'}</button><button type="button" onClick={() => setProvenanceOpen(true)}><Info size={16} aria-hidden="true" />Data provenance</button></div>
      </div>
    </aside>
    <div ref={dockRef} className="timeline-dock glass-surface">
      <div className="dock-toolbar"><button type="button" aria-expanded={showHorizon} aria-controls="panoramic-horizon" onClick={() => setShowHorizon((value) => !value)}><ScanLine size={16} aria-hidden="true" />Local sky & horizon<ChevronDown size={15} className={showHorizon ? 'chevron-open' : ''} aria-hidden="true" /></button><span>Centre visibility · mock · no refraction</span><button type="button" className="dock-compare" onClick={() => setComparisonOpen(true)}><ArrowLeftRight size={15} aria-hidden="true" />Compare {state.comparisons.length}/3</button></div>
      <section id="panoramic-horizon" className="panoramic-horizon" hidden={!showHorizon} aria-label="Local sky and terrain horizon"><SkyHorizonView mask={result?.mask ?? null} ephemeris={result?.ephemeris ?? null} cursorIndex={result ? cursorIndex : null} observerHeightM={result?.inputs.observerHeightM ?? 0} /></section>
      <TimelinePanel result={result} cursorIndex={cursorIndex} playing={state.playing} speed={state.speed} disabled={pending} dispatch={dispatch} />
    </div>
    <SiteCommand open={commandOpen} onClose={() => setCommandOpen(false)} sites={viewerSites} selectedSiteId={draft?.site.id ?? null} onChoose={(site) => { selectSite(site); setShowInputs(true); if (compact) setShowResults(false); }} />
    <OverlayDialog open={comparisonOpen} onClose={() => setComparisonOpen(false)} title="Scenario comparison" description="Independent site-date snapshots. Differences are relative to the first saved scenario." className="comparison-dialog"><ComparisonPanel comparisons={state.comparisons} result={result} pending={pending} dispatch={dispatch} /></OverlayDialog>
    <OverlayDialog open={provenanceOpen} onClose={() => setProvenanceOpen(false)} title="Data provenance" description="Mock model, scientific conventions and finite-range limitations." className="provenance-dialog"><ProvenancePanel kind={provider.kind} terrain={terrain} result={result} /></OverlayDialog>
  </main>;
}
