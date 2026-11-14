import { buildModuleUrl } from 'cesium';

/** Apparent diameters from the Moon (deg): Sun ≈ 0.533°, Earth = 2·atan(6371/384400) ≈ 1.90°. */
export const SUN_DIAMETER_DEG = 0.533;
export const EARTH_DIAMETER_DEG = 1.9;
/** Sun canvas: the disc spans 1/SUN_GLOW_SCALE of the image; the rest is glow. */
export const SUN_GLOW_SCALE = 5;
/** Earth canvas: the disc spans 1/EARTH_PAD_SCALE of the image (thin halo around it). */
export const EARTH_PAD_SCALE = 1.12;

const SIZE = 128;

let sunCanvas: HTMLCanvasElement | null = null;

export function sunImage(): HTMLCanvasElement {
  if (sunCanvas) return sunCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (g) {
    const c = SIZE / 2;
    const disc = SIZE / (2 * SUN_GLOW_SCALE);
    const glow = g.createRadialGradient(c, c, disc * 0.8, c, c, c);
    glow.addColorStop(0, 'rgba(255, 238, 200, 0.75)');
    glow.addColorStop(0.25, 'rgba(255, 214, 150, 0.22)');
    glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, SIZE, SIZE);
    const core = g.createRadialGradient(c, c, 0, c, c, disc);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.85, '#fff6df');
    core.addColorStop(1, '#ffe6b0');
    g.fillStyle = core;
    g.beginPath();
    g.arc(c, c, disc, 0, Math.PI * 2);
    g.fill();
  }
  sunCanvas = canvas;
  return canvas;
}

let earthTexture: Promise<ImageData | null> | null = null;

/** Natural Earth II level-0 tiles bundled with Cesium (served locally): decorative only. */
function loadEarthTexture(): Promise<ImageData | null> {
  earthTexture ??= Promise.all([0, 1].map(async (x) => {
    const image = new Image();
    image.src = buildModuleUrl(`Assets/Textures/NaturalEarthII/0/${x}/0.jpg`);
    await image.decode();
    return image;
  })).then(([west, east]) => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    if (!g || !west || !east) return null;
    g.drawImage(west, 0, 0, 256, 256);
    g.drawImage(east, 256, 0, 256, 256);
    return g.getImageData(0, 0, 512, 256);
  }, () => null);
  return earthTexture;
}

export const EARTH_PHASE_STEP_DEG = 3;

/**
 * Earth disc as seen from the observer. `phaseDeg` is the angle between the direction
 * from Earth to the observer and the direction to the Sun (0 = full, 180 = new).
 * The image is drawn with the sunward side up; the billboard aligns "up" with the
 * sky direction toward the Sun. Surface texture is decorative (fixed view of the
 * Atlantic); only the phase and direction follow the mock geometry.
 */
export async function earthImage(phaseDeg: number): Promise<HTMLCanvasElement> {
  const texture = await loadEarthTexture();
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  const image = g.createImageData(SIZE, SIZE);
  const phase = (phaseDeg * Math.PI) / 180;
  // Sun direction in disc coordinates: y = up (sunward), z = toward the viewer.
  const sunY = Math.sin(phase);
  const sunZ = Math.cos(phase);
  const radius = SIZE / (2 * EARTH_PAD_SCALE);
  const c = SIZE / 2;
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      const x = (px + 0.5 - c) / radius;
      const y = (c - py - 0.5) / radius;
      const r2 = x * x + y * y;
      const o = (py * SIZE + px) * 4;
      if (r2 > 1) {
        // Thin atmospheric halo, only on the lit limb.
        const d = Math.sqrt(r2) - 1;
        const halo = Math.max(0, 1 - d / (EARTH_PAD_SCALE - 1)) * Math.max(0, y * sunY + 0.2);
        image.data[o] = 90; image.data[o + 1] = 160; image.data[o + 2] = 255; image.data[o + 3] = Math.round(140 * halo);
        continue;
      }
      const z = Math.sqrt(1 - r2);
      const lit = Math.max(0, y * sunY + z * sunZ);
      let red = 40, green = 90, blue = 170;
      if (texture) {
        const lat = Math.asin(y);
        const lon = Math.atan2(x, z) - 0.5;
        const tx = Math.floor(((lon / (2 * Math.PI) + 0.5 + 1) % 1) * texture.width);
        const ty = Math.floor((0.5 - lat / Math.PI) * (texture.height - 1));
        const t = (ty * texture.width + tx) * 4;
        red = texture.data[t] ?? red; green = texture.data[t + 1] ?? green; blue = texture.data[t + 2] ?? blue;
      }
      // Smooth terminator; night side stays faintly visible as a disc outline.
      const light = 0.05 + 0.95 * Math.min(1, lit * 3);
      const edge = Math.min(1, (1 - Math.sqrt(r2)) * radius);
      image.data[o] = red * light; image.data[o + 1] = green * light; image.data[o + 2] = blue * light;
      image.data[o + 3] = Math.round(255 * edge);
    }
  }
  g.putImageData(image, 0, 0);
  return canvas;
}
