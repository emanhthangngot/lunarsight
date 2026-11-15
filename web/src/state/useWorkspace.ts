import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LunarDataProvider, SiteSummary, TerrainSource } from '../data/contract';
import {
  defaultInputs,
  defaultObserverHeightM,
  describeFailure,
  initialWorkspace,
  isAbortError,
  ScenarioComputer,
  shortlistSites,
  workspaceReducer,
  type BackendAnalysisProvider,
  type ScenarioInputs,
} from './scenario';

export function useWorkspace(provider: LunarDataProvider) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [terrain, setTerrain] = useState<TerrainSource | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const computer = useMemo(() => new ScenarioComputer(provider as BackendAnalysisProvider), [provider]);
  const sequence = useRef(0);
  /** The one in-flight workspace request; replaced (and aborted) by every new submission. */
  const request = useRef<{ id: string; controller: AbortController } | null>(null);
  const draftRef = useRef(state.draft);
  draftRef.current = state.draft;

  const submit = useCallback((inputs: ScenarioInputs) => {
    request.current?.controller.abort();
    const id = 'R' + ++sequence.current;
    const controller = new AbortController();
    request.current = { id, controller };
    dispatch({ type: 'begin', id, inputs });
    // Let React expose the pending state before bounded CPU work.
    requestAnimationFrame(() => {
      if (controller.signal.aborted) return;
      computer.compute(inputs, id, controller.signal).then(
        (result) => {
          if (request.current?.id === id) request.current = null;
          if (!controller.signal.aborted) dispatch({ type: 'complete', result });
        },
        (reason: unknown) => {
          if (request.current?.id === id) request.current = null;
          // Superseded or cancelled: the newer request / cancel action already owns the state.
          if (isAbortError(reason) || controller.signal.aborted) return;
          dispatch({ type: 'failed', id, ...describeFailure(reason) });
        },
      );
    });
  }, [computer]);

  /** Cancels the in-flight request; the last completed result stays on screen. */
  const cancel = useCallback(() => {
    const current = request.current;
    if (!current) return;
    request.current = null;
    current.controller.abort();
    dispatch({ type: 'cancel', id: current.id });
  }, []);

  /** Choosing a site analyses it immediately with the current inputs; other edits wait for Apply. */
  const selectSite = useCallback((site: SiteSummary) => {
    const draft = draftRef.current;
    if (!draft) return;
    const next = { ...draft, site };
    dispatch({ type: 'draft', patch: { site } });
    submit(next);
  }, [submit]);

  useEffect(() => () => { request.current?.controller.abort(); request.current = null; }, []);

  useEffect(() => {
    let active = true;
    const loadInitial = async () => {
      const [list, source] = await Promise.all([provider.listSites(), provider.getTerrain()]);
      if (!active) return;
      setSites(list);
      setTerrain(source);
      const first = shortlistSites(list)[0];
      if (first) {
        const inputs = defaultInputs(first, defaultObserverHeightM(provider));
        dispatch({ type: 'initialize', inputs });
        submit(inputs);
      }
    };
    loadInitial().catch((reason: unknown) => {
      if (active) setBootError(reason instanceof Error ? reason.message : 'Unable to load provider');
    });
    return () => { active = false; };
  }, [provider, submit]);

  useEffect(() => {
    const result = state.result;
    if (!state.playing || !result) return;
    const times = result.ephemeris.timesUtcMs;
    const started = performance.now();
    const initialTime = times[state.cursorIndex] ?? times[0]!;
    const timer = window.setInterval(() => {
      // 1x = one simulated hour per real second; no frame-rate dependence.
      const target = initialTime + (performance.now() - started) * state.speed * 3600;
      let lo = 0, hi = times.length;
      while (lo < hi) { const mid = (lo + hi) >>> 1; if (times[mid]! <= target) lo = mid + 1; else hi = mid; }
      dispatch({ type: 'cursor', index: Math.max(0, lo - 1) });
      if (target >= times.at(-1)!) dispatch({ type: 'playing', playing: false });
    }, 100);
    return () => window.clearInterval(timer);
    // Cursor ticks must not reset this elapsed-time baseline. Manual scrubbing pauses.
  }, [state.playing, state.speed, state.result]);

  return { state, dispatch, sites, terrain, bootError, submit, cancel, selectSite };
}
