import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three';
import type { BodyDirection } from './types';
import { angularSizeM, bodyDirectionLocal } from './localFrame';
import { EARTH_DIAMETER_DEG, earthCanvas, SUN_DIAMETER_DEG, SUN_GLOW_SCALE, sunImage } from './skyBodies';

/** Sky bodies sit this far from the camera (beyond the ≤150 km terrain footprint). */
export const SKY_DISTANCE_M = 500_000;
const STAR_DISTANCE_M = 900_000;
const STAR_COUNT = 1800;
/** Orbital-mode direction lines from the site, metres. */
const DIRECTION_LINE_M = 12_000;

const EARTH_VERTEX = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const EARTH_FRAGMENT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map;
uniform vec3 sunDirection;
uniform float sunAvailable;
varying vec3 vNormalW;
varying vec2 vUv;
void main() {
  #include <logdepthbuf_fragment>
  vec3 albedo = texture2D(map, vUv).rgb;
  // Lit by the same Sun direction as the terrain: the phase follows the supplied directions.
  float lit = mix(1.0, smoothstep(-0.08, 0.12, dot(normalize(vNormalW), sunDirection)), sunAvailable);
  gl_FragColor = vec4(albedo * (0.05 + 0.95 * lit), 1.0);
  #include <colorspace_fragment>
}
`;

export interface SkyScene {
  /** Positioned at the camera every frame so directions stay exact (no parallax). */
  group: Group;
  /** Positioned at the site origin; orbital mode only. */
  directionLines: Group;
  sun: Sprite;
  earth: Mesh;
  update(sun: BodyDirection | null, earth: BodyDirection | null): void;
  setDirectionLinesVisible(visible: boolean): void;
  /** Display aid: draws the Sun disc `scale` times its true angular size (1 = true size). */
  setSunDisplayScale(scale: number): void;
  dispose(): void;
}

interface DirectionLine { line: Line; positions: BufferAttribute; material: LineBasicMaterial }

function directionLine(color: string): DirectionLine {
  const positions = new BufferAttribute(new Float32Array(6), 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', positions);
  const material = new LineBasicMaterial({ color, transparent: true, opacity: 0.75 });
  const line = new Line(geometry, material);
  line.frustumCulled = false;
  return { line, positions, material };
}

export function createSkyScene(colors: { sun: string; earth: string }): SkyScene {
  const group = new Group();
  group.name = 'sky';

  // Decorative starfield: fixed seeded directions (not a star catalogue, not aligned to the lunar sky).
  const starPositions = new Float32Array(STAR_COUNT * 3);
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < STAR_COUNT; i++) {
    const z = random() * 2 - 1, t = random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    starPositions.set([r * Math.cos(t) * STAR_DISTANCE_M, z * STAR_DISTANCE_M, r * Math.sin(t) * STAR_DISTANCE_M], i * 3);
  }
  const starGeometry = new BufferGeometry();
  starGeometry.setAttribute('position', new BufferAttribute(starPositions, 3));
  const starMaterial = new PointsMaterial({ color: 0xc9d3e0, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false });
  const stars = new Points(starGeometry, starMaterial);
  stars.frustumCulled = false;
  group.add(stars);

  // Sun: depth-tested sprite at true angular diameter (glow is decorative padding).
  const sunTexture = new CanvasTexture(sunImage());
  sunTexture.colorSpace = SRGBColorSpace;
  const sunMaterial = new SpriteMaterial({ map: sunTexture, depthWrite: false, blending: AdditiveBlending, transparent: true });
  const sun = new Sprite(sunMaterial);
  const sunSize = angularSizeM(SKY_DISTANCE_M, SUN_DIAMETER_DEG) * SUN_GLOW_SCALE;
  sun.scale.set(sunSize, sunSize, 1);
  group.add(sun);

  // Earth: sphere at true angular diameter, decorative texture, lit from the supplied Sun direction.
  const earthTexture = new CanvasTexture(earthCanvas());
  earthTexture.colorSpace = SRGBColorSpace;
  const sunDirection = new Vector3(0, 1, 0);
  const earthMaterial = new ShaderMaterial({
    uniforms: { map: { value: earthTexture }, sunDirection: { value: sunDirection }, sunAvailable: { value: 0 } },
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
  });
  const earthGeometry = new SphereGeometry(angularSizeM(SKY_DISTANCE_M, EARTH_DIAMETER_DEG) / 2, 48, 24);
  const earth = new Mesh(earthGeometry, earthMaterial);
  group.add(earth);

  const directionLines = new Group();
  const sunLine = directionLine(colors.sun);
  const earthLine = directionLine(colors.earth);
  directionLines.add(sunLine.line, earthLine.line);

  const place = (object: Sprite | Mesh, body: BodyDirection | null) => {
    object.visible = body !== null;
    if (!body) return;
    const [x, y, z] = bodyDirectionLocal(body.azDeg, body.elDeg);
    object.position.set(x * SKY_DISTANCE_M, y * SKY_DISTANCE_M, z * SKY_DISTANCE_M);
  };
  const placeLine = (entry: DirectionLine, body: BodyDirection | null) => {
    entry.line.visible = body !== null;
    if (!body) return;
    const [x, y, z] = bodyDirectionLocal(body.azDeg, body.elDeg);
    entry.positions.setXYZ(1, x * DIRECTION_LINE_M, y * DIRECTION_LINE_M, z * DIRECTION_LINE_M);
    entry.positions.needsUpdate = true;
  };

  return {
    group,
    directionLines,
    sun,
    earth,
    update(sunBody, earthBody) {
      place(sun, sunBody);
      place(earth, earthBody);
      placeLine(sunLine, sunBody);
      placeLine(earthLine, earthBody);
      if (sunBody) {
        const [x, y, z] = bodyDirectionLocal(sunBody.azDeg, sunBody.elDeg);
        sunDirection.set(x, y, z);
      }
      earthMaterial.uniforms.sunAvailable!.value = sunBody ? 1 : 0;
    },
    setDirectionLinesVisible(visible) {
      directionLines.visible = visible;
    },
    setSunDisplayScale(scale) {
      sun.scale.set(sunSize * scale, sunSize * scale, 1);
    },
    dispose() {
      group.removeFromParent();
      directionLines.removeFromParent();
      starGeometry.dispose();
      starMaterial.dispose();
      sunTexture.dispose();
      sunMaterial.dispose();
      earthTexture.dispose();
      earthMaterial.dispose();
      earthGeometry.dispose();
      for (const entry of [sunLine, earthLine]) { entry.line.geometry.dispose(); entry.material.dispose(); }
    },
  };
}
