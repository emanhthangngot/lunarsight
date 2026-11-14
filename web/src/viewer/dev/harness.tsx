import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { EphemerisSeries, HorizonMask, SiteSummary, TerrainSource } from '../../data/contract';
import { MockDataProvider } from '../../data/mock/MockDataProvider';
import { interpolateHorizonMask, isVisible } from '../../geo';
import { LunarViewer, SkyHorizonView } from '..';
import type { BodyDirection, CameraMode } from '..';

// Dev-only harness: http://127.0.0.1:5173/src/viewer/dev/harness.html
// Optional query: ?site=mock-ridge-a&mode=surface&cursor=120&h=2
const provider = new MockDataProvider();
const params = new URLSearchParams(location.search);
const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);

function Harness() {
  const [terrain, setTerrain] = useState<TerrainSource | null>(null);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState<string | null>(params.get('site'));
  const [mode, setMode] = useState<CameraMode>(params.get('mode') === 'surface' ? 'surface' : 'orbital');
  const [height, setHeight] = useState(Number(params.get('h') ?? 2));
  const [cursor, setCursor] = useState(Number(params.get('cursor') ?? 0));
  const [mask, setMask] = useState<HorizonMask | null>(null);
  const [eph, setEph] = useState<EphemerisSeries | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void provider.getTerrain().then(setTerrain);
    void provider.listSites().then(setSites);
  }, []);
  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  useEffect(() => {
    setMask(null); setEph(null); setError(null);
    if (!site) return undefined;
    let live = true;
    void provider.getHorizonMask(site, height).then((m) => { if (live) setMask(m); });
    provider.getEphemeris(site, START, START + 30 * DAY_MS, 3600, height).then(
      (e) => { if (live) setEph(e); },
      (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)); },
    );
    return () => { live = false; };
  }, [site, height]);

  const dir = (az: number[], el: number[]): BodyDirection | null => {
    const a = az[cursor];
    const e = el[cursor];
    if (a === undefined || e === undefined) return null;
    return { azDeg: a, elDeg: e, visible: mask ? isVisible(e, interpolateHorizonMask(mask.azimuthsDeg, mask.elevationsDeg, a)) : null };
  };
  const sun = eph ? dir(eph.sunAzDeg, eph.sunElDeg) : null;
  const earth = eph ? dir(eph.earthAzDeg, eph.earthElDeg) : null;

  // Mimics contract-2: full-bleed viewer, floating panel (right) and dock (bottom) via safe insets.
  const glass = { background: 'rgba(10,14,20,0.55)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 12 } as const;
  return (
    <div style={{ position: 'relative', height: '100vh', background: '#000', color: '#e5edf2', fontFamily: 'system-ui', ['--viewer-safe-right' as string]: '336px', ['--viewer-safe-bottom' as string]: '232px' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <LunarViewer terrain={terrain} sites={sites} selectedSiteId={siteId} observerHeightM={height} cameraMode={mode} sun={sun} earth={earth} onSelectSite={setSiteId} />
      </div>
      <div style={{ ...glass, position: 'absolute', top: 12, right: 12, width: 312, padding: 14, display: 'grid', gap: 10, fontSize: 13 }}>
        <strong>Viewer harness (dev only)</strong>
        <label>Site{' '}
          <select value={siteId ?? ''} onChange={(e) => setSiteId(e.target.value || null)}>
            <option value="">(none)</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Mode{' '}
          <select value={mode} onChange={(e) => setMode(e.target.value as CameraMode)}>
            <option value="orbital">orbital</option><option value="surface">surface</option>
          </select>
        </label>
        <label>Observer height {height} m <input type="range" min={0} max={50} step={1} value={height} onChange={(e) => setHeight(Number(e.target.value))} /></label>
        <label>Time cursor: day {(cursor / 24).toFixed(1)} <input type="range" min={0} max={720} value={cursor} onChange={(e) => setCursor(Number(e.target.value))} /></label>
        {error && <p role="alert">{error}</p>}
      </div>
      <div style={{ ...glass, position: 'absolute', left: 12, right: 12, bottom: 12, height: 208, padding: '8px 12px', display: 'grid' }}>
        <SkyHorizonView mask={mask} ephemeris={eph} cursorIndex={eph ? cursor : null} observerHeightM={height} />
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
