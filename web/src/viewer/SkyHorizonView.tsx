import { useEffect, useMemo, useRef, useState } from 'react';
import { interpolateHorizonMask } from '../geo';
import type { SkyHorizonViewProps } from './types';
import { formatSigned } from './skyGeometry';
import './viewer.css';

export type { SkyHorizonViewProps } from './types';

/** Plot margins (px). Labels sit inside the plot edges so the strip can be very short. */
const M = { left: 38, right: 10, top: 8, bottom: 20 };
const DEFAULT_SIZE = { width: 960, height: 168 };
/** Tracks far below the horizon only need to show that they are down. */
const MIN_EL = -15;

type Pt = readonly [az: number, el: number, above: boolean | null];

/** Split a track into runs that neither wrap 360→0 nor change above/below-mask state. */
function splitTrack(az: readonly number[], el: readonly number[], maskAt: (az: number) => number | null): Pt[][] {
  const runs: Pt[][] = [];
  let current: Pt[] = [];
  for (let i = 0; i < az.length; i++) {
    const a = az[i];
    const e = el[i];
    if (a === undefined || e === undefined || !Number.isFinite(a) || !Number.isFinite(e)) continue;
    const m = maskAt(a);
    const above = m === null ? null : e > m;
    const prev = current[current.length - 1];
    if (prev && Math.abs(a - prev[0]) > 180) {
      runs.push(current);
      current = [];
    } else if (prev && prev[2] !== above) {
      // Close the run at the state change and start the next run at the same point.
      current.push([a, e, prev[2]]);
      runs.push(current);
      current = [];
    }
    current.push([a, e, above]);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function useSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState(DEFAULT_SIZE);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function SkyHorizonView({ mask, ephemeris, cursorIndex, observerHeightM }: SkyHorizonViewProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const { width: W, height: H } = useSize(plotRef);
  const plotW = Math.max(W - M.left - M.right, 10);
  const plotH = Math.max(H - M.top - M.bottom, 10);

  const maskAt = useMemo(() => (az: number) => (mask ? interpolateHorizonMask(mask.azimuthsDeg, mask.elevationsDeg, az) : null), [mask]);

  const { lo, hi } = useMemo(() => {
    let low = -5;
    let high = 10;
    const consider = (values: readonly number[]) => {
      for (const v of values) {
        if (!Number.isFinite(v)) continue;
        if (v < low) low = Math.floor(v / 5) * 5;
        if (v > high) high = Math.ceil(v / 5) * 5;
      }
    };
    if (mask) consider(mask.elevationsDeg);
    if (ephemeris) { consider(ephemeris.sunElDeg); consider(ephemeris.earthElDeg); }
    return { lo: Math.max(low, MIN_EL), hi: high };
  }, [mask, ephemeris]);
  const x = (az: number) => M.left + (az / 360) * plotW;
  const y = (el: number) => M.top + ((hi - Math.max(lo, Math.min(hi, el))) / (hi - lo)) * plotH;

  const maskPath = useMemo(() => {
    if (!mask || mask.azimuthsDeg.length === 0) return null;
    let d = `M${x(0)},${y(lo)}`;
    mask.azimuthsDeg.forEach((az, i) => { d += `L${x(az).toFixed(1)},${y(mask.elevationsDeg[i] ?? 0).toFixed(1)}`; });
    const first = mask.elevationsDeg[0];
    if (first !== undefined) d += `L${x(360)},${y(first).toFixed(1)}`;
    return { area: d + `L${x(360)},${y(lo)}Z`, ridge: d.replace(/^M[^L]*L/, 'M') };
    // x/y are derived from W/H/lo/hi
  }, [mask, W, H, lo, hi]); // eslint-disable-line react-hooks/exhaustive-deps

  const tracks = useMemo(() => ephemeris ? {
    sun: splitTrack(ephemeris.sunAzDeg, ephemeris.sunElDeg, maskAt),
    earth: splitTrack(ephemeris.earthAzDeg, ephemeris.earthElDeg, maskAt),
  } : null, [ephemeris, maskAt]);

  const cursor = useMemo(() => {
    if (!ephemeris || cursorIndex === null) return null;
    const sunAz = ephemeris.sunAzDeg[cursorIndex];
    const sunEl = ephemeris.sunElDeg[cursorIndex];
    const earthAz = ephemeris.earthAzDeg[cursorIndex];
    const earthEl = ephemeris.earthElDeg[cursorIndex];
    const timeMs = ephemeris.timesUtcMs[cursorIndex];
    if (sunAz === undefined || sunEl === undefined || earthAz === undefined || earthEl === undefined || timeMs === undefined) return null;
    const state = (az: number, el: number): boolean | null => {
      const m = maskAt(az);
      return m === null ? null : el > m;
    };
    return {
      timeMs, sunAz, sunEl, earthAz, earthEl,
      sunMask: maskAt(sunAz), earthMask: maskAt(earthAz),
      sunVisible: state(sunAz, sunEl), earthVisible: state(earthAz, earthEl),
    };
  }, [ephemeris, cursorIndex, maskAt]);

  const mock = mask?.provenance.kind === 'mock' || ephemeris?.provenance.kind === 'mock';
  const stateWord = (v: boolean | null) => (v === true ? 'above terrain horizon' : v === false ? 'below terrain horizon' : 'visibility unknown (no mask)');
  const summary = cursor
    ? `Sky at ${new Date(cursor.timeMs).toISOString()}: Sun azimuth ${cursor.sunAz.toFixed(1)}°, elevation ${formatSigned(cursor.sunEl)}, ${stateWord(cursor.sunVisible)}. ` +
      `Earth azimuth ${cursor.earthAz.toFixed(1)}°, elevation ${formatSigned(cursor.earthEl)}, ${stateWord(cursor.earthVisible)}. ` +
      `Observer height ${observerHeightM} m above terrain.${mock ? ' Mock data.' : ''}`
    : `Sky horizon chart without a time cursor. ${mask ? 'Terrain horizon mask shown.' : 'Horizon mask unavailable (outside coverage).'}${mock ? ' Mock data.' : ''}`;

  // Keep ≥ 18 px between 12 px elevation labels, however short the strip is.
  const step = [5, 10, 15, 20, 30].find((s) => (s / (hi - lo)) * plotH >= 18) ?? 30;
  const yTicks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) yTicks.push(v);
  const azStep = plotW > 900 ? 15 : plotW > 520 ? 30 : 45;
  const azTicks: number[] = [];
  for (let a = 0; a <= 360; a += azStep) azTicks.push(a);
  const cardinal: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW', 360: 'N' };

  const path = (run: readonly Pt[]) => run.map(([a, e], i) => `${i ? 'L' : 'M'}${x(a).toFixed(1)},${y(e).toFixed(1)}`).join('');
  const marker = (kind: 'sun' | 'earth', az: number, el: number, visible: boolean | null) => {
    const cx = x(az);
    const cy = y(el);
    const color = kind === 'sun' ? 'var(--sh-sun)' : 'var(--sh-earth)';
    const rightSide = cx > M.left + plotW - 110;
    const labelY = kind === 'sun' ? cy - 9 : cy + 15;
    return (
      <g key={kind}>
        {visible === true && <circle cx={cx} cy={cy} r={kind === 'sun' ? 11 : 9} fill={`url(#sh-glow-${kind})`} />}
        <circle cx={cx} cy={cy} r={kind === 'sun' ? 5 : 4.5} fill={visible === true ? color : 'var(--sh-bg, #070a0e)'} stroke={color} strokeWidth={1.8} strokeDasharray={visible === null ? '2 2' : undefined} />
        <text x={cx + (rightSide ? -10 : 10)} y={labelY} fill={color} fontSize={12} fontWeight={600} textAnchor={rightSide ? 'end' : 'start'} paintOrder="stroke" stroke="rgba(0,0,0,0.6)" strokeWidth={3}>
          {kind === 'sun' ? 'Sun' : 'Earth'} {formatSigned(el)}
        </text>
      </g>
    );
  };

  return (
    <figure className="sky-horizon">
      <div ref={plotRef} className="sky-horizon__plot">
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="sky-horizon__svg">
          <title>Sun and Earth azimuth/elevation against the terrain horizon</title>
          <desc>{summary}</desc>
          <defs>
            <clipPath id="sh-plot"><rect x={M.left} y={M.top} width={plotW} height={plotH} /></clipPath>
            <linearGradient id="sh-terrain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5c6773" stopOpacity="0.55" />
              <stop offset="1" stopColor="#2a323b" stopOpacity="0.25" />
            </linearGradient>
            <radialGradient id="sh-glow-sun"><stop offset="0" stopColor="var(--sh-sun)" stopOpacity="0.55" /><stop offset="1" stopColor="var(--sh-sun)" stopOpacity="0" /></radialGradient>
            <radialGradient id="sh-glow-earth"><stop offset="0" stopColor="var(--sh-earth)" stopOpacity="0.5" /><stop offset="1" stopColor="var(--sh-earth)" stopOpacity="0" /></radialGradient>
          </defs>
          {yTicks.map((v) => (
            <g key={'y' + v}>
              <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} stroke={v === 0 ? 'rgba(255,255,255,0.28)' : 'var(--sh-grid)'} strokeDasharray={v === 0 ? '4 4' : undefined} />
              <text x={M.left - 6} y={y(v) + 4} fill="var(--sh-muted)" fontSize={12} textAnchor="end">{v > 0 ? '+' : ''}{v}°</text>
            </g>
          ))}
          {azTicks.map((a) => (
            <g key={'a' + a}>
              <line x1={x(a)} x2={x(a)} y1={M.top} y2={M.top + plotH} stroke="var(--sh-grid)" />
              <text x={x(a)} y={H - 5} fill={cardinal[a] ? 'var(--sh-text)' : 'var(--sh-muted)'} fontSize={12} fontWeight={cardinal[a] && cardinal[a]!.length === 1 ? 700 : 500} textAnchor={a === 0 ? 'start' : a === 360 ? 'end' : 'middle'}>{cardinal[a] ?? a + '°'}</text>
            </g>
          ))}
          <g clipPath="url(#sh-plot)">
            {maskPath && <path d={maskPath.area} fill="url(#sh-terrain)" />}
            {maskPath && <path d={maskPath.ridge} fill="none" stroke="#b9c4cd" strokeWidth={1.2} strokeLinejoin="round" />}
            {tracks && (['sun', 'earth'] as const).map((kind) => tracks[kind].map((run, i) => (
              <path key={kind + i} d={path(run)} fill="none" stroke={kind === 'sun' ? 'var(--sh-sun)' : 'var(--sh-earth)'} strokeWidth={run[0]?.[2] === true ? 2 : 1.3} strokeOpacity={run[0]?.[2] === true ? 1 : 0.4} strokeDasharray={run[0]?.[2] === null ? '3 3' : undefined} strokeLinecap="round" />
            )))}
          </g>
          {cursor && marker('sun', cursor.sunAz, cursor.sunEl, cursor.sunVisible)}
          {cursor && marker('earth', cursor.earthAz, cursor.earthEl, cursor.earthVisible)}
          {!mask && <text x={M.left + plotW / 2} y={M.top + plotH / 2} fill="var(--sh-mock)" fontSize={12} textAnchor="middle">Horizon mask unavailable (outside coverage)</text>}
          {mock && <text x={M.left + plotW - 6} y={M.top + 13} fill="var(--sh-mock)" fontSize={12} fontWeight={700} textAnchor="end" letterSpacing="0.04em">MOCK DATA</text>}
        </svg>
      </div>
      <figcaption className="sky-horizon__caption" title={summary + ' Bright track = body centre above terrain horizon; not power or radio-link performance.'}>
        {cursor ? (
          <>
            <span><strong style={{ color: 'var(--sh-sun)' }}>Sun</strong> az {cursor.sunAz.toFixed(1)}° el {formatSigned(cursor.sunEl)} · {cursor.sunMask === null ? 'no mask' : `mask ${formatSigned(cursor.sunMask)}`} · {stateWord(cursor.sunVisible)}</span>
            <span><strong style={{ color: 'var(--sh-earth)' }}>Earth</strong> az {cursor.earthAz.toFixed(1)}° el {formatSigned(cursor.earthEl)} · {cursor.earthMask === null ? 'no mask' : `mask ${formatSigned(cursor.earthMask)}`} · {stateWord(cursor.earthVisible)}</span>
            <span>Observer +{observerHeightM} m · bright track = centre above terrain horizon (not power or radio-link performance)</span>
          </>
        ) : 'No time cursor selected.'}
      </figcaption>
    </figure>
  );
}
