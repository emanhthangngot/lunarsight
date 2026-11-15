import { useEffect, useMemo, useState } from 'react';
import type { LunarDataProvider, SiteSummary } from '../data/contract';
import { ComparisonRunner, pairInputs, pairKey, settingsOf, type PairOutcome } from './comparison';
import type { BackendAnalysisProvider, ScenarioInputs } from './scenario';

/**
 * Local, in-memory A/B comparison. Settings come from the workspace's applied inputs, so
 * both sites always share one UTC window, cadence and observer height. Runs only while the
 * comparison view is open; closing it, changing a site or changing the settings aborts the
 * running pair, and stale pairs are never shown under the current selection.
 */
export function useComparison(provider: LunarDataProvider, applied: ScenarioInputs | null, sites: readonly SiteSummary[], open: boolean) {
  const runner = useMemo(() => new ComparisonRunner(provider as BackendAnalysisProvider), [provider]);
  const [siteAId, setSiteAId] = useState<string | null>(null);
  const [siteBId, setSiteBId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<PairOutcome | null>(null);

  const siteA = sites.find((site) => site.id === siteAId) ?? null;
  const siteB = sites.find((site) => site.id === siteBId) ?? null;
  const pair = applied && siteA && siteB && siteA.id !== siteB.id ? pairInputs(settingsOf(applied), siteA, siteB) : null;
  const key = pair ? pairKey(pair.a, pair.b) : null;

  useEffect(() => {
    if (!open || !pair) return undefined;
    let active = true;
    runner.run(pair.a, pair.b).then((next) => { if (active && next) setOutcome(next); });
    return () => { active = false; runner.cancel(); };
    // `key` captures every scientific input of both sides; `pair` is rebuilt each render.
  }, [open, key, runner]);

  useEffect(() => () => runner.cancel(), [runner]);

  const current = outcome && outcome.key === key ? outcome : null;
  return {
    siteA, siteB, setSiteAId, setSiteBId,
    settings: pair ? settingsOf(pair.a) : applied ? settingsOf(applied) : null,
    running: open && pair !== null && current === null,
    outcome: current,
  };
}
