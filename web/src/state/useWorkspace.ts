import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { LunarDataProvider, SiteSummary, TerrainSource } from '../data/contract';
import { defaultInputs, initialWorkspace, ScenarioComputer, workspaceReducer, type ScenarioInputs } from './scenario';

export function useWorkspace(provider: LunarDataProvider) {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [terrain, setTerrain] = useState<TerrainSource | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const computer = useMemo(() => new ScenarioComputer(provider), [provider]);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const submit = useCallback((inputs: ScenarioInputs) => {
    const id = 'R' + ++sequence.current;
    dispatch({ type: 'begin', id });
    // Let React expose the recomputing/stale status before bounded CPU work.
    requestAnimationFrame(() => {
      if (!mounted.current) return;
      void computer.compute(inputs, id).then(
        (result) => { if (mounted.current) dispatch({ type: 'complete', result }); },
        (reason: unknown) => {
          const message = reason instanceof Error ? reason.message : 'Scenario computation failed';
          if (mounted.current) dispatch({ type: 'failed', id, message, outsideCoverage: reason instanceof RangeError && /outside.*coverage/i.test(message) });
        },
      );
    });
  }, [computer]);

  useEffect(() => {
    let active = true;
    void Promise.all([provider.listSites(), provider.getTerrain()]).then(([list, source]) => {
      if (!active) return;
      setSites(list); setTerrain(source);
      if (list[0]) {
        const inputs = defaultInputs(list[0]);
        dispatch({ type: 'initialize', inputs });
        void submit(inputs);
      }
    }, (reason: unknown) => { if (active) setBootError(reason instanceof Error ? reason.message : 'Unable to load provider'); });
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

  return { state, dispatch, sites, terrain, bootError, submit };
}
