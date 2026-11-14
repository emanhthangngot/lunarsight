export type IconState = 'visible' | 'hidden' | 'unknown';

const cache = new Map<string, HTMLCanvasElement>();

export function visibleToState(visible: boolean | null): IconState {
  return visible === true ? 'visible' : visible === false ? 'hidden' : 'unknown';
}

/** Canvas billboard images, so no image file or network request is needed. */
export function skyIcon(kind: 'sun' | 'earth', state: IconState): HTMLCanvasElement {
  const key = kind + ':' + state;
  const hit = cache.get(key);
  if (hit) return hit;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.translate(size / 2, size / 2);
  g.globalAlpha = state === 'visible' ? 1 : state === 'hidden' ? 0.45 : 0.7;
  if (kind === 'sun') {
    g.strokeStyle = '#ffd24a';
    g.lineWidth = 3;
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      g.beginPath();
      g.moveTo(Math.cos(a) * 17, Math.sin(a) * 17);
      g.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
      g.stroke();
    }
    g.fillStyle = '#ffb21a';
    g.beginPath();
    g.arc(0, 0, 13, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff1b0';
    g.beginPath();
    g.arc(-3, -3, 6, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = '#2b6fd6';
    g.beginPath();
    g.arc(0, 0, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#4fae6a';
    g.beginPath();
    g.ellipse(-5, -4, 7, 5, 0.5, 0, Math.PI * 2);
    g.ellipse(7, 7, 5, 4, -0.3, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#d6ecff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, 21, 0, Math.PI * 2);
    g.stroke();
  }
  if (state !== 'visible') {
    // Hidden/unknown: dashed ring so the state reads without colour.
    g.globalAlpha = 1;
    g.strokeStyle = state === 'hidden' ? '#ff6b6b' : '#c0c8d0';
    g.lineWidth = 2;
    g.setLineDash([4, 4]);
    g.beginPath();
    g.arc(0, 0, 30, 0, Math.PI * 2);
    g.stroke();
  }
  cache.set(key, canvas);
  return canvas;
}
