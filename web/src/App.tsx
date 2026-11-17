import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Activity, ArrowLeftRight, ChevronDown, Clock3, Info, MapPin, Moon, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, ScanLine, Sparkles, X } from 'lucide-react';
import type { LunarDataProvider, SiteSummary } from './data/contract';
import { LunarViewer, type BodyDirection, type LandingSummary } from './viewer/LunarViewer';
import { SkyHorizonView } from './viewer/SkyHorizonView';
import { useWorkspace } from './state/useWorkspace';
import { useComparison } from './state/useComparison';
import { scenarioKey, shortlistSites } from './state/scenario';
import { SitePanel } from './panels/SitePanel';
import { ScenarioPanel } from './panels/ScenarioPanel';
import { MetricsPanel } from './panels/MetricsPanel';
import { ComparisonPanel } from './panels/ComparisonPanel';
import { TimelinePanel } from './panels/TimelinePanel';
import { ProvenancePanel } from './panels/ProvenancePanel';
import { OverlayDialog } from './components/OverlayDialog';
import { SiteCommand } from './components/SiteCommand';
import { FeatureGuide, type FeatureId } from './components/FeatureGuide';
import { number, sourceLabel, utc, windowLabel } from './panels/format';
import { planLandingMoment } from './analysis/landingMoment';

export function App({ provider }: { provider: LunarDataProvider }) {
  const { state, dispatch, sites, terrain, bootError, submit, cancel, selectSite } = useWorkspace(provider);
  const { draft, result, pendingId, pendingInputs, cursorIndex } = state;
  useEffect(() => {
    document.title = provider.kind === 'processed' ? 'LunarSight — NASA-sourced data explorer' : 'LunarSight — Mock Explorer';
  }, [provider.kind]);
  const pending = pendingId !== null;
  // A request for another site hides the previous site's science instead of showing it under
  // the new name; a same-site request (window/height edit) keeps it, marked stale.
  const pendingOther = pending && pendingInputs !== null && pendingInputs.site.id !== result?.inputs.site.id;
  const shown = pendingOther ? null : result;
  const displayInputs = pendingOther ? pendingInputs : result?.inputs ?? null;
  const displaySite = displayInputs?.site ?? draft?.site ?? null;
  const dirty = !!draft && !pending && (!result || scenarioKey(draft) !== scenarioKey(result.inputs));
  const viewerSites = useMemo(() => {
    // Custom coordinates are not catalog entries; add the shown/pending one so it can be marked.
    const extra: SiteSummary[] = [];
    for (const site of [result?.inputs.site, pendingInputs?.site]) {
      if (site?.category === 'custom' && !sites.some((s) => s.id === site.id) && !extra.some((s) => s.id === site.id)) extra.push(site);
    }
    return extra.length ? [...sites, ...extra] : sites;
  }, [sites, result?.inputs.site, pendingInputs?.site]);
  const shortlist = useMemo(() => shortlistSites(sites), [sites]);
  const sun: BodyDirection | null = shown ? {
    azDeg: shown.ephemeris.sunAzDeg[cursorIndex]!, elDeg: shown.ephemeris.sunElDeg[cursorIndex]!,
    visible: shown.analysis.sunVisible[cursorIndex] ?? null,
  } : null;
  const earth: BodyDirection | null = shown ? {
    azDeg: shown.ephemeris.earthAzDeg[cursorIndex]!, elDeg: shown.ephemeris.earthElDeg[cursorIndex]!,
    visible: shown.analysis.earthVisible[cursorIndex] ?? null,
  } : null;
  const [landingNote, setLandingNoteState] = useState<{ text: string; index: number; resultId: string } | null>(null);
  /** Landing showcase: move the time cursor to the first sample with both bodies visible, if any. */
  const playLanding = useCallback(() => {
    if (!shown) { setLandingNoteState(null); return; }
    const moment = planLandingMoment(shown.analysis.both, cursorIndex, shown.mask !== null);
    const text: Record<typeof moment.kind, string> = {
      move: `Timeline moved to ${utc(shown.ephemeris.timesUtcMs[moment.index]).replace('Z', '')} UTC: the first sample in this window with the Sun and Earth both above the terrain horizon.`,
      already: 'The Sun and Earth are both above the terrain horizon at the selected time.',
      none: 'No sample in this window has the Sun and Earth both above the terrain horizon. The selected time was kept.',
      'none-known': 'No known sample in this window has the Sun and Earth both above the terrain horizon; some samples are unknown. The selected time was kept.',
      'mask-unavailable': 'Horizon mask unavailable: visibility is unknown, so the selected time was kept.',
    };
    // Playback would walk the cursor away from the moment the landing view explains.
    dispatch({ type: 'playing', playing: false });
    if (moment.kind === 'move') dispatch({ type: 'cursor', index: moment.index });
    // The note describes one cursor position of one result; it is dropped once either changes.
    setLandingNoteState({ text: text[moment.kind], index: moment.index, resultId: shown.id });
  }, [shown, cursorIndex, dispatch]);
  const staleSummary = pending && !pendingOther;
  const landingSummary = useMemo<LandingSummary | null>(() => shown ? {
    title: shown.inputs.site.name,
    meta: `${windowLabel(shown.inputs)} · ${sourceLabel(shown.ephemeris.provenance.kind)}`,
    ...(staleSummary ? { notice: `Recomputing — values from ${shown.id} until it finishes.` } : {}),
    rows: [
      { label: 'Sunlit', value: number(shown.analysis.metrics.sunlitHours, ' h') },
      { label: 'Longest darkness', value: number(shown.analysis.metrics.longestDarknessHours, ' h') },
      { label: 'Earth visible', value: number(shown.analysis.metrics.earthVisibleHours, ' h') },
      { label: 'Both visible', value: number(shown.analysis.metrics.bothHours, ' h') },
    ],
  } : null, [shown, staleSummary]);
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1199px)').matches);
  const [showInputs, setShowInputs] = useState(() => !window.matchMedia('(max-width: 1199px)').matches);
  const [showResults, setShowResults] = useState(() => !window.matchMedia('(max-width: 1199px)').matches);
  const [showHorizon, setShowHorizon] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [landingRequest, setLandingRequest] = useState(0);
  const [insets, setInsets] = useState({ instrumentTop: 88, top: 120, bottom: 320 });
  const commandRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const comparison = useComparison(provider, result?.inputs ?? null, viewerSites, comparisonOpen);
  const { setSiteAId, setSiteBId } = comparison;

  const openCommands = useCallback(() => {
    setComparisonOpen(false); setProvenanceOpen(false); setCommandOpen(true);
  }, []);
  /** "Compare with…": A = the shown result's site, B = the first other shortlist (else catalog) site. */
  const openComparison = useCallback(() => {
    const a = result?.inputs.site.id ?? shortlist[0]?.id ?? null;
    const b = [...shortlist, ...viewerSites].find((site) => site.id !== a)?.id ?? null;
    setSiteAId(a); setSiteBId(b);
    setCommandOpen(false); setProvenanceOpen(false); setComparisonOpen(true);
  }, [result?.inputs.site.id, shortlist, viewerSites, setSiteAId, setSiteBId]);
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
  /** Feature guide: close it and open the chosen feature straight away. */
  function openFeature(feature: FeatureId) {
    setFeaturesOpen(false);
    if (feature === 'sites') openCommands();
    else if (feature === 'compare') openComparison();
    else if (feature === 'provenance') setProvenanceOpen(true);
    else if (feature === 'horizon') setShowHorizon(true);
    else if (feature === 'summary') { setShowResults(true); if (compact) setShowInputs(false); }
    else if (feature === 'ground') dispatch({ type: 'camera', mode: 'surface' });
    else if (feature === 'timeline') {
      // Same rules as the timeline's own Play: nothing while computing, restart from the window end.
      if (!shown || pending) return;
      if (cursorIndex === shown.ephemeris.timesUtcMs.length - 1) dispatch({ type: 'cursor', index: 0 });
      dispatch({ type: 'playing', playing: true });
    }
    // Only for a settled result: a request must not fire later against a different result.
    else if (feature === 'landing') { if (shown && !pending) setLandingRequest((request) => request + 1); }
  }
  function toggleMission() { setShowInputs((value) => !value); if (compact) setShowResults(false); }
  function toggleInspector() { setShowResults((value) => !value); if (compact) setShowInputs(false); }
  const dataBadge = (() => {
    if (provider.kind === 'mock') return { label: 'MOCK DATA', kind: 'mock' };
    if (!shown) return pending ? { label: 'LOADING', kind: 'loading' } : { label: 'NO RESULT', kind: 'loading' };
    const kinds = [terrain?.provenance.kind, shown.ephemeris.provenance.kind, shown.mask?.provenance.kind].filter(Boolean);
    if (kinds.every((k) => k === 'processed')) return { label: 'NASA-SOURCED · PROCESSED', kind: 'processed' };
    if (kinds.every((k) => k === 'mock')) return { label: 'MOCK DATA', kind: 'mock' };
    return { label: 'MIXED DATA', kind: 'mixed' };
  })();
  const isProcessedMode = provider.kind === 'processed';
  const currentUtc = shown ? utc(shown.ephemeris.timesUtcMs[cursorIndex]) : 'No result';
  const pendingReason = pending && pendingInputs ? `Computing ${pendingInputs.site.name} — timeline controls resume when it finishes.` : null;
  const appStyle = {
    '--instrument-top': insets.instrumentTop + 'px', '--dock-safe-bottom': insets.bottom + 'px',
    '--viewer-safe-top': insets.top + 'px',
    '--viewer-safe-bottom': insets.bottom + 'px',
    '--viewer-safe-left': showInputs ? 'calc(var(--ls-mission-width) + var(--ls-gutter) + var(--ls-gap))' : 'var(--ls-gutter)',
    '--viewer-safe-right': showResults ? 'calc(var(--ls-inspector-width) + var(--ls-gutter) + var(--ls-gap))' : 'var(--ls-gutter)',
  } as CSSProperties;

  return <main className="app-shell" data-compact={compact} style={appStyle}>
    <div className="viewer-stage">
      <LunarViewer terrain={terrain} sites={viewerSites} selectedSiteId={displaySite?.id ?? null} observerHeightM={displayInputs?.observerHeightM ?? 0} cameraMode={state.cameraMode} sun={sun} earth={earth} onSelectSite={(id) => { const site = viewerSites.find((candidate) => candidate.id === id); if (site) selectSite(site); }} onPlayLanding={() => { playLanding(); if (compact) { setShowInputs(false); setShowResults(false); } }} landingRequest={landingRequest} landingNote={landingNote && shown && landingNote.resultId === shown.id && landingNote.index === cursorIndex ? landingNote.text : null} landingSummary={landingSummary} />
    </div>
    <header ref={commandRef} className="command-bar glass-surface">
      <a className="brand" href="#workspace" aria-label="LunarSight workspace"><Moon size={25} strokeWidth={1.3} aria-hidden="true" /><h1>LunarSight</h1></a>
      <button className="site-switcher" type="button" aria-label="Find a lunar site" aria-haspopup="dialog" aria-expanded={commandOpen} aria-keyshortcuts="Control+k Meta+k" onClick={openCommands}><MapPin size={17} aria-hidden="true" /><span>{displaySite?.name ?? 'Find a lunar site'}</span><kbd>⌘ K</kbd><ChevronDown size={14} aria-hidden="true" /></button>
      <div className="utc-pill" title={currentUtc + ' UTC'}><Clock3 size={16} aria-hidden="true" /><div><span className="utc-date">{shown ? currentUtc.slice(0, 10) : 'No result'}</span><time dateTime={shown ? new Date(shown.ephemeris.timesUtcMs[cursorIndex]!).toISOString() : undefined}>{shown ? currentUtc.slice(11).replace('Z', '') + ' UTC' : pending ? 'Computing…' : 'Time unavailable'}</time></div></div>
      <div className="mode-toggle" role="group" aria-label="Local camera view">{(['orbital', 'surface'] as const).map((mode) => <button key={mode} type="button" aria-pressed={state.cameraMode === mode} title={mode === 'orbital' ? 'Overview of the local terrain around the site' : 'Eye-height view from the site'} onClick={() => dispatch({ type: 'camera', mode })}>{mode === 'orbital' ? 'Site overview' : 'Ground view'}</button>)}</div>
      <div className="command-utilities">
        <button className="icon-button mission-toggle" type="button" aria-label={showInputs ? 'Close Mission' : 'Open Mission'} aria-controls="mission-drawer" aria-expanded={showInputs} title="Mission inputs" onClick={toggleMission}>{showInputs ? <PanelLeftClose size={19} aria-hidden="true" /> : <PanelLeftOpen size={19} aria-hidden="true" />}</button>
        <button className="icon-button inspector-toggle" type="button" aria-label={showResults ? 'Close site summary' : 'Open site summary'} aria-controls="inspector-drawer" aria-expanded={showResults} title="Site summary" onClick={toggleInspector}>{showResults ? <PanelRightClose size={19} aria-hidden="true" /> : <PanelRightOpen size={19} aria-hidden="true" />}</button>
        <button className="icon-button" type="button" aria-label="Compare two sites" aria-haspopup="dialog" title="Compare two sites" onClick={openComparison}><ArrowLeftRight size={18} aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label="Open provenance" aria-haspopup="dialog" title="Provenance & conventions" onClick={() => setProvenanceOpen(true)}><Info size={18} aria-hidden="true" /></button>
      </div>
      {dataBadge.kind !== 'processed' && <strong className="mock-badge" data-kind={dataBadge.kind}>{dataBadge.label}</strong>}
      <button className="features-button" type="button" aria-label="Features" title="What LunarSight does" aria-haspopup="dialog" onClick={() => setFeaturesOpen(true)}><Sparkles size={16} aria-hidden="true" /><span>Features</span></button>
    </header>
    <div id="workspace" className="result-status" data-status={pending ? 'pending' : state.error ? 'error' : 'ready'}>
      <span className="status-dot" aria-hidden="true" />
      <span role="status" aria-live="polite">{pending && pendingInputs ? `Computing ${pendingInputs.site.name}${pendingOther ? '' : ' — values shown are stale'}` : state.error ? (state.outsideCoverage ? 'Outside data coverage — result unavailable' : 'Scenario unavailable') : result ? result.inputs.site.name + ' · ' + result.id : 'Loading workspace'}</span>
      {pending && <button type="button" className="status-action" onClick={cancel}>Cancel</button>}
      {dirty && <strong>Edited inputs not applied</strong>}
    </div>
    {(bootError || state.error) && <div className="error-banner glass-surface" role="alert"><strong>{bootError ? 'Data unavailable' : state.outsideCoverage ? 'Outside data coverage' : 'Scenario unavailable'}</strong><p>{bootError ?? state.error}</p><p>Missing data is shown as unavailable, never as zero.</p>{!bootError && <button type="button" onClick={() => { setShowInputs(true); if (compact) setShowResults(false); }}>Edit mission inputs</button>}</div>}

    <aside id="mission-drawer" className="instrument-drawer mission-drawer glass-surface" data-open={showInputs} inert={!showInputs} aria-hidden={!showInputs} aria-label="Mission inputs">
      <header className="instrument-heading"><div><MapPin size={17} aria-hidden="true" /><h2>Mission</h2></div><button className="icon-button" type="button" aria-label="Collapse Mission drawer" onClick={() => setShowInputs(false)}><X size={17} aria-hidden="true" /></button></header>
      <div className="instrument-scroll"><SitePanel sites={sites} shortlist={shortlist} shownSiteId={displaySite?.id ?? null} pendingSiteId={pendingInputs?.site.id ?? null} terrain={terrain} onSelect={selectSite} />
        {draft && <ScenarioPanel draft={draft} pending={pending} dirty={dirty} supportedHeightsM={provider.supportedObserverHeightsM} onChange={(patch) => dispatch({ type: 'draft', patch })} onSubmit={() => submit(draft)} onCancel={cancel} />}
        <p className="integrity-note">{isProcessedMode ? 'NASA-sourced, processed PGDA LOLA terrain and JPL Horizons ephemerides. Modelled results; not independently validated or flight-certified.' : 'Fictional terrain & analytic Sun/Earth geometry. Not JPL ephemerides or LOLA data.'}</p>
      </div>
    </aside>
    <aside id="inspector-drawer" className="instrument-drawer inspector-drawer glass-surface" data-open={showResults} inert={!showResults} aria-hidden={!showResults} aria-label="Site summary">
      <header className="instrument-heading"><div><Activity size={17} aria-hidden="true" /><h2>Summary</h2></div><button className="icon-button" type="button" aria-label="Collapse site summary" onClick={() => setShowResults(false)}><X size={17} aria-hidden="true" /></button></header>
      <div className="instrument-scroll"><MetricsPanel result={shown} pendingInputs={pendingOther ? pendingInputs : null} stale={pending && !pendingOther} cursorIndex={cursorIndex} onCancel={cancel} />
        <div className="inspector-actions"><button type="button" disabled={!result} title={result ? 'Compare this site with another over the same window' : 'Needs an applied result first'} onClick={openComparison}><ArrowLeftRight size={16} aria-hidden="true" />Compare with…</button><button type="button" onClick={() => setProvenanceOpen(true)}><Info size={16} aria-hidden="true" />Data provenance</button></div>
      </div>
    </aside>
    <div ref={dockRef} className="timeline-dock glass-surface">
      <div className="dock-toolbar"><button type="button" aria-expanded={showHorizon} aria-controls="panoramic-horizon" onClick={() => setShowHorizon((value) => !value)}><ScanLine size={16} aria-hidden="true" />Local sky & horizon<ChevronDown size={15} className={showHorizon ? 'chevron-open' : ''} aria-hidden="true" /></button><span>Centre visibility · {shown?.ephemeris.provenance.kind === 'processed' ? 'PGDA + Horizons' : provider.kind} · no refraction</span><button type="button" className="dock-compare" onClick={openComparison}><ArrowLeftRight size={15} aria-hidden="true" />Compare sites</button></div>
      <section id="panoramic-horizon" className="panoramic-horizon" hidden={!showHorizon} aria-label="Local sky and terrain horizon"><SkyHorizonView mask={shown?.mask ?? null} ephemeris={shown?.ephemeris ?? null} cursorIndex={shown ? cursorIndex : null} observerHeightM={displayInputs?.observerHeightM ?? 0} /></section>
      <TimelinePanel result={shown} cursorIndex={cursorIndex} playing={state.playing} speed={state.speed} pendingReason={pendingReason} dispatch={dispatch} />
    </div>
    <SiteCommand open={commandOpen} onClose={() => setCommandOpen(false)} sites={viewerSites} selectedSiteId={displaySite?.id ?? null} onChoose={selectSite} />
    <OverlayDialog open={comparisonOpen} onClose={() => setComparisonOpen(false)} title="Compare two sites" description="Same UTC window, step and observer height for both sites; only the site differs." className="comparison-dialog">
      <ComparisonPanel sites={viewerSites} shortlist={shortlist} siteA={comparison.siteA} siteB={comparison.siteB} onSiteA={setSiteAId} onSiteB={setSiteBId} settings={comparison.settings} running={comparison.running} outcome={comparison.outcome} />
    </OverlayDialog>
    <OverlayDialog open={featuresOpen} onClose={() => setFeaturesOpen(false)} title="What LunarSight does" description="Tap any item to open it." className="features-dialog"><FeatureGuide onOpen={openFeature} /></OverlayDialog>
    <OverlayDialog open={provenanceOpen} onClose={() => setProvenanceOpen(false)} title="Data provenance" description="Data sources, scientific conventions and finite-range limitations." className="provenance-dialog"><ProvenancePanel kind={provider.kind} terrain={terrain} result={shown} /></OverlayDialog>
  </main>;
}
