import { Material } from 'cesium';

/** Low → high colour stops of the elevation ramp; mirrored in the HTML legend. */
export const RAMP_STOPS = ['#20284f', '#3b6f8e', '#7fae8a', '#d9c98a', '#f4efe6'] as const;

export type SurfaceMode = 'realistic' | 'elevation';

interface SurfaceUniforms {
  minHeight: number;
  maxHeight: number;
  mode: number;
  detailLevel: number;
}

/*
 * Globe material for the procedural mock terrain.
 *
 * realistic: regolith look. Albedo variation and sub-mesh craters are procedural
 *   *decoration* (bump-mapped, they do not change the geometry used for horizons
 *   or shadows). Lunar-like Lommel-Seeliger photometry lit by the scene light,
 *   which is the Sun direction at the selected site.
 * elevation: data view: colour ramp of height above the sphere, hillshade, 500 m contours.
 *
 * Height exactly 0 m encodes "no data" (outside coverage) and is drawn flat dark grey.
 * Noise runs in Moon-fixed x/y metres: near the south pole that plane is close to the
 * surface, continuous across tiles/LODs, and small enough for float precision.
 */
const SOURCE = `
float lsHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 lsHash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float lsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lsHash(i), lsHash(i + vec2(1.0, 0.0)), u.x),
             mix(lsHash(i + vec2(0.0, 1.0)), lsHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float lsFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * lsNoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return s;
}
// One octave of simple craters: bowl (depth 0.12 r) + raised rim (0.04 r), in metres.
// Size distribution is skewed toward small craters (like real crater populations) so the
// cell grid does not read as a regular pattern; rim accumulates a fresh-ejecta brightness term.
// Radius ≤ 0.32 cell and influence ≤ 1.45 r keep every crater within 0.47 cell of its centre,
// so only the 2×2 cells nearest the point can contribute (4 lookups instead of 9).
float lsCraters(vec2 p, float cell, float density, inout float rim) {
  vec2 q0 = p / cell;
  vec2 c = floor(q0 - 0.5);
  float h = 0.0;
  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 g = c + vec2(float(i), float(j));
      if (lsHash(g + 7.7) > density) continue;
      vec2 center = (g + 0.15 + 0.7 * lsHash2(g)) * cell;
      float s = lsHash(g + 3.1);
      float radius = cell * (0.05 + 0.27 * s * s * s);
      float q = length(p - center) / radius;
      if (q > 1.45) continue;
      float bowl = q < 1.0 ? (q * q - 1.0) * 0.12 : 0.0;
      float k = (q - 1.0) / 0.22;
      float ring = exp(-k * k);
      h += radius * (bowl + 0.04 * ring);
      rim += ring * lsHash(g + 1.3) * 0.6;
    }
  }
  return h;
}

// Rotate each octave's domain so cell grids never line up.
vec2 lsRot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

vec3 lsRamp(float t) {
  vec3 c0 = vec3(0.125, 0.157, 0.310);
  vec3 c1 = vec3(0.231, 0.435, 0.557);
  vec3 c2 = vec3(0.498, 0.682, 0.541);
  vec3 c3 = vec3(0.851, 0.788, 0.541);
  vec3 c4 = vec3(0.957, 0.937, 0.902);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

czm_material czm_getMaterial(czm_materialInput materialInput)
{
  czm_material material = czm_getDefaultMaterial(materialInput);
  float h = materialInput.height;
  material.alpha = 1.0;
  if (abs(h) < 0.001) {
    material.diffuse = vec3(0.07, 0.07, 0.08);
    return material;
  }

  vec3 posEC = -materialInput.positionToEyeEC;
  vec3 view = normalize(materialInput.positionToEyeEC);
  vec3 dpdx = dFdx(posEC);
  vec3 dpdy = dFdy(posEC);
  // Smooth per-vertex normal from the terrain provider (central differences of the heights).
  vec3 n = normalize(materialInput.normalEC);
  vec3 light = normalize(czm_lightDirectionEC);

  if (mode > 0.5) {
    float t = clamp((h - minHeight) / (maxHeight - minHeight), 0.0, 1.0);
    float lit = 0.30 + 0.70 * max(dot(n, light), 0.0);
    float c = h / 500.0;
    float line = 1.0 - clamp(abs(fract(c - 0.5) - 0.5) / max(fwidth(c), 1e-5), 0.0, 1.0);
    vec3 color = lsRamp(t) * lit;
    material.diffuse = mix(color, color * 0.55, line * 0.6);
    return material;
  }

  // Moon-fixed position (m); x/y form a near-planar domain around the south pole.
  vec2 p = (czm_inverseView * vec4(posEC, 1.0)).xy;
  float footprint = max(length(fwidth(p)), 1e-3);
  float rim = 0.0;
  float detail = 0.0;
  // Fade each octave out before it aliases (cell must span several pixels); skip work at 0.
  float w1 = smoothstep(200.0, 50.0, footprint);
  float w2 = smoothstep(60.0, 12.0, footprint);
  float w3 = smoothstep(12.0, 2.5, footprint);
  float w4 = smoothstep(8.0, 1.0, footprint);
  if (detailLevel > 0.5) {
    if (w1 > 0.0) detail += w1 * 0.6 * lsCraters(lsRot(p, 0.4), 1400.0, 0.35, rim);
    if (w2 > 0.0) detail += w2 * lsCraters(lsRot(p, 1.3), 260.0, 0.5, rim);
    if (w3 > 0.0) detail += w3 * lsCraters(lsRot(p, 2.2), 48.0, 0.55, rim);
    if (w4 > 0.0) detail += w4 * (lsNoise(p / 9.0) + 0.5 * lsNoise(p / 4.3) - 0.75) * 1.6;
  }

  // Screen-space bump mapping (Mikkelsen 2010) of the decorative detail height.
  float dhdx = dFdx(detail);
  float dhdy = dFdy(detail);
  vec3 r1 = cross(dpdy, n);
  vec3 r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhdx * r1 + dhdy * r2);
  vec3 nb = normalize(abs(det) * n - grad);

  // Regolith albedo: neutral grey with a faint warm tint, broad mottling, bright fresh rims.
  float mottle = lsFbm(p / 2600.0);
  float albedo = 0.13 * (0.85 + 0.3 * mottle) + 0.03 * clamp(rim, 0.0, 1.0);
  vec3 tint = vec3(1.0, 0.975, 0.94);

  // Wrapped incidence: at a ~1° Sun the mock terrain's small periodic ripples would flip
  // between lit and unlit and read as streaks. Wrapping by ~6° keeps relief cues while cast
  // shadows (shadow map) stay hard and dark.
  float wrap = 0.1;
  float cosI = (dot(nb, light) + wrap) / (1.0 + wrap);
  float cosE = max(dot(nb, view), 0.05);
  // Lommel-Seeliger (airless regolith) blended with a little Lambert for relief cues.
  float ls = cosI > 0.0 ? 2.0 * cosI / (cosI + cosE) : 0.0;
  float radiance = mix(ls, max(cosI, 0.0), 0.3);
  // Exposure + Reinhard tone map: grazing polar light stays readable without clipping rims.
  float earthshine = 0.05;
  vec3 linear = tint * albedo * (radiance * 9.0 + earthshine);
  material.diffuse = 1.35 * linear / (1.0 + linear);
  return material;
}
`;

/** `detail` = decorative crater/bump texture (High quality); off in Balanced to save fill rate. */
export function createSurfaceMaterial(range: { minM: number; maxM: number }, mode: SurfaceMode, detail: boolean): Material {
  return new Material({
    fabric: {
      type: 'LunarSurface',
      uniforms: { minHeight: range.minM, maxHeight: range.maxM, mode: mode === 'elevation' ? 1 : 0, detailLevel: detail ? 1 : 0 },
      source: SOURCE,
    },
    translucent: false,
  });
}

export function updateSurfaceMaterial(material: Material, range: { minM: number; maxM: number }, mode: SurfaceMode, detail: boolean): void {
  const uniforms = material.uniforms as SurfaceUniforms;
  uniforms.minHeight = range.minM;
  uniforms.maxHeight = range.maxM;
  uniforms.mode = mode === 'elevation' ? 1 : 0;
  uniforms.detailLevel = detail ? 1 : 0;
}
