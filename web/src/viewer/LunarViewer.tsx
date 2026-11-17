import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { LocalTerrainMesh, TerrainMeshLoader, TerrainMeshQuality } from '../data/contract';
import { drawCompass, type CompassMarker } from './compass';
import { createLanderScene, type GroundSample, type LanderScene, type LandingPhase } from './landerScene';
import { bodyDirectionLocal, toLocal } from './localFrame';
import { createSkyScene, type SkyScene } from './skyScene';
import { describeBody, formatSigned, visibilityText, visibleToState } from './skyGeometry';
import { createTerrainMaterials, createTerrainObject, RAMP_STOPS, setTerrainMode, type SurfaceMode, type TerrainMaterials, type TerrainObject } from './terrainScene';
import type { BodyDirection, LunarViewerProps } from './types';
import './viewer.css';

export type { BodyDirection, CameraMode, LandingSummary, LunarViewerProps } from './types';

/** Vertical field of view (deg). */
const DEFAULT_FOV_DEG = 50;
const MIN_FOV_DEG = 6;
const MAX_FOV_DEG = 80;
/**
 * Orbital framing: high oblique view of the site from the Sun's azimuth. 75 km / 60° keeps
 * roughly ±30 km of local relief (crater rims, ridges) inside a typical safe area instead of
 * one smooth hillside; the site stays at the projection centre.
 */
const ORBIT_RANGE_M = 75_000;
const ORBIT_ELEVATION_DEG = 60;
const ORBIT_MIN_DISTANCE_M = 150;
const ORBIT_MAX_DISTANCE_M = 200_000;
/**
 * Near planes only clip; they never move the eye. With a logarithmic depth buffer a 2 cm near
 * plane keeps 0 m / 0.25 m observers usable without a hidden height floor.
 */
const SURFACE_NEAR_M = 0.02;
const ORBIT_NEAR_M = 1;
const CAMERA_FAR_M = 2_000_000;
/** Directional shadow camera: bounded box around the view target (surface vs orbit). */
const SURFACE_SHADOW_HALF_M = 6_000;
const ORBIT_SHADOW_HALF_MAX_M = 60_000;
const LIGHT_DISTANCE_M = 300_000;
/** Neutral overhead light when there is no time cursor (labelled in the HUD). */
const NEUTRAL_LIGHT = bodyDirectionLocal(200, 60);
const SUN_INTENSITY = 3.2;
/**
 * Display-aid inspection light (not sunlight; labelled, toggled by "Fill", casts no shadow).
 * A Sun near the polar horizon lights almost no slope (median n·l ≈ 0.02 at Ridge A), and a
 * hemispheric fill only depends on slope steepness, so neither shows landform shape. This
 * cool-tinted directional light comes from the viewer's front-left at a low elevation —
 * the cartographic hillshade convention — so slope *aspect* reads as light/dark.
 */
const INSPECT_INTENSITY = 3.2;
const INSPECT_ELEVATION_RAD = (18 * Math.PI) / 180;
const INSPECT_AZIMUTH_OFFSET_RAD = -Math.PI / 4;
/** Small uniform ambient (part of the display aid) so faces turned from both lights are not black. */
const AMBIENT_INTENSITY = 0.08;

/**
 * Lander (display aid). It stands a short walk from the observer so Ground view looks at it
 * rather than from inside it, and in Site overview it is enlarged with camera distance so it
 * stays visible; the HUD says so whenever it is not at true size.
 */
const LANDER_OFFSET_M = 30;
const LANDER_AZIMUTH_FROM_SUN_DEG = 25;
const LANDER_SCALE_PER_M = 0.011;
/** Showcase: tight shadow box so the lander casts a readable shadow; closer orbit limits. */
const SHOWCASE_SHADOW_HALF_M = 300;
const SHOWCASE_MIN_DISTANCE_M = 8;
const SHOWCASE_MAX_DISTANCE_M = 600;
/** Showcase only: the Sun disc is drawn this many times its true angular size (labelled). */
const SHOWCASE_SUN_SCALE = 4;
const LANDER_MODEL_URL = `${import.meta.env.BASE_URL}models/lander.glb`;

/** Bounded defaults: Balanced is the default; High raises density and shadow resolution. */
const PIXEL_RATIO_CAP: Record<TerrainMeshQuality, number> = { balanced: 1.5, high: 2 };
const SHADOW_MAP_SIZE: Record<TerrainMeshQuality, number> = { balanced: 2048, high: 4096 };

const DEFAULT_PALETTE = { sun: '#ffd36b', earth: '#7cb8ff', mock: '#ecc06c', accent: '#8cd9cb', font: 'Inter, ui-sans-serif, system-ui, sans-serif' };
type Palette = typeof DEFAULT_PALETTE;

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return { sun: token('--ls-sun', DEFAULT_PALETTE.sun), earth: token('--ls-earth', DEFAULT_PALETTE.earth), mock: token('--ls-mock', DEFAULT_PALETTE.mock), accent: token('--ls-accent', DEFAULT_PALETTE.accent), font: token('--ls-font-sans', DEFAULT_PALETTE.font) };
}

interface Look { headingDeg: number; pitchDeg: number }

interface Runtime {
  renderer: WebGLRenderer;
  labels: CSS2DRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  sunLight: DirectionalLight;
  inspect: DirectionalLight;
  ambient: HemisphereLight;
  sky: SkyScene;
  lander: LanderScene;
  materials: TerrainMaterials;
  /** Unit vector toward the Sun (or the neutral light), local frame. */
  lightDirection: Vector3;
  requestRender(): void;
  applyLook(): void;
  /** Rendered-ground height and normal under a local (x, z); null outside the footprint. */
  groundAt(x: number, z: number): GroundSample | null;
  beginLanding(): void;
  /** Ends the landing showcase and gives the camera back. */
  endLanding(): void;
}

type MeshStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; siteName: string }
  | { kind: 'ready'; mesh: LocalTerrainMesh; siteId: string }
  | { kind: 'error'; message: string };

export function LunarViewer(props: LunarViewerProps) {
  const { terrain, sites, selectedSiteId, observerHeightM, cameraMode, sun, earth, onSelectSite, onPlayLanding, landingNote, landingSummary, landingRequest = 0 } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const scaleChipRef = useRef<HTMLSpanElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const terrainRef = useRef<TerrainObject | null>(null);
  const lookRef = useRef<Look>({ headingDeg: 0, pitchDeg: 3 });
  const palette = useRef<Palette>(DEFAULT_PALETTE);
  const latest = useRef({ onSelectSite, onPlayLanding, sun, earth, cameraMode, observerHeightM });
  latest.current = { onSelectSite, onPlayLanding, sun, earth, cameraMode, observerHeightM };
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loader, setLoader] = useState<TerrainMeshLoader | null>(null);
  const [status, setStatus] = useState<MeshStatus>({ kind: 'idle' });
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('realistic');
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<TerrainMeshQuality>('balanced');
  const [reliefAid, setReliefAid] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const [landerReady, setLanderReady] = useState(false);
  const [landingPhase, setLandingPhase] = useState<LandingPhase>('parked');
  /** Incremented per Play so the showcase starts after the App's cursor move has rendered. */
  const [landingRun, setLandingRun] = useState(0);
  const selectedSite = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? null, [sites, selectedSiteId]);
  const mesh = status.kind === 'ready' && status.siteId === selectedSiteId ? status.mesh : null;
  const readoutState = useRef({ mesh, selectedSite });
  readoutState.current = { mesh, selectedSite };
  const hasSun = sun !== null;
  const surfaceModeRef = useRef(surfaceMode);
  surfaceModeRef.current = surfaceMode;

  // 1. Renderer lifecycle: created once; everything else updates it imperatively.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    palette.current = readPalette(container);
    let renderer: WebGLRenderer;
    try {
      // Three.js r187 requires WebGL2; this throws when it is unavailable.
      renderer = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'WebGL2 is unavailable');
      return undefined;
    }
    renderer.setClearColor(0x000000, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.shadowMap.autoUpdate = true;
    const canvas = renderer.domElement;
    canvas.className = 'lunar-viewer__gl';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Interactive 3D local lunar terrain. In surface view use the arrow keys to look around and plus/minus to change the field of view.');
    container.appendChild(canvas);

    const labelRenderer = new CSS2DRenderer();
    labelRenderer.domElement.className = 'lunar-viewer__labels';
    container.appendChild(labelRenderer.domElement);

    const scene = new Scene();
    const camera = new PerspectiveCamera(DEFAULT_FOV_DEG, 1, ORBIT_NEAR_M, CAMERA_FAR_M);
    const sunLight = new DirectionalLight(0xffffff, SUN_INTENSITY);
    sunLight.castShadow = true;
    sunLight.shadow.camera.near = LIGHT_DISTANCE_M - 120_000;
    sunLight.shadow.camera.far = LIGHT_DISTANCE_M + 120_000;
    scene.add(sunLight, sunLight.target);
    // Display aid (not sunlight): view-relative inspection light + faint ambient; see constants.
    const inspect = new DirectionalLight(0xc9d6e8, INSPECT_INTENSITY);
    const ambient = new HemisphereLight(0xb9c3d1, 0x3b3833, AMBIENT_INTENSITY);
    scene.add(inspect, inspect.target, ambient);
    const sky = createSkyScene({ sun: palette.current.sun, earth: palette.current.earth });
    scene.add(sky.group, sky.directionLines);
    const lander = createLanderScene({
      modelUrl: LANDER_MODEL_URL,
      colors: { sun: palette.current.sun, earth: palette.current.earth },
      onLoaded: () => { setLanderReady(true); requestRender(); },
      onError: (reason) => { console.warn('Lander model unavailable', reason); },
      onPhase: setLandingPhase,
    });
    scene.add(lander.group);
    const materials = createTerrainMaterials();
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.minDistance = ORBIT_MIN_DISTANCE_M;
    controls.maxDistance = ORBIT_MAX_DISTANCE_M;
    controls.maxPolarAngle = (88 * Math.PI) / 180;
    controls.screenSpacePanning = true;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    controls.enableDamping = !reduceMotion.matches;
    controls.dampingFactor = 0.09;
    const lightDirection = new Vector3(...NEUTRAL_LIGHT);

    // On-demand rendering: one frame per real change; damping keeps requesting while moving.
    let frame = 0;
    let lastShadowHalf = -1;
    let lastReadout = '';
    let lastCompass = '';
    let lastScaleChip = '';
    const lightTarget = new Vector3();
    /** Camera state taken over by the showcase in Site overview; restored when it ends. */
    let savedOrbit: { position: Vector3; target: Vector3; fov: number } | null = null;
    let orbitHandedOver = false;
    const render = (now: number) => {
      frame = 0;
      const mode = latest.current.cameraMode;
      const animating = lander.update(now);
      const showcase = lander.phase !== 'parked';
      if (showcase && mode === 'orbital') {
        if (lander.view.scripted) {
          camera.position.copy(lander.view.position);
          if (camera.fov !== lander.view.fovDeg) { camera.fov = lander.view.fovDeg; camera.updateProjectionMatrix(); }
          camera.up.set(0, 1, 0);
          camera.lookAt(lander.view.target);
        } else {
          if (!orbitHandedOver) {
            // The scripted move is over: the user may orbit around the landed craft.
            orbitHandedOver = true;
            camera.position.copy(lander.view.position);
            if (camera.fov !== lander.view.fovDeg) { camera.fov = lander.view.fovDeg; camera.updateProjectionMatrix(); }
            controls.target.copy(lander.view.target);
            controls.enabled = true;
          }
          controls.update();
        }
      } else if (mode === 'orbital') {
        controls.update();
      } else if (lander.phase === 'descent') {
        // Ground view: the eye stays put and follows the craft down.
        const dx = lander.bodyCentre.x - camera.position.x, dy = lander.bodyCentre.y - camera.position.y, dz = lander.bodyCentre.z - camera.position.z;
        lookRef.current.headingDeg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
        lookRef.current.pitchDeg = Math.min(85, (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI);
        camera.up.set(0, 1, 0);
        camera.lookAt(lander.bodyCentre);
      }
      const landerScale = !showcase && mode === 'orbital' ? Math.max(1, camera.position.distanceTo(lander.home) * LANDER_SCALE_PER_M) : 1;
      lander.setDisplayScale(landerScale);
      sky.group.position.copy(camera.position);
      if (showcase) lightTarget.copy(lander.home);
      else if (mode === 'orbital') lightTarget.copy(controls.target); else lightTarget.set(0, 0, 0);
      sunLight.target.position.copy(lightTarget);
      sunLight.position.copy(lightTarget).addScaledVector(lightDirection, LIGHT_DISTANCE_M);
      // Inspection light from the viewer's front-left: azimuth follows the view heading.
      const viewAz = mode === 'orbital'
        ? Math.atan2(controls.target.x - camera.position.x, camera.position.z - controls.target.z)
        : (lookRef.current.headingDeg * Math.PI) / 180;
      const inspectAz = viewAz + INSPECT_AZIMUTH_OFFSET_RAD;
      const inspectCos = Math.cos(INSPECT_ELEVATION_RAD);
      inspect.target.position.copy(lightTarget);
      inspect.position.set(
        lightTarget.x + inspectCos * Math.sin(inspectAz) * LIGHT_DISTANCE_M,
        lightTarget.y + Math.sin(INSPECT_ELEVATION_RAD) * LIGHT_DISTANCE_M,
        lightTarget.z - inspectCos * Math.cos(inspectAz) * LIGHT_DISTANCE_M,
      );
      const half = showcase && mode === 'orbital' ? SHOWCASE_SHADOW_HALF_M : mode === 'surface' ? SURFACE_SHADOW_HALF_M : Math.min(ORBIT_SHADOW_HALF_MAX_M, Math.max(1_500, camera.position.distanceTo(controls.target) * 0.8));
      if (Math.abs(half - lastShadowHalf) > 1) {
        lastShadowHalf = half;
        const shadowCamera = sunLight.shadow.camera;
        shadowCamera.left = -half; shadowCamera.right = half; shadowCamera.top = half; shadowCamera.bottom = -half;
        shadowCamera.updateProjectionMatrix();
      }
      // ~1.5 shadow texels along the normal (map size can change with quality).
      sunLight.shadow.normalBias = (2 * half / sunLight.shadow.mapSize.x) * 1.5;
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      drawOverlays();
      const chip = scaleChipRef.current;
      if (chip) {
        const text = lander.group.visible && lander.loaded && landerScale > 1.05 ? `Lander enlarged ×${landerScale < 10 ? landerScale.toFixed(1) : Math.round(landerScale)} · not to scale` : '';
        if (text !== lastScaleChip) { lastScaleChip = text; chip.textContent = text; chip.hidden = text === ''; }
      }
      if (animating) requestRender();
    };
    let torndown = false;
    const requestRender = () => {
      if (frame === 0 && !torndown) frame = requestAnimationFrame(render);
    };
    controls.addEventListener('change', requestRender);

    // Project the frustum centre onto the centre of the App's safe area (contract-2 insets),
    // so the framed site and the surface horizon are not hidden behind floating panels.
    const safe = safeRef.current;
    const resize = () => {
      const width = container.clientWidth, height = container.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      labelRenderer.setSize(width, height);
      camera.aspect = width / height;
      const box = container.getBoundingClientRect();
      const s = safe?.getBoundingClientRect();
      const dx = s ? (box.left + box.width / 2) - (s.left + s.width / 2) : 0;
      const dy = s ? (box.top + box.height / 2) - (s.top + s.height / 2) : 0;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) camera.clearViewOffset();
      else camera.setViewOffset(width, height, dx, dy, width, height);
      camera.updateProjectionMatrix();
      requestRender();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    if (safe) resizeObserver.observe(safe);

    const drawOverlays = () => {
      const mode = latest.current.cameraMode;
      const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
      const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
      const compass = compassRef.current;
      if (compass && mode === 'surface') {
        const { sun: s, earth: e } = latest.current;
        const key = [lander.group.visible && lander.loaded, lander.home.x, lander.home.z, lookRef.current.headingDeg.toFixed(2), hfov.toFixed(4), canvas.clientWidth, compass.clientWidth, s?.azDeg, s?.visible, e?.azDeg, e?.visible].join('|');
        if (key !== lastCompass) {
          lastCompass = key;
          const markers: CompassMarker[] = [];
          if (lander.group.visible && lander.loaded) markers.push({ azDeg: ((Math.atan2(lander.home.x, -lander.home.z) * 180) / Math.PI + 360) % 360, color: palette.current.accent, label: 'LANDER', hidden: false });
          if (s) markers.push({ azDeg: s.azDeg, color: palette.current.sun, label: 'SUN', hidden: s.visible === null ? null : !s.visible });
          if (e) markers.push({ azDeg: e.azDeg, color: palette.current.earth, label: 'EARTH', hidden: e.visible === null ? null : !e.visible });
          // The tape spans less than the canvas: give it the FOV its own width covers.
          const tapeFov = 2 * Math.atan(Math.tan(hfov / 2) * (compass.clientWidth / Math.max(canvas.clientWidth, 1)));
          drawCompass(compass, lookRef.current.headingDeg, tapeFov, markers, palette.current.accent, palette.current.font);
        }
      }
      const readout = readoutRef.current;
      if (!readout) return;
      const { mesh: m, selectedSite: site } = readoutState.current;
      const parts: string[] = [];
      if (site) parts.push(`${site.latDeg.toFixed(3)}° ${site.lonDegE.toFixed(3)}°E`);
      if (m) parts.push(`ground ${m.origin.heightM >= 0 ? '+' : '−'}${Math.abs(m.origin.heightM).toFixed(0)} m`);
      if (mode === 'surface') parts.push(`eye +${latest.current.observerHeightM} m`, `FOV ${((hfov * 180) / Math.PI).toFixed(0)}°`, `heading ${Math.round(((lookRef.current.headingDeg % 360) + 360) % 360)}°`);
      else parts.push(`range ${(camera.position.distanceTo(controls.target) / 1000).toFixed(1)} km`);
      const text = parts.join(' · ');
      if (text !== lastReadout) { lastReadout = text; readout.textContent = text; }
    };

    // Surface look: the eye stays at (0, observer height, 0); only orientation and FOV change.
    const lookTarget = new Vector3();
    const applyLook = () => {
      const [x, y, z] = bodyDirectionLocal(lookRef.current.headingDeg, lookRef.current.pitchDeg);
      lookTarget.set(camera.position.x + x, camera.position.y + y, camera.position.z + z);
      camera.up.set(0, 1, 0);
      camera.lookAt(lookTarget);
      requestRender();
    };
    let dragging = false, lastX = 0, lastY = 0;
    const onDown = (e: PointerEvent) => {
      if (latest.current.cameraMode !== 'surface') return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || latest.current.cameraMode !== 'surface') return;
      const degPerPx = camera.fov / Math.max(canvas.clientHeight, 1);
      const look = lookRef.current;
      look.headingDeg = (((look.headingDeg - (e.clientX - lastX) * degPerPx) % 360) + 360) % 360;
      look.pitchDeg = Math.min(85, Math.max(-85, look.pitchDeg + (e.clientY - lastY) * degPerPx));
      lastX = e.clientX; lastY = e.clientY;
      applyLook();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const setFov = (fov: number) => {
      camera.fov = Math.min(MAX_FOV_DEG, Math.max(MIN_FOV_DEG, fov));
      camera.updateProjectionMatrix();
      requestRender();
    };
    const onWheel = (e: WheelEvent) => {
      if (latest.current.cameraMode !== 'surface') return;
      e.preventDefault();
      setFov(camera.fov * Math.exp(e.deltaY * 0.001));
    };
    const onKey = (e: KeyboardEvent) => {
      if (latest.current.cameraMode !== 'surface') return;
      const step = e.shiftKey ? 10 : 3;
      const look = lookRef.current;
      if (e.key === 'ArrowLeft') look.headingDeg = (look.headingDeg - step + 360) % 360;
      else if (e.key === 'ArrowRight') look.headingDeg = (look.headingDeg + step) % 360;
      else if (e.key === 'ArrowUp') look.pitchDeg = Math.min(85, look.pitchDeg + step);
      else if (e.key === 'ArrowDown') look.pitchDeg = Math.max(-85, look.pitchDeg - step);
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setFov(camera.fov * 0.9); return; }
      else if (e.key === '-') { e.preventDefault(); setFov(camera.fov / 0.9); return; }
      else return;
      e.preventDefault();
      applyLook();
    };
    const onMotionPreference = () => { controls.enableDamping = !reduceMotion.matches; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);
    reduceMotion.addEventListener('change', onMotionPreference);

    const raycaster = new Raycaster();
    const rayOrigin = new Vector3();
    const rayDown = new Vector3(0, -1, 0);
    const groundAt = (x: number, z: number): GroundSample | null => {
      const ground = terrainRef.current;
      if (!ground) return null;
      raycaster.set(rayOrigin.set(x, 500_000, z), rayDown);
      const hit = raycaster.intersectObject(ground.group, true)[0];
      return hit ? { y: hit.point.y, normal: hit.face ? hit.face.normal.clone() : null } : null;
    };
    let savedLook: Look | null = null;
    const beginLanding = () => {
      if (latest.current.cameraMode === 'surface') savedLook = { ...lookRef.current };
      if (latest.current.cameraMode === 'orbital') {
        savedOrbit = { position: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
        orbitHandedOver = false;
        controls.enabled = false;
        controls.minDistance = SHOWCASE_MIN_DISTANCE_M;
        controls.maxDistance = SHOWCASE_MAX_DISTANCE_M;
      }
      sky.setSunDisplayScale(SHOWCASE_SUN_SCALE);
      lander.start({ reducedMotion: reduceMotion.matches, sun: latest.current.sun, earth: latest.current.earth, groundAt });
      requestRender();
    };
    const endLanding = () => {
      if (lander.phase === 'parked') return;
      lander.stop();
      sky.setSunDisplayScale(1);
      if (savedOrbit) {
        controls.minDistance = ORBIT_MIN_DISTANCE_M;
        controls.maxDistance = ORBIT_MAX_DISTANCE_M;
        camera.position.copy(savedOrbit.position);
        controls.target.copy(savedOrbit.target);
        camera.fov = savedOrbit.fov;
        camera.updateProjectionMatrix();
        controls.enabled = latest.current.cameraMode === 'orbital';
        savedOrbit = null;
      }
      if (savedLook) {
        // Ground view: the descent turned the eye toward the craft; give the heading back.
        if (latest.current.cameraMode === 'surface') { lookRef.current = savedLook; applyLook(); }
        savedLook = null;
      }
      requestRender();
    };

    runtimeRef.current = { renderer, labels: labelRenderer, scene, camera, controls, sunLight, inspect, ambient, sky, lander, materials, lightDirection, requestRender, applyLook, groundAt, beginLanding, endLanding };
    resize();
    setReady(true);

    return () => {
      torndown = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      resizeObserver.disconnect();
      reduceMotion.removeEventListener('change', onMotionPreference);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      terrainRef.current?.dispose();
      terrainRef.current = null;
      sky.dispose();
      lander.dispose();
      materials.relief.dispose();
      materials.elevation.dispose();
      sunLight.shadow.dispose();
      sunLight.dispose();
      inspect.dispose();
      ambient.dispose();
      runtimeRef.current = null;
      setReady(false);
      renderer.dispose();
      canvas.remove();
      labelRenderer.domElement.remove();
    };
  }, []);

  // 2. One mesh loader per terrain source; disposed (worker terminated) on replacement/unmount.
  useEffect(() => {
    if (!terrain) { setLoader(null); return undefined; }
    const next = terrain.createMeshLoader();
    setLoader(next);
    return () => { next.dispose(); };
  }, [terrain]);

  // 3. Mesh per selected site and quality only (never per UTC, height or camera change).
  //    Stale completions are aborted/ignored; the previous site's ground is removed at once.
  const siteId = selectedSite?.id ?? null;
  const siteLat = selectedSite?.latDeg;
  const siteLon = selectedSite?.lonDegE;
  const siteName = selectedSite?.name ?? '';
  useEffect(() => {
    const runtime = runtimeRef.current;
    terrainRef.current?.dispose();
    terrainRef.current = null;
    runtime?.requestRender();
    if (!runtime || !loader || siteId === null || siteLat === undefined || siteLon === undefined) { setStatus({ kind: 'idle' }); return undefined; }
    setStatus({ kind: 'loading', siteName });
    const abort = new AbortController();
    loader.load({ latDeg: siteLat, lonDegE: siteLon, quality }, abort.signal).then(
      (loaded) => {
        if (abort.signal.aborted || runtimeRef.current !== runtime) return;
        const object = createTerrainObject(loaded, runtime.materials, surfaceModeRef.current);
        runtime.scene.add(object.group);
        terrainRef.current = object;
        setStatus({ kind: 'ready', mesh: loaded, siteId });
        runtime.requestRender();
      },
      (reason: unknown) => {
        if (abort.signal.aborted) return;
        setStatus({ kind: 'error', message: reason instanceof Error ? reason.message : 'Terrain mesh failed to load' });
      },
    );
    return () => {
      abort.abort();
      terrainRef.current?.dispose();
      terrainRef.current = null;
    };
  }, [loader, siteId, siteLat, siteLon, siteName, quality, ready]);

  // 4. Surface layer (material swap only).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || !terrainRef.current) return;
    setTerrainMode(terrainRef.current, runtime.materials, surfaceMode);
    runtime.requestRender();
  }, [surfaceMode, mesh]);

  // 5. Quality: pixel density cap and shadow-map resolution (mesh quality reloads in 3).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP[quality]));
    const size = SHADOW_MAP_SIZE[quality];
    runtime.sunLight.shadow.mapSize.set(size, size);
    runtime.sunLight.shadow.map?.dispose();
    runtime.sunLight.shadow.map = null;
    runtime.requestRender();
  }, [quality, ready]);

  // 6. Display-aid inspection light + ambient ("Fill"); off = Sun light only.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.inspect.intensity = reliefAid ? INSPECT_INTENSITY : 0;
    runtime.ambient.intensity = reliefAid ? AMBIENT_INTENSITY : 0;
    runtime.requestRender();
  }, [reliefAid, ready]);

  // 7. Sun/Earth directions: light, sky bodies and direction lines (uniforms/transforms only).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.sky.update(sun, earth);
    runtime.lander.setBodies(sun, earth);
    const [x, y, z] = sun ? bodyDirectionLocal(sun.azDeg, sun.elDeg) : NEUTRAL_LIGHT;
    runtime.lightDirection.set(x, y, z);
    runtime.requestRender();
  }, [sun, earth, ready]);

  // 8. Sky labels and hidden/unknown indicators (always on top, unlike the depth-tested discs).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    const added: CSS2DObject[] = [];
    const attach = (kind: 'sun' | 'earth', body: BodyDirection | null) => {
      if (!body) return;
      const element = document.createElement('div');
      element.className = 'lunar-viewer__body-tag';
      element.dataset.body = kind;
      element.dataset.state = visibleToState(body.visible);
      if (body.visible !== true) {
        const ring = document.createElement('span');
        ring.className = 'lunar-viewer__body-ring';
        element.append(ring);
      }
      if (labels) {
        const text = document.createElement('span');
        text.className = 'lunar-viewer__body-text';
        text.textContent = `${kind === 'sun' ? 'Sun' : 'Earth'} ${formatSigned(body.elDeg)} · ${visibilityText(body.visible)}`;
        element.append(text);
      }
      if (!element.childElementCount) return;
      const object = new CSS2DObject(element);
      (kind === 'sun' ? runtime.sky.sun : runtime.sky.earth).add(object);
      added.push(object);
    };
    attach('sun', sun);
    attach('earth', earth);
    runtime.requestRender();
    return () => { for (const object of added) { object.removeFromParent(); object.element.remove(); } runtime.requestRender(); };
  }, [sun, earth, labels, ready]);

  // 9. Site markers inside the loaded footprint (same origin/basis as the mesh; orbital only).
  useEffect(() => {
    const runtime = runtimeRef.current;
    // "Aa" off clears the view: no site markers and no names.
    if (!runtime || !mesh || !terrain || cameraMode !== 'orbital' || !labels) return undefined;
    const added: CSS2DObject[] = [];
    for (const site of sites) {
      const groundM = terrain.heightAt(site.latDeg, site.lonDegE);
      if (groundM === null) continue;
      const [x, y, z] = toLocal(mesh.origin, { latDeg: site.latDeg, lonDegE: site.lonDegE, heightM: groundM });
      if (Math.hypot(x, z) > mesh.maxRangeM) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lunar-viewer__site';
      button.dataset.selected = String(site.id === selectedSiteId);
      button.dataset.mock = String(site.category === 'mock');
      button.setAttribute('aria-label', `Select ${site.name}`);
      const dot = document.createElement('span');
      dot.className = 'lunar-viewer__site-dot';
      button.append(dot);
      if (labels) {
        const name = document.createElement('span');
        name.className = 'lunar-viewer__site-name';
        name.textContent = site.category === 'mock' ? `${site.name} · mock` : site.name;
        button.append(name);
      }
      button.addEventListener('click', () => latest.current.onSelectSite?.(site.id));
      const object = new CSS2DObject(button);
      object.position.set(x, y, z);
      object.center.set(0, 0.5);
      runtime.scene.add(object);
      added.push(object);
    }
    runtime.requestRender();
    return () => { for (const object of added) { object.removeFromParent(); object.element.remove(); } runtime.requestRender(); };
  }, [mesh, terrain, sites, selectedSiteId, cameraMode, labels, ready]);

  // Lander: parked beside the site once its terrain and the model exist. Its azimuth is fixed
  // per terrain build (from the Sun azimuth at that moment), not per time-cursor step.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return undefined;
    if (!mesh || !landerReady) { runtime.lander.setVisible(false); runtime.requestRender(); return undefined; }
    const [x, , z] = bodyDirectionLocal((latest.current.sun?.azDeg ?? 200) + LANDER_AZIMUTH_FROM_SUN_DEG, 0);
    const ground = runtime.groundAt(x * LANDER_OFFSET_M, z * LANDER_OFFSET_M);
    runtime.lander.place(new Vector3(x * LANDER_OFFSET_M, ground?.y ?? 0, z * LANDER_OFFSET_M), ground?.normal ?? null);
    runtime.lander.setVisible(true);
    runtime.requestRender();
    // A new terrain build or site ends any running showcase.
    return () => { runtime.endLanding(); runtime.lander.setVisible(false); };
    // `hasSun`: a site's terrain can finish before its result; place again once the Sun is known.
  }, [mesh, landerReady, hasSun, ready]);

  // Switching camera mode ends the showcase before the camera is re-framed below.
  useEffect(() => () => { runtimeRef.current?.endLanding(); }, [cameraMode]);

  // Landing showcase: starts one render after Play, so a cursor move by the App is already in
  // `sun` / `earth` when the camera is framed.
  useEffect(() => {
    if (landingRun === 0) return;
    const runtime = runtimeRef.current;
    if (!runtime || !runtime.lander.loaded || !runtime.lander.group.visible) return;
    runtime.endLanding();
    runtime.beginLanding();
  }, [landingRun]);

  // 10. Camera framing on site/mode change. Camera state never changes scientific inputs.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const { camera, controls } = runtime;
    const sunAz = latest.current.sun?.azDeg ?? 200;
    if (cameraMode === 'surface') {
      controls.enabled = false;
      camera.near = SURFACE_NEAR_M;
      camera.fov = DEFAULT_FOV_DEG;
      camera.updateProjectionMatrix();
      camera.position.set(0, latest.current.observerHeightM, 0);
      // Open Ground view with the parked lander in frame (right of centre) when there is one.
      const lander = runtime.lander;
      const landerAz = ((Math.atan2(lander.home.x, -lander.home.z) * 180) / Math.PI + 360) % 360;
      lookRef.current = { headingDeg: lander.group.visible && lander.loaded ? (landerAz - 15 + 360) % 360 : sunAz, pitchDeg: 3 };
      runtime.applyLook();
      return;
    }
    controls.enabled = true;
    camera.near = ORBIT_NEAR_M;
    camera.fov = DEFAULT_FOV_DEG;
    camera.updateProjectionMatrix();
    controls.target.set(0, 0, 0);
    const [x, y, z] = bodyDirectionLocal(sunAz, ORBIT_ELEVATION_DEG);
    camera.position.set(x * ORBIT_RANGE_M, y * ORBIT_RANGE_M, z * ORBIT_RANGE_M);
    camera.up.set(0, 1, 0);
    controls.update();
    runtime.requestRender();
    // sun is read from `latest`: framing is per site/mode, not per time-cursor step.
  }, [cameraMode, siteId, ready]);

  // Exact observer height in surface mode (0 and 0.25 m included; no floor).
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || cameraMode !== 'surface') return;
    runtime.camera.position.set(0, observerHeightM, 0);
    runtime.applyLook();
  }, [observerHeightM, cameraMode, ready]);

  // Orbital-only helpers: direction lines from the site toward Sun/Earth.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.sky.setDirectionLinesVisible(cameraMode === 'orbital');
    runtime.requestRender();
  }, [cameraMode, ready]);

  const surface = cameraMode === 'surface';
  const canLand = landerReady && mesh !== null && sun !== null;
  const playLanding = () => {
    latest.current.onPlayLanding?.();
    setLandingRun((run) => run + 1);
  };
  // The App can start the landing view too (feature guide). A request waits until the view can
  // run (model, terrain and Sun ready) and is dropped if the site changes first.
  const handledRequest = useRef(landingRequest);
  const requestSite = useRef(siteId);
  useEffect(() => {
    if (requestSite.current !== siteId) { requestSite.current = siteId; handledRequest.current = landingRequest; return; }
    if (landingRequest === handledRequest.current || !canLand) return;
    handledRequest.current = landingRequest;
    playLanding();
  }, [landingRequest, canLand, siteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const landingButtonRef = useRef<HTMLButtonElement>(null);
  /** Closing from the card returns focus to the persistent landing button. */
  const closeLanding = () => {
    runtimeRef.current?.endLanding();
    requestAnimationFrame(() => landingButtonRef.current?.focus());
  };

  // A tap meant for Skip must not become Replay when touchdown happens under the finger.
  const phaseChangedAt = useRef(0);
  useEffect(() => { phaseChangedAt.current = performance.now(); }, [landingPhase]);
  const settled = () => performance.now() - phaseChangedAt.current > 350;

  // One button for the whole showcase so keyboard focus survives the phase changes.
  const onLandingButton = () => {
    if (!settled()) return;
    const runtime = runtimeRef.current;
    if (landingPhase === 'parked') playLanding();
    else if (landingPhase === 'descent') { runtime?.lander.skip(); runtime?.requestRender(); }
    else runtime?.endLanding();
  };
  const mock = terrain?.provenance.kind === 'mock';
  const extentKm = mesh ? (mesh.maxRangeM / 1000).toFixed(0) : null;
  return (
    <div ref={containerRef} className="lunar-viewer" data-camera-mode={cameraMode} data-landing={landingPhase}>
      {failure && <div className="lunar-viewer__failure" role="alert">3D view unavailable: {failure}. The data panels still work.</div>}
      {/* Every overlay lives inside the App-provided safe insets (contract-2). */}
      <div ref={safeRef} className="lunar-viewer__safe">
        {surface && <canvas ref={compassRef} className="lunar-viewer__compass" aria-hidden="true" />}
        <div className="lunar-viewer__sr" aria-live="polite">{describeBody('Sun', sun)}. {describeBody('Earth', earth)}.{!sun ? ' Lighting: neutral light (no Sun direction for this site yet).' : ''}{landingPhase === 'descent' ? ' Illustrative landing in progress.' : landingPhase === 'link' ? ' Lander has touched down; landing result shown.' : ''}{landingPhase !== 'parked' && landingNote ? ` ${landingNote}` : ''}</div>
        <div className="lunar-viewer__corner">
          {mock && <div className="lunar-viewer__mock" role="status">MOCK DATA · fictional terrain</div>}
          <div className="lunar-viewer__toolbar" role="toolbar" aria-label="3D view options">
            <div className="lunar-viewer__segment" role="group" aria-label="Surface layer">
              <button type="button" aria-pressed={surfaceMode === 'realistic'} onClick={() => setSurfaceMode('realistic')} title="Shaded relief">Relief</button>
              <button type="button" aria-pressed={surfaceMode === 'elevation'} onClick={() => setSurfaceMode('elevation')} title="Elevation colour">Elev</button>
            </div>
            <button type="button" aria-pressed={labels} onClick={() => setLabels((v) => !v)} title={labels ? 'Hide site markers and labels' : 'Show site markers and labels'} aria-label="Site markers and labels">Aa</button>
            <button type="button" aria-pressed={reliefAid} onClick={() => setReliefAid((v) => !v)} title={reliefAid ? 'Inspection fill light on — display aid, not sunlight' : 'Sun light only'} aria-label="Inspection fill light (display aid)">Fill</button>
            <button type="button" aria-pressed={quality === 'high'} onClick={() => setQuality((q) => (q === 'high' ? 'balanced' : 'high'))} title={quality === 'high' ? 'High detail (denser mesh, sharper shadows; slower)' : 'Balanced (default)'} aria-label="High detail rendering">HD</button>
            <button type="button" aria-expanded={legendOpen} aria-controls="lunar-viewer-legend" onClick={() => setLegendOpen((v) => !v)} title="Legend" aria-label="Legend">i</button>
          </div>
          {(canLand || landingPhase !== 'parked') && (
            <button ref={landingButtonRef} type="button" className="lunar-viewer__landing-button" onClick={onLandingButton} aria-label={landingPhase === 'parked' ? 'Play illustrative landing' : landingPhase === 'descent' ? 'Skip to touchdown' : 'End landing view'} title={landingPhase === 'parked' ? 'Illustrative descent to this site, then the Sun ray and Earth link at the selected time' : undefined}>
              {landingPhase === 'parked' ? '▶ Play landing' : landingPhase === 'descent' ? '⏭ Skip to touchdown' : '■ End landing view'}
            </button>
          )}
          {legendOpen && (
            <div id="lunar-viewer-legend" className="lunar-viewer__legend">
              {surfaceMode === 'elevation' && mesh ? (
                <>
                  <div className="lunar-viewer__ramp" style={{ background: `linear-gradient(to right, ${RAMP_STOPS.join(', ')})` }} />
                  <div className="lunar-viewer__ticks"><span>{mesh.minHeightM.toFixed(0)} m</span><span>{mesh.maxHeightM.toFixed(0)} m</span></div>
                  <div>Height above the 1737.4 km reference sphere (mock terrain).</div>
                </>
              ) : (
                <div>Shaded relief: mock heights lit by one Sun light from the selected site's Sun direction; shadows come from a bounded shadow map near the view (display only — visibility uses the horizon mask).</div>
              )}
              {reliefAid && <div className="lunar-viewer__legend-meta">Fill: a cool inspection light from your front-left (moves with the view) plus faint ambient — a display aid, not sunlight, so slope shape reads at any Sun angle. Only the Sun casts shadows; switch Fill off to see Sun light alone.</div>}
              <div className="lunar-viewer__legend-meta">Local terrain around the selected site{extentKm ? ` to ${extentKm} km` : ''}, Moon curvature included; near detail is fine, distant terrain coarse. Beyond it nothing is drawn.</div>
              <div className="lunar-viewer__legend-meta">{surface ? 'Sun 0.53° and Earth 1.9° at true angular size. Stars and Earth texture are decorative.' : 'Lines point toward the Sun and Earth from the site.'}</div>
              <div className="lunar-viewer__legend-meta">Lander and landing: an illustrative model {LANDER_OFFSET_M} m from the site point, enlarged in Site overview so it stays visible. Descent path, flame and dust are decorative. The Sun ray and Earth link show only whether each body's centre is above the terrain horizon at the selected time — not power or radio-link performance. During the landing view the Sun disc is drawn ×{SHOWCASE_SUN_SCALE}.</div>
              <div className="lunar-viewer__legend-meta">{surface ? 'Drag or arrow keys to look · wheel or ± to zoom.' : 'Drag to orbit · right-drag to pan · wheel to zoom · click a site.'}</div>
            </div>
          )}
        </div>
        <div className="lunar-viewer__center">
          {status.kind === 'loading' && <div className="lunar-viewer__loading" role="status"><span className="lunar-viewer__spinner" aria-hidden="true" />Building local terrain for {status.siteName}…</div>}
          {status.kind === 'error' && <div className="lunar-viewer__error" role="alert">Terrain unavailable: {status.message}</div>}
          {status.kind === 'idle' && ready && !selectedSite && <div className="lunar-viewer__loading" role="status">Select a site to build its local terrain.</div>}
        </div>
        {landingPhase !== 'parked' && (
          <section className="lunar-viewer__landing-card" aria-label="Landing status">
            <header><strong>{landingPhase === 'descent' ? 'Landing' : 'Touchdown'}{landingSummary ? ` · ${landingSummary.title}` : ''}</strong><span>{landingPhase === 'descent'
              ? <button type="button" onClick={onLandingButton} aria-label="Skip to touchdown" title="Skip to touchdown">⏭</button>
              : <button type="button" onClick={() => { if (settled()) playLanding(); }} aria-label="Replay landing" title="Replay landing">↻</button>}<button type="button" onClick={closeLanding} aria-label="Close landing view" title="Close">×</button></span></header>
            <ul className="lunar-viewer__landing-now">
              <li data-body="sun" data-state={sun ? visibleToState(sun.visible) : 'unknown'}><strong>Sun</strong>{sun ? `${formatSigned(sun.elDeg)} · ${visibilityText(sun.visible)}` : 'direction unavailable'}</li>
              <li data-body="earth" data-state={earth ? visibleToState(earth.visible) : 'unknown'}><strong>Earth</strong>{earth ? `${formatSigned(earth.elDeg)} · ${visibilityText(earth.visible)}` : 'direction unavailable'}</li>
            </ul>
            {landingNote && <p className="lunar-viewer__landing-note">{landingNote}</p>}
            {landingSummary?.notice && <p className="lunar-viewer__landing-stale" role="status">{landingSummary.notice}</p>}
            {landingSummary && <dl>{landingSummary.rows.map((row) => <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
            <p className="lunar-viewer__landing-foot">Terrain-horizon visibility only — not power or radio-link performance.</p>
            <details className="lunar-viewer__landing-about"><summary>About these values</summary>
              {landingSummary && <p>{landingSummary.meta}</p>}
              <p>Sun and Earth states are centre visibility from the terrain horizon mask at the selected time. The descent, flame and dust are illustrative; this is not a mission-success assessment.</p>
            </details>
          </section>
        )}
        <div className="lunar-viewer__readout-row">
          {landingPhase !== 'parked' && <span className="lunar-viewer__chip" role="status">Illustrative landing · Sun enlarged ×{SHOWCASE_SUN_SCALE}{surface ? '' : ' · terrain shadows near lander only'} · display aid</span>}
          <span ref={scaleChipRef} className="lunar-viewer__chip" hidden />
          {mesh?.partialCoverage && <span className="lunar-viewer__chip" role="status">Partial footprint · coverage edge</span>}
          {!sun && ready && <span className="lunar-viewer__chip">Neutral light · no Sun direction yet</span>}
          {reliefAid && ready && <span className="lunar-viewer__chip lunar-viewer__chip--fill" title="Cool inspection light from the view's front-left; not sunlight. Toggle with Fill.">Fill light · display aid</span>}
          <div ref={readoutRef} className="lunar-viewer__readout" aria-hidden="true" title={surface ? 'Drag or arrow keys to look · wheel or ± to zoom' : 'Drag to orbit · wheel to zoom · click a site'} />
        </div>
      </div>
    </div>
  );
}
