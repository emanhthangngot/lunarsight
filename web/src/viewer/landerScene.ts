import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Line,
  LineDashedMaterial,
  Material,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  Texture,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { bodyDirectionLocal } from './localFrame';
import { visibleToState, type VisibilityState } from './skyGeometry';
import type { BodyDirection } from './types';

/**
 * Illustrative lander and landing showcase (display aid, not a trajectory simulation).
 *
 * The parked lander, descent path, flame and dust are decorative. The Sun ray and Earth link
 * are the only parts that carry meaning: their clear / blocked / unknown state is exactly the
 * `visible` flag supplied by the App from the horizon-mask analysis. Nothing here is computed
 * from the rendered mesh, and nothing here feeds back into the analysis.
 */

export type LandingPhase = 'parked' | 'descent' | 'link';

/** Descent timing and shape (illustrative). */
const DESCENT_S = 11;
const SETTLE_S = 1.2;
/** The link animation settles to a still frame after this long, so no loop runs unattended. */
const LINK_ANIMATION_S = 45;
const START_ALTITUDE_M = 140;
const START_LATERAL_M = 60;
const START_TILT_RAD = (16 * Math.PI) / 180;
/** Showcase camera (Site overview): a low tripod near the touchdown point. */
const CAMERA_DISTANCE_M = 34;
const CAMERA_HEIGHT_M = 2.6;
const CAMERA_SIDE_OFFSET_RAD = (20 * Math.PI) / 180;
const CAMERA_FOV_DEG = 50;
const CAMERA_TELE_FOV_DEG = 16;
const CAMERA_EASE_S = 2.2;
/** Rough centre of the lander body above its footpad plane, metres. */
const BODY_CENTRE_M = 2;
const MAX_GROUND_TILT_RAD = (12 * Math.PI) / 180;

const DUST_COUNT = 480;
const DUST_LIFE_S = 1.2;
const DUST_ALTITUDE_M = 20;
const ENGINE_LIGHT_CD = 650;

const RAY_LENGTH_M = 600;
const RAY_RADIUS_M = 1.1;
const BLOCKED_LENGTH_M = 60;
const LABEL_DISTANCE_M = 7;
const PULSE_COUNT = 6;
const PULSE_SPAN_M = 220;
const PULSE_SPEED_MPS = 70;
const RING_COUNT = 9;
const RING_SPAN_M = 270;
const RING_SPEED_MPS = 35;

const UP = new Vector3(0, 1, 0);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
function smooth(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function radialTexture(stops: [number, string][]): CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    g.fillStyle = gradient;
    g.fillRect(0, 0, size, size);
  }
  return new CanvasTexture(canvas);
}

export interface GroundSample { y: number; normal: Vector3 | null }

export interface LandingStart {
  reducedMotion: boolean;
  sun: BodyDirection | null;
  earth: BodyDirection | null;
  /** Rendered-ground height at a local (x, z); null when the footprint has no surface there. */
  groundAt(x: number, z: number): GroundSample | null;
}

export interface ShowcaseView {
  position: Vector3;
  target: Vector3;
  fovDeg: number;
  /** True while the showcase drives the camera; false once the user may orbit freely. */
  scripted: boolean;
}

export interface LanderScene {
  /** Add to the scene once. */
  group: Group;
  readonly loaded: boolean;
  readonly phase: LandingPhase;
  /** Parked footpad-plane position in the local frame. */
  readonly home: Vector3;
  /** Current body centre (follows the descent). */
  readonly bodyCentre: Vector3;
  /** Showcase camera for Site overview; meaningful while `phase !== 'parked'`. */
  readonly view: ShowcaseView;
  place(position: Vector3, groundNormal: Vector3 | null): void;
  setVisible(visible: boolean): void;
  /** Uniform display scale of the parked lander (1 = true size). */
  setDisplayScale(scale: number): void;
  /** Sun/Earth at the time cursor; drives the ray and link states. */
  setBodies(sun: BodyDirection | null, earth: BodyDirection | null): void;
  start(options: LandingStart): void;
  /** Jump straight to the landed state with the links shown. */
  skip(): void;
  /** Back to the parked lander with every showcase effect hidden. */
  stop(): void;
  /** Advances the showcase; returns true while another frame is needed. */
  update(nowMs: number): boolean;
  dispose(): void;
}

interface BeamParts {
  group: Group;
  label: CSS2DObject;
  text: HTMLSpanElement;
  dashed: Line;
  dashedMaterial: LineDashedMaterial;
  state: VisibilityState | 'none';
  direction: Vector3;
}

function createLabel(body: 'sun' | 'earth'): { label: CSS2DObject; text: HTMLSpanElement } {
  const element = document.createElement('div');
  element.className = 'lunar-viewer__link-tag';
  element.dataset.body = body;
  const text = document.createElement('span');
  element.append(text);
  const label = new CSS2DObject(element);
  // Different distances keep the two tags apart when the bodies lie in similar directions.
  label.position.set(0, body === 'sun' ? LABEL_DISTANCE_M : LABEL_DISTANCE_M * 1.8, 0);
  label.center.set(0.5, body === 'sun' ? 1.7 : -0.7);
  label.visible = false;
  return { label, text };
}

function dashedLine(color: string): { line: Line; material: LineDashedMaterial } {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([0, 0, 0, 0, BLOCKED_LENGTH_M, 0]), 3));
  const material = new LineDashedMaterial({ color, dashSize: 2, gapSize: 1.4, transparent: true, opacity: 0.9, depthWrite: false });
  const line = new Line(geometry, material);
  line.computeLineDistances();
  line.frustumCulled = false;
  return { line, material };
}

const SUN_TEXT: Record<VisibilityState, string> = {
  visible: 'Sun ray · clear above terrain horizon',
  hidden: '✕ Sun ray · blocked by terrain horizon',
  unknown: '? Sun ray · visibility unknown',
};
const EARTH_TEXT: Record<VisibilityState, string> = {
  visible: 'Earth link · clear above terrain horizon',
  hidden: '✕ Earth link · blocked by terrain horizon',
  unknown: '? Earth link · visibility unknown',
};

export function createLanderScene(options: {
  modelUrl: string;
  colors: { sun: string; earth: string };
  onLoaded(): void;
  onError(reason: unknown): void;
  onPhase(phase: LandingPhase): void;
}): LanderScene {
  const { colors } = options;
  const group = new Group();
  group.name = 'lander-showcase';
  group.visible = false;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(item: T): T => { disposables.push(item); return item; };

  // Craft: the model plus engine effects; moves during the descent.
  const craft = new Group();
  group.add(craft);
  const engine = new Group();
  engine.position.set(0, 0.6, 0);
  craft.add(engine);
  const flameGeometry = track(new ConeGeometry(1, 1, 18, 1, true).rotateX(Math.PI).translate(0, -0.5, 0));
  const flameOuterMaterial = track(new MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const flameInnerMaterial = track(new MeshBasicMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.9, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const flameOuter = new Mesh(flameGeometry, flameOuterMaterial);
  const flameInner = new Mesh(flameGeometry, flameInnerMaterial);
  const flame = new Group();
  flame.add(flameOuter, flameInner);
  flame.visible = false;
  engine.add(flame);
  // Always present (intensity 0 when idle) so the light count, and so every shader, is stable.
  const engineLight = new PointLight(0xffb070, 0, 90, 2);
  engineLight.position.set(0, -1.2, 0);
  engine.add(engineLight);

  // Soft contact shadow under the parked lander (the Sun shadow map is too coarse at this size).
  const contactTexture = track(radialTexture([[0, 'rgba(0,0,0,0.62)'], [0.55, 'rgba(0,0,0,0.34)'], [1, 'rgba(0,0,0,0)']]));
  const contactGeometry = track(new CircleGeometry(3.4, 32).rotateX(-Math.PI / 2));
  const contactMaterial = track(new MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false }));
  const contact = new Mesh(contactGeometry, contactMaterial);
  group.add(contact);

  // Dust sheet thrown outward at touchdown: fixed particle set, positions updated in place.
  const dotTexture = track(radialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]));
  const dustPositions = new BufferAttribute(new Float32Array(DUST_COUNT * 3), 3);
  const dustColors = new BufferAttribute(new Float32Array(DUST_COUNT * 3), 3);
  const dustSeeds = new Float32Array(DUST_COUNT * 4);
  let seed = 11;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < DUST_COUNT; i++) {
    dustSeeds[i * 4] = random() * Math.PI * 2;
    dustSeeds[i * 4 + 1] = 4 + random() * 10;
    dustSeeds[i * 4 + 2] = (2 + random() * 7) * (Math.PI / 180);
    dustSeeds[i * 4 + 3] = random();
  }
  const dustGeometry = track(new BufferGeometry());
  dustGeometry.setAttribute('position', dustPositions);
  dustGeometry.setAttribute('color', dustColors);
  const dustMaterial = track(new PointsMaterial({ size: 0.55, sizeAttenuation: true, map: dotTexture, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const dust = new Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  dust.visible = false;
  group.add(dust);

  // Sun ray: a translucent shaft with inbound pulses, or a dashed stub when blocked/unknown.
  const shaftGeometry = track(new CylinderGeometry(1, 1, 1, 16, 1, true).translate(0, 0.5, 0));
  const sunShaftMaterial = track(new MeshBasicMaterial({ color: colors.sun, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const sunShaft = new Mesh(shaftGeometry, sunShaftMaterial);
  sunShaft.frustumCulled = false;
  const pulsePositions = new BufferAttribute(new Float32Array(PULSE_COUNT * 3), 3);
  const pulseGeometry = track(new BufferGeometry());
  pulseGeometry.setAttribute('position', pulsePositions);
  const pulseMaterial = track(new PointsMaterial({ color: colors.sun, size: 2.4, sizeAttenuation: true, map: dotTexture, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }));
  const pulses = new Points(pulseGeometry, pulseMaterial);
  pulses.frustumCulled = false;
  const sunDashed = dashedLine(colors.sun);
  track(sunDashed.line.geometry); track(sunDashed.material);
  const sunLabel = createLabel('sun');
  const sunGroup = new Group();
  sunGroup.add(sunShaft, pulses, sunDashed.line, sunLabel.label);
  sunGroup.visible = false;
  group.add(sunGroup);
  const sunBeam: BeamParts = { group: sunGroup, label: sunLabel.label, text: sunLabel.text, dashed: sunDashed.line, dashedMaterial: sunDashed.material, state: 'none', direction: new Vector3(0, 1, 0) };

  // Earth link: wavefront rings leaving the antenna, cut short when blocked.
  const ringGeometry = track(new RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2));
  const rings: { mesh: Mesh; material: MeshBasicMaterial }[] = [];
  const earthGroup = new Group();
  for (let i = 0; i < RING_COUNT; i++) {
    const material = track(new MeshBasicMaterial({ color: colors.earth, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
    const mesh = new Mesh(ringGeometry, material);
    mesh.frustumCulled = false;
    rings.push({ mesh, material });
    earthGroup.add(mesh);
  }
  const earthShaftMaterial = track(new MeshBasicMaterial({ color: colors.earth, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }));
  const earthShaft = new Mesh(shaftGeometry, earthShaftMaterial);
  earthShaft.frustumCulled = false;
  const earthDashed = dashedLine(colors.earth);
  track(earthDashed.line.geometry); track(earthDashed.material);
  const earthLabel = createLabel('earth');
  earthGroup.add(earthShaft, earthDashed.line, earthLabel.label);
  earthGroup.visible = false;
  group.add(earthGroup);
  const earthBeam: BeamParts = { group: earthGroup, label: earthLabel.label, text: earthLabel.text, dashed: earthDashed.line, dashedMaterial: earthDashed.material, state: 'none', direction: new Vector3(0, 1, 0) };

  // Model (async). Effects above exist immediately so shader/light state never changes later.
  let loaded = false;
  let disposed = false;
  let model: Object3D | null = null;
  let antenna: Object3D | null = null;
  const modelMeshes: Mesh[] = [];
  new GLTFLoader().load(options.modelUrl, (gltf) => {
    if (disposed) return;
    model = gltf.scene;
    model.traverse((object) => {
      if ((object as Mesh).isMesh) {
        const mesh = object as Mesh;
        // Honour the scale already applied: an enlarged icon must not cast a Sun shadow.
        mesh.castShadow = castingShadow;
        mesh.receiveShadow = true;
        modelMeshes.push(mesh);
      }
    });
    const nozzle = model.getObjectByName('EngineNozzle');
    antenna = model.getObjectByName('AntennaTip') ?? null;
    craft.add(model);
    if (nozzle) {
      craft.updateWorldMatrix(true, true);
      nozzle.getWorldPosition(engine.position);
      craft.worldToLocal(engine.position);
    }
    loaded = true;
    options.onLoaded();
  }, undefined, (reason) => { if (!disposed) options.onError(reason); });

  const home = new Vector3();
  const homeQuaternion = new Quaternion();
  const bodyCentre = new Vector3(0, BODY_CENTRE_M, 0);
  const view: ShowcaseView = { position: new Vector3(), target: new Vector3(), fovDeg: CAMERA_FOV_DEG, scripted: false };
  let phase: LandingPhase = 'parked';
  let displayScale = 1;
  let castingShadow = true;
  let reducedMotion = false;
  /** Timestamps are taken from the first frame after a phase begins. */
  let phaseStartMs: number | null = null;
  const approach = new Vector3(1, 0, 0);
  const tiltAxis = new Vector3(0, 0, 1);
  const linkTarget = new Vector3();
  const antennaWorld = new Vector3();
  const tilt = new Quaternion();
  const scratch = new Vector3();

  const setPhase = (next: LandingPhase) => {
    if (phase === next) return;
    phase = next;
    phaseStartMs = null;
    options.onPhase(next);
  };

  const applyBeamState = (beam: BeamParts, body: BodyDirection | null, texts: Record<VisibilityState, string>) => {
    beam.state = body ? visibleToState(body.visible) : 'none';
    if (!body) return;
    const [x, y, z] = bodyDirectionLocal(body.azDeg, body.elDeg);
    beam.direction.set(x, y, z);
    beam.group.quaternion.setFromUnitVectors(UP, beam.direction);
    const state = beam.state as VisibilityState;
    beam.text.textContent = texts[state];
    beam.label.element.dataset.state = state;
    beam.dashed.visible = state !== 'visible';
    beam.dashedMaterial.dashSize = state === 'unknown' ? 0.5 : 2;
    beam.dashedMaterial.gapSize = state === 'unknown' ? 1.6 : 1.4;
  };

  const showBeams = (shown: boolean) => {
    for (const beam of [sunBeam, earthBeam]) {
      const active = shown && beam.state !== 'none';
      beam.group.visible = active;
      beam.label.visible = active;
    }
  };

  const parkCraft = () => {
    craft.position.copy(home);
    craft.quaternion.copy(homeQuaternion);
    bodyCentre.copy(home).addScaledVector(UP, BODY_CENTRE_M);
    flame.visible = false;
    engineLight.intensity = 0;
    contactMaterial.opacity = 1;
  };

  const placeBeams = () => {
    sunGroup.position.copy(home).addScaledVector(UP, BODY_CENTRE_M);
    if (antenna) {
      group.updateWorldMatrix(true, true);
      antenna.getWorldPosition(antennaWorld);
      group.worldToLocal(antennaWorld);
      earthGroup.position.copy(antennaWorld);
    } else {
      earthGroup.position.copy(home).addScaledVector(UP, BODY_CENTRE_M + 1.5);
    }
  };

  /** Link visuals at `seconds` into the link phase; `Infinity` gives the settled still frame. */
  const drawLink = (seconds: number) => {
    const still = !Number.isFinite(seconds);
    const sunAlpha = still ? 1 : smooth(seconds / 0.8);
    const earthAlpha = still ? 1 : smooth((seconds - 0.8) / 0.8);
    const clock = still ? 0 : seconds;

    const sunClear = sunBeam.state === 'visible';
    const sunLength = sunClear ? RAY_LENGTH_M : BLOCKED_LENGTH_M;
    sunShaft.scale.set(RAY_RADIUS_M, sunLength, RAY_RADIUS_M);
    sunShaftMaterial.opacity = (sunClear ? 0.08 : sunBeam.state === 'hidden' ? 0.03 : 0) * sunAlpha;
    sunBeam.dashedMaterial.opacity = 0.9 * sunAlpha;
    pulses.visible = sunClear;
    pulseMaterial.opacity = 0.9 * sunAlpha;
    for (let i = 0; i < PULSE_COUNT; i++) {
      // Pulses travel inward, from the Sun side toward the lander.
      const travelled = ((clock * PULSE_SPEED_MPS + (i * PULSE_SPAN_M) / PULSE_COUNT) % PULSE_SPAN_M + PULSE_SPAN_M) % PULSE_SPAN_M;
      pulsePositions.setXYZ(i, 0, PULSE_SPAN_M - travelled, 0);
    }
    pulsePositions.needsUpdate = true;

    const earthClear = earthBeam.state === 'visible';
    const span = earthClear ? RING_SPAN_M : BLOCKED_LENGTH_M;
    earthShaft.scale.set(0.12, earthClear ? RAY_LENGTH_M : BLOCKED_LENGTH_M, 0.12);
    earthShaftMaterial.opacity = (earthClear ? 0.5 : 0) * earthAlpha;
    earthBeam.dashedMaterial.opacity = 0.9 * earthAlpha;
    for (let i = 0; i < RING_COUNT; i++) {
      const ring = rings[i]!;
      ring.mesh.visible = earthBeam.state === 'visible' || earthBeam.state === 'hidden';
      const spacing = RING_SPAN_M / RING_COUNT;
      const distance = ((clock * RING_SPEED_MPS + i * spacing) % RING_SPAN_M + RING_SPAN_M) % RING_SPAN_M;
      if (distance > span) { ring.material.opacity = 0; continue; }
      const radius = 0.8 + distance * 0.045;
      ring.mesh.position.set(0, distance, 0);
      ring.mesh.scale.setScalar(radius);
      const fade = earthClear ? 1 - distance / span : Math.min(1, (span - distance) / 12);
      ring.material.opacity = (earthClear ? 0.75 : 0.45) * fade * earthAlpha;
    }
  };

  const enterLink = () => {
    parkCraft();
    dust.visible = false;
    placeBeams();
    showBeams(true);
    view.target.copy(reducedMotion ? linkTarget : bodyCentre);
    view.fovDeg = CAMERA_FOV_DEG;
    view.scripted = !reducedMotion;
    setPhase('link');
    if (reducedMotion) drawLink(Infinity);
  };

  const drawDescent = (seconds: number) => {
    const u = clamp01(seconds / DESCENT_S);
    const remaining = 1 - u;
    const altitude = START_ALTITUDE_M * Math.pow(remaining, 2.4);
    const lateral = START_LATERAL_M * remaining * remaining;
    craft.position.copy(home).addScaledVector(UP, altitude).addScaledVector(approach, lateral);
    tilt.setFromAxisAngle(tiltAxis, START_TILT_RAD * Math.pow(remaining, 1.5));
    craft.quaternion.copy(homeQuaternion).premultiply(tilt);
    bodyCentre.copy(craft.position).addScaledVector(UP, BODY_CENTRE_M);

    const engineOn = (0.6 + 0.4 * smooth((u - 0.5) / 0.4)) * (1 - smooth((u - 0.985) / 0.015));
    const flicker = 0.86 + 0.1 * Math.sin(seconds * 47) + 0.06 * Math.sin(seconds * 113);
    flame.visible = engineOn > 0.01;
    flameOuter.scale.set(0.5, 5.2 * engineOn * flicker, 0.5);
    flameInner.scale.set(0.24, 3.1 * engineOn * flicker, 0.24);
    engineLight.intensity = ENGINE_LIGHT_CD * engineOn * flicker;
    contactMaterial.opacity = 1 - clamp01(altitude / 12);

    // Dust only near the ground, fading out after engine cut-off.
    const afterCutoff = clamp01((seconds - DESCENT_S) / SETTLE_S);
    const strength = seconds < DESCENT_S ? engineOn * (1 - clamp01(altitude / DUST_ALTITUDE_M)) : 0.6 * (1 - afterCutoff);
    dust.visible = strength > 0.01;
    if (dust.visible) {
      for (let i = 0; i < DUST_COUNT; i++) {
        const angle = dustSeeds[i * 4]!, speed = dustSeeds[i * 4 + 1]!, lift = dustSeeds[i * 4 + 2]!, offset = dustSeeds[i * 4 + 3]!;
        const age = ((seconds / DUST_LIFE_S + offset) % 1) * DUST_LIFE_S;
        const range = 1.5 + speed * age;
        dustPositions.setXYZ(i, Math.cos(angle) * range, 0.15 + Math.sin(lift) * range, Math.sin(angle) * range);
        const glow = 0.3 * strength * (1 - age / DUST_LIFE_S);
        dustColors.setXYZ(i, glow, glow * 0.94, glow * 0.86);
      }
      dustPositions.needsUpdate = true;
      dustColors.needsUpdate = true;
    }

    view.target.copy(bodyCentre);
    view.fovDeg = CAMERA_TELE_FOV_DEG + (CAMERA_FOV_DEG - CAMERA_TELE_FOV_DEG) * smooth(u);
  };

  return {
    group,
    get loaded() { return loaded; },
    get phase() { return phase; },
    home,
    bodyCentre,
    view,
    place(position, groundNormal) {
      home.copy(position);
      homeQuaternion.identity();
      if (groundNormal && groundNormal.y > 0) {
        const angle = Math.min(MAX_GROUND_TILT_RAD, groundNormal.angleTo(UP));
        if (angle > 1e-4) homeQuaternion.setFromAxisAngle(scratch.crossVectors(UP, groundNormal).normalize(), angle);
      }
      contact.position.copy(home).addScaledVector(UP, 0.12);
      contact.quaternion.copy(homeQuaternion);
      dust.position.copy(home);
      if (phase === 'parked') parkCraft();
    },
    setVisible(visible) {
      group.visible = visible;
    },
    setDisplayScale(scale) {
      if (scale === displayScale) return;
      displayScale = scale;
      craft.scale.setScalar(scale);
      // An enlarged icon must not throw a kilometre-scale shadow or a crater-sized contact disc.
      const cast = scale < 3;
      contact.visible = scale < 1.5;
      if (cast !== castingShadow) {
        castingShadow = cast;
        for (const mesh of modelMeshes) mesh.castShadow = cast;
      }
    },
    setBodies(sun, earth) {
      applyBeamState(sunBeam, sun, SUN_TEXT);
      applyBeamState(earthBeam, earth, EARTH_TEXT);
      if (phase === 'link') {
        showBeams(true);
        if (reducedMotion) drawLink(Infinity);
      }
    },
    start(start) {
      reducedMotion = start.reducedMotion;
      applyBeamState(sunBeam, start.sun, SUN_TEXT);
      applyBeamState(earthBeam, start.earth, EARTH_TEXT);
      showBeams(false);

      // Frame the lander with the Sun and Earth behind it: camera opposite their mean azimuth,
      // turned a little so the Sun-facing side is not seen edge-on.
      const toward = new Vector3();
      for (const body of [start.sun, start.earth]) {
        if (!body) continue;
        const [x, , z] = bodyDirectionLocal(body.azDeg, 0);
        toward.x += x; toward.z += z;
      }
      if (toward.lengthSq() < 0.04) {
        if (start.sun) { const [x, , z] = bodyDirectionLocal(start.sun.azDeg + 90, 0); toward.set(x, 0, z); } else toward.set(0, 0, -1);
      }
      toward.normalize();
      const cameraDirection = toward.clone().negate().applyAxisAngle(UP, CAMERA_SIDE_OFFSET_RAD);
      view.position.copy(home).addScaledVector(cameraDirection, CAMERA_DISTANCE_M);
      const ground = start.groundAt(view.position.x, view.position.z);
      view.position.y = Math.max(ground?.y ?? home.y, home.y - 2) + CAMERA_HEIGHT_M;
      // Aim above the craft so it sits in the lower part of the frame, clear of the status card.
      linkTarget.copy(home).addScaledVector(UP, 5).addScaledVector(toward, 2);
      // Approach across the frame, braking with the body tilted back along the path.
      approach.crossVectors(UP, cameraDirection).normalize();
      tiltAxis.crossVectors(UP, approach).normalize();
      view.scripted = true;

      craft.scale.setScalar(1);
      if (reducedMotion) { enterLink(); return; }
      setPhase('descent');
      phaseStartMs = null;
      drawDescent(0);
    },
    skip() {
      if (phase === 'descent') enterLink();
    },
    stop() {
      showBeams(false);
      dust.visible = false;
      parkCraft();
      craft.scale.setScalar(displayScale);
      view.scripted = false;
      setPhase('parked');
    },
    update(nowMs) {
      if (phase === 'parked') return false;
      if (phaseStartMs === null) phaseStartMs = nowMs;
      const seconds = (nowMs - phaseStartMs) / 1000;
      if (phase === 'descent') {
        if (seconds >= DESCENT_S + SETTLE_S) { enterLink(); return true; }
        drawDescent(seconds);
        return true;
      }
      if (reducedMotion) return false;
      drawLink(Math.min(seconds, LINK_ANIMATION_S));
      if (view.scripted) {
        const ease = smooth(seconds / CAMERA_EASE_S);
        view.target.copy(bodyCentre).lerp(linkTarget, ease);
        if (seconds >= CAMERA_EASE_S) view.scripted = false;
      }
      return seconds < LINK_ANIMATION_S;
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      for (const beam of [sunBeam, earthBeam]) beam.label.element.remove();
      for (const item of disposables) item.dispose();
      const materials = new Set<Material>();
      const textures = new Set<Texture>();
      for (const mesh of modelMeshes) {
        mesh.geometry.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(material);
      }
      for (const material of materials) {
        const map = (material as Material & { map?: Texture | null }).map;
        if (map) textures.add(map);
        material.dispose();
      }
      for (const texture of textures) texture.dispose();
    },
  };
}
