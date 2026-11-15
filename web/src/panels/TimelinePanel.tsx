import { useMemo } from 'react';
import type { Visibility } from '../analysis/visibility';
import { eventsAtCursor } from '../analysis/visibility';
import type { ScenarioResult, WorkspaceAction } from '../state/scenario';
import type { Dispatch } from 'react';
import { number, utc, visibility } from './format';
import { Pause, Play, SkipBack, SkipForward, Sunrise, Sunset } from 'lucide-react';

function VisibilityBand({ times, track, title }: { times: number[]; track: Visibility[]; title: string }) {
  const segments = useMemo(() => {
    const total = times.at(-1)! - times[0]!;
    const result: { state: Visibility; hours: number; width: number; start: number }[] = [];
    for (let i = 0; i + 1 < times.length; i++) {
      const width = 100 * (times[i + 1]! - times[i]!) / total;
      const previous = result.at(-1), state = track[i]!;
      if (previous && previous.state === state) { previous.width += width; previous.hours += (times[i + 1]! - times[i]!) / 3_600_000; }
      else result.push({ state, width, hours: (times[i + 1]! - times[i]!) / 3_600_000, start: times[i]! });
    }
    return result;
  }, [times, track]);
  return <div className="visibility-track" data-body={title.toLowerCase()}><span>{title}</span><div className="track-band" role="img" aria-label={title + ' sampled visibility: ' + segments.map((s) => visibility(s.state) + ' for ' + s.hours.toFixed(1) + ' h').join('; ')}>{segments.map((segment) => <span key={segment.start} className={'band-' + (segment.state === null ? 'unknown' : segment.state ? 'visible' : 'hidden')} style={{ width: segment.width + '%' }} title={visibility(segment.state) + ' from ' + utc(segment.start)} />)}</div></div>;
}

/** `pendingReason` names the in-flight request; controls pause while it runs and say why. */
export function TimelinePanel({ result, cursorIndex, playing, speed, pendingReason, dispatch }: {
  result: ScenarioResult | null; cursorIndex: number; playing: boolean; speed: number; pendingReason: string | null; dispatch: Dispatch<WorkspaceAction>;
}) {
  if (!result) return <section className="panel timeline-panel"><h2>Timeline</h2><p className="muted">{pendingReason ?? 'Apply a covered scenario to navigate its sampled UTC window.'}</p></section>;
  const { ephemeris, analysis } = result;
  const times = ephemeris.timesUtcMs;
  const disabled = pendingReason !== null;
  const events = eventsAtCursor(times, analysis, cursorIndex);
  const atStart = cursorIndex === 0, atEnd = cursorIndex === times.length - 1;
  const unknownMask = result.mask === null;
  function jump(index: number) { dispatch({ type: 'playing', playing: false }); dispatch({ type: 'cursor', index }); }
  const isProcessed = ephemeris.provenance.kind === 'processed';
  const noEvent = (name: string) => unknownMask ? `${name}: unknown without a horizon mask` : `No ${name.toLowerCase()} after the cursor in this window`;
  const notes = disabled
    ? [pendingReason]
    : [events.sunset === null ? noEvent('Sunset') : null, events.sunrise === null ? noEvent('Sunrise') : null, atStart ? 'At the window start' : atEnd ? 'At the window end' : null].filter((note): note is string => note !== null);
  const sunState = `Sun ${number(ephemeris.sunElDeg[cursorIndex], '°')} ${visibility(analysis.sunVisible[cursorIndex]).toLowerCase()}`;
  const earthState = `Earth ${number(ephemeris.earthElDeg[cursorIndex], '°')} ${visibility(analysis.earthVisible[cursorIndex]).toLowerCase()}`;
  return <section className="panel timeline-panel" aria-labelledby="timeline-title">
    <div className="timeline-heading"><div className="timeline-identity"><h2 id="timeline-title">Timeline <span className="tag">{result.id}</span></h2><p className="cursor-time" data-cursor-utc>{utc(times[cursorIndex])} UTC</p><p className="cursor-bodies">{sunState} · {earthState}</p></div>
      <div className="timeline-controls">
        <button className="icon-button" type="button" disabled={disabled || atStart} onClick={() => jump(cursorIndex - 1)} aria-label="Step backward" title={atStart ? 'At the window start' : 'Step backward'}><SkipBack size={17} aria-hidden="true" /></button>
        <button className="play-button" type="button" disabled={disabled} aria-pressed={playing} onClick={() => { if (!playing && atEnd) jump(0); dispatch({ type: 'playing', playing: !playing }); }}>{playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}{playing ? 'Pause' : 'Play'}</button>
        <button className="icon-button" type="button" disabled={disabled || atEnd} onClick={() => jump(cursorIndex + 1)} aria-label="Step forward" title={atEnd ? 'At the window end' : 'Step forward'}><SkipForward size={17} aria-hidden="true" /></button>
        <label className="inline-field"><select name="playbackSpeed" aria-label="Playback" title="Simulated hours per real second" value={speed} disabled={disabled} onChange={(e) => dispatch({ type: 'speed', speed: Number(e.target.value) })}>{[1, 5, 20, 60].map((s) => <option key={s} value={s}>{s}× · {s} h/s</option>)}</select></label>
        <button className="event-jump" type="button" aria-label="Next sunset" aria-describedby="timeline-notes" title={events.sunset ? 'Jump to next sunset' : noEvent('Sunset')} disabled={disabled || events.sunset === null} onClick={() => events.sunset && jump(events.sunset.index)}><Sunset size={16} aria-hidden="true" /><span>Next sunset</span></button>
        <button className="event-jump" type="button" aria-label="Next sunrise" aria-describedby="timeline-notes" title={events.sunrise ? 'Jump to next sunrise' : noEvent('Sunrise')} disabled={disabled || events.sunrise === null} onClick={() => events.sunrise && jump(events.sunrise.index)}><Sunrise size={16} aria-hidden="true" /><span>Next sunrise</span></button>
      </div>
    </div>
    <p id="timeline-notes" className="timeline-notes" role="status">{notes.join(' · ')}</p>
    <label className="scrubber-label">UTC time cursor<input name="cursorIndex" type="range" min="0" max={Math.max(0, times.length - 1)} value={cursorIndex} disabled={disabled} onChange={(e) => jump(Number(e.target.value))} aria-valuetext={utc(times[cursorIndex]) + ' UTC'} /></label>
    <div className="tracks"><VisibilityBand times={times} track={analysis.sunVisible} title="Sun" /><VisibilityBand times={times} track={analysis.earthVisible} title="Earth" /><VisibilityBand times={times} track={analysis.both} title="Both" /></div>
    <div className="timeline-extent"><span>{utc(times[0])}</span><span>{utc(times.at(-1))}</span></div>
    <details className="timeline-method"><summary>Centre visibility · ±{ephemeris.stepSeconds / 3600} h sampling</summary><p className="track-legend"><span className="legend-visible">Visible above terrain horizon ({isProcessed ? 'PGDA + Horizons' : 'mock'})</span><span className="legend-hidden">Hidden</span><span className="legend-unknown">Unknown</span> · States held until the next sample; not exact transition times.</p></details>
  </section>;
}
