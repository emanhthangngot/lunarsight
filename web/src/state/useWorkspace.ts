import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { AdvisorResponse, SavedScenarioDetail, SavedScenarioSummary } from '../data/api/ApiDataProvider';
import type { LunarDataProvider, SiteSummary, TerrainSource } from '../data/contract';
import {
  defaultInputs,
  initialWorkspace,
  ScenarioComputer,
  workspaceReducer,
  type BackendAnalysisProvider,
  type ScenarioInputs,
  type ScenarioResult,
} from './scenario';

interface PersistenceProvider extends BackendAnalysisProvider {
  listSavedScenarios?(): Promise<SavedScenarioSummary[]>;
  saveScenario?(
    title: string,
    inputs: ScenarioInputs,
    resultId?: string,
    notes?: string,
  ): Promise<SavedScenarioSummary>;
  getSavedScenario?(scenarioId: string): Promise<SavedScenarioDetail>;
  deleteSavedScenario?(scenarioId: string): Promise<void>;
  askAdvisor?(resultId: string, question?: string, language?: 'vi' | 'en'): Promise<AdvisorResponse>;
}

export function useWorkspace(provider: LunarDataProvider) {
  const persistence = provider as PersistenceProvider;
  const hasPersistence =
    typeof persistence.listSavedScenarios === 'function' &&
    typeof persistence.saveScenario === 'function' &&
    typeof persistence.getSavedScenario === 'function' &&
    typeof persistence.deleteSavedScenario === 'function';
  const hasAdvisor = typeof persistence.askAdvisor === 'function';

  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspace);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [terrain, setTerrain] = useState<TerrainSource | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioSummary[]>([]);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
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
    const scenarioIdFromUrl =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('scenario')
        : null;

    const loadInitial = async () => {
      const [list, source] = await Promise.all([provider.listSites(), provider.getTerrain()]);
      if (!active) return;
      setSites(list);
      setTerrain(source);

      if (hasPersistence && persistence.listSavedScenarios) {
        void persistence.listSavedScenarios().then(
          (items) => { if (active) setSavedScenarios(items); },
          () => { /* Keep workspace usable even if saved-scenario list fails */ },
        );
      }

      if (scenarioIdFromUrl && persistence.getSavedScenario) {
        try {
          const detail = await persistence.getSavedScenario(scenarioIdFromUrl);
          if (!active) return;
          if (detail.result) {
            const loaded: ScenarioResult = {
              id: 'R' + ++sequence.current,
              serverResultId: detail.result.id,
              inputs: detail.result.inputs,
              ephemeris: detail.result.ephemeris,
              mask: detail.result.mask,
              analysis: detail.result.analysis,
            };
            dispatch({ type: 'load', result: loaded });
            return;
          }
          dispatch({ type: 'initialize', inputs: detail.inputs });
          void submit(detail.inputs);
          return;
        } catch (reason: unknown) {
          if (active) {
            setScenarioError(reason instanceof Error ? reason.message : 'Saved scenario not found');
          }
        }
      }

      if (list[0]) {
        const inputs = defaultInputs(list[0]);
        dispatch({ type: 'initialize', inputs });
        void submit(inputs);
      }
    };

    void loadInitial().catch((reason: unknown) => {
      if (active) setBootError(reason instanceof Error ? reason.message : 'Unable to load provider');
    });
    return () => { active = false; };
  }, [provider, submit, hasPersistence]);

  const saveScenarioToServer = useCallback(async (title: string, notes?: string): Promise<SavedScenarioSummary | null> => {
    if (!hasPersistence || !persistence.saveScenario || !state.result) return null;
    setScenarioBusy(true);
    setScenarioError(null);
    try {
      const saved = await persistence.saveScenario(
        title,
        state.result.inputs,
        state.result.serverResultId,
        notes,
      );
      if (mounted.current) {
        setSavedScenarios((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.set('scenario', saved.id);
          window.history.replaceState(null, '', url.toString());
        }
      }
      return saved;
    } catch (reason: unknown) {
      if (mounted.current) {
        setScenarioError(reason instanceof Error ? reason.message : 'Unable to save scenario');
      }
      return null;
    } finally {
      if (mounted.current) setScenarioBusy(false);
    }
  }, [hasPersistence, persistence, state.result]);

  const loadScenarioFromServer = useCallback(async (scenarioId: string): Promise<void> => {
    if (!hasPersistence || !persistence.getSavedScenario) return;
    setScenarioBusy(true);
    setScenarioError(null);
    try {
      const detail = await persistence.getSavedScenario(scenarioId);
      if (!mounted.current) return;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('scenario', detail.id);
        window.history.replaceState(null, '', url.toString());
      }
      if (detail.result) {
        dispatch({
          type: 'load',
          result: {
            id: 'R' + ++sequence.current,
            serverResultId: detail.result.id,
            inputs: detail.result.inputs,
            ephemeris: detail.result.ephemeris,
            mask: detail.result.mask,
            analysis: detail.result.analysis,
          },
        });
      } else {
        dispatch({ type: 'draft', patch: detail.inputs });
        void submit(detail.inputs);
      }
    } catch (reason: unknown) {
      if (mounted.current) {
        setScenarioError(reason instanceof Error ? reason.message : 'Unable to load scenario');
      }
    } finally {
      if (mounted.current) setScenarioBusy(false);
    }
  }, [hasPersistence, persistence, submit]);

  const deleteScenarioFromServer = useCallback(async (scenarioId: string): Promise<void> => {
    if (!hasPersistence || !persistence.deleteSavedScenario) return;
    setScenarioBusy(true);
    setScenarioError(null);
    try {
      await persistence.deleteSavedScenario(scenarioId);
      if (mounted.current) {
        setSavedScenarios((prev) => prev.filter((item) => item.id !== scenarioId));
      }
    } catch (reason: unknown) {
      if (mounted.current) {
        setScenarioError(reason instanceof Error ? reason.message : 'Unable to delete scenario');
      }
    } finally {
      if (mounted.current) setScenarioBusy(false);
    }
  }, [hasPersistence, persistence]);

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

  const askAdvisor = useCallback(
    async (resultId: string, question?: string, language: 'vi' | 'en' = 'vi'): Promise<AdvisorResponse> => {
      if (!persistence.askAdvisor) {
        throw new Error('AI Advisor requires backend API mode');
      }
      return persistence.askAdvisor(resultId, question, language);
    },
    [persistence],
  );

  return {
    state,
    dispatch,
    sites,
    terrain,
    bootError,
    submit,
    hasPersistence,
    hasAdvisor,
    savedScenarios,
    scenarioBusy,
    scenarioError,
    saveScenarioToServer,
    loadScenarioFromServer,
    deleteScenarioFromServer,
    askAdvisor,
  };
}
