/** Apparent diameters from the Moon (deg): Sun ≈ 0.533°, Earth = 2·atan(6371/384400) ≈ 1.90°. */
export const SUN_DIAMETER_DEG = 0.533;
export const EARTH_DIAMETER_DEG = 1.9;
/** Sun sprite: the disc spans 1/SUN_GLOW_SCALE of the image; the rest is a decorative glow. */
export const SUN_GLOW_SCALE = 5;

const SUN_SIZE = 128;

/** Sun disc + glow, drawn locally on a canvas (no image files, no network). */
export function sunImage(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SUN_SIZE;
  canvas.height = SUN_SIZE;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const c = SUN_SIZE / 2;
  const disc = SUN_SIZE / (2 * SUN_GLOW_SCALE);
  const glow = g.createRadialGradient(c, c, disc * 0.8, c, c, c);
  glow.addColorStop(0, 'rgba(255, 238, 200, 0.75)');
  glow.addColorStop(0.25, 'rgba(255, 214, 150, 0.22)');
  glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, SUN_SIZE, SUN_SIZE);
  const core = g.createRadialGradient(c, c, 0, c, c, disc);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.85, '#fff6df');
  core.addColorStop(1, '#ffe6b0');
  g.fillStyle = core;
  g.beginPath();
  g.arc(c, c, disc, 0, Math.PI * 2);
  g.fill();
  return canvas;
}

/** Deterministic value noise in [0,1) (seeded, no Math.random). */
function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, y: number, wrapX: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (i: number, j: number) => hash(((xi + i) % wrapX + wrapX) % wrapX, yi + j);
  return (h(0, 0) * (1 - ux) + h(1, 0) * ux) * (1 - uy) + (h(0, 1) * (1 - ux) + h(1, 1) * ux) * uy;
}

/**
 * Decorative Earth texture (equirectangular): procedural oceans, land and cloud. It is not
 * a geographic map; only the Earth's sky direction and its Sun-lit side follow the mock data.
 */
export function earthCanvas(): HTMLCanvasElement {
  const width = 256, height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const image = g.createImageData(width, height);
  const cells = 8;
  for (let py = 0; py < height; py++) {
    const lat = (0.5 - (py + 0.5) / height) * Math.PI;
    const polar = Math.abs(lat) > 1.25;
    for (let px = 0; px < width; px++) {
      const u = (px / width) * cells, v = (py / height) * cells * 0.5;
      const land = 0.55 * noise(u, v, cells) + 0.3 * noise(u * 2, v * 2, cells * 2) + 0.15 * noise(u * 4, v * 4, cells * 4);
      const cloud = 0.6 * noise(u * 3 + 11, v * 3, cells * 3) + 0.4 * noise(u * 6, v * 6 + 5, cells * 6);
      let r = 28, gr = 70, b = 150;
      if (polar) { r = 225; gr = 232; b = 240; } else if (land > 0.56) { r = 96; gr = 120; b = 70; }
      const c = Math.max(0, (cloud - 0.55) * 2.2);
      const o = (py * width + px) * 4;
      image.data[o] = r + (255 - r) * Math.min(1, c);
      image.data[o + 1] = gr + (255 - gr) * Math.min(1, c);
      image.data[o + 2] = b + (255 - b) * Math.min(1, c);
      image.data[o + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}
