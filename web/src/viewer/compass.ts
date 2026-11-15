export interface CompassMarker { azDeg: number; color: string; label: string; hidden: boolean | null }

const NAMES: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };

/** Signed smallest difference a − b in degrees, in (−180, 180]. */
function deltaDeg(a: number, b: number): number {
  const d = ((a - b) % 360 + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/**
 * Heading tape across the top of the surface view. Azimuths map to screen x with the
 * perspective projection of a horizontal direction (exact at zero pitch), so a tick sits
 * above the terrain direction it names. Ticks fade toward the edges; the centre shows the
 * current heading.
 */
export function drawCompass(canvas: HTMLCanvasElement, headingDeg: number, horizontalFovRad: number, markers: readonly CompassMarker[], accent: string, fontFamily = 'system-ui, sans-serif'): void {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, width, height);
  const half = Math.tan(horizontalFovRad / 2);
  const xOf = (azDeg: number): number | null => {
    const d = (deltaDeg(azDeg, headingDeg) * Math.PI) / 180;
    if (Math.abs(d) >= Math.PI / 2 - 0.01) return null;
    const x = width / 2 + (Math.tan(d) / half) * (width / 2);
    return x < -40 || x > width + 40 ? null : x;
  };
  const fade = (x: number) => Math.max(0, 1 - Math.pow(Math.abs(x - width / 2) / (width / 2), 3));
  const base = 30;
  g.textAlign = 'center';
  g.lineCap = 'round';
  for (let az = 0; az < 360; az += 5) {
    const x = xOf(az);
    if (x === null) continue;
    const alpha = fade(x);
    if (alpha <= 0.02) continue;
    const major = az % 45 === 0;
    const mid = az % 15 === 0;
    g.strokeStyle = `rgba(236, 242, 247, ${(major ? 0.9 : mid ? 0.55 : 0.28) * alpha})`;
    g.lineWidth = major ? 1.5 : 1;
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x, base - (major ? 9 : mid ? 6 : 3));
    g.stroke();
    if (major || mid) {
      g.fillStyle = `rgba(236, 242, 247, ${(major ? 0.95 : 0.5) * alpha})`;
      g.font = `${major ? 600 : 500} 12px ${fontFamily}`;
      g.fillText(major ? NAMES[az] ?? String(az) : String(az), x, base - 13);
    }
  }
  for (const marker of markers) {
    const x = xOf(marker.azDeg);
    if (x === null) continue;
    g.fillStyle = marker.color;
    g.strokeStyle = marker.color;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(x, base + 7, 3.5, 0, Math.PI * 2);
    if (marker.hidden === false) g.fill(); else g.stroke();
    g.font = `600 12px ${fontFamily}`;
    g.fillText(marker.label, x, base + 20);
  }
  // Centre index + heading value.
  const value = (((Math.round(headingDeg) % 360) + 360) % 360).toString().padStart(3, '0') + '°';
  g.font = `600 12px ${fontFamily}`;
  const w = g.measureText(value).width + 12;
  g.fillStyle = accent;
  g.beginPath();
  g.roundRect(width / 2 - w / 2, 0, w, 17, 8.5);
  g.fill();
  g.fillStyle = '#04110f';
  g.fillText(value, width / 2, 13);
  g.strokeStyle = accent;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(width / 2, 15);
  g.lineTo(width / 2, base + 2);
  g.stroke();
}
