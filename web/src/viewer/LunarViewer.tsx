import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DirectionalLight,
  HemisphereLight,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { LocalTerrainMesh, TerrainMeshLoader, TerrainMeshQuality } from '../data/contract';
import { drawCompass, type CompassMarker } from './compass';
import { bodyDirectionLocal, toLocal } from './localFrame';
import { createSkyScene, type SkyScene } from './skyScene';
import { describeBody, formatSigned, visibilityText, visibleToState } from './skyGeometry';
import { createTerrainMaterials, createTerrainObject, RAMP_STOPS, setTerrainMode, type SurfaceMode, type TerrainMaterials, type TerrainObject } from './terrainScene';
import type { BodyDirection, LunarViewerProps } from './types';
import './viewer.css';

export type { BodyDirection, CameraMode, LunarViewerProps } from './types';

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
  materials: TerrainMaterials;
  /** Unit vector toward the Sun (or the neutral light), local frame. */
  lightDirection: Vector3;
  requestRender(): void;
  applyLook(): void;
}

type MeshStatus =
  | { kind: 'idle' }
  | { kind: 'loading'; siteName: string }
  | { kind: 'ready'; mesh: LocalTerrainMesh; siteId: string }
  | { kind: 'error'; message: string };

export function LunarViewer(props: LunarViewerProps) {
  const { terrain, sites, selectedSiteId, observerHeightM, cameraMode, sun, earth, onSelectSite } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLCanvasElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const terrainRef = useRef<TerrainObject | null>(null);
  const lookRef = useRef<Look>({ headingDeg: 0, pitchDeg: 3 });
  const palette = useRef<Palette>(DEFAULT_PALETTE);
  const latest = useRef({ onSelectSite, sun, earth, cameraMode, observerHeightM });
  latest.current = { onSelectSite, sun, earth, cameraMode, observerHeightM };
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [loader, setLoader] = useState<TerrainMeshLoader | null>(null);
  const [status, setStatus] = useState<MeshStatus>({ kind: 'idle' });
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('realistic');
  const [labels, setLabels] = useState(true);
  const [quality, setQuality] = useState<TerrainMeshQuality>('balanced');
  const [reliefAid, setReliefAid] = useState(true);
  const [legendOpen, setLegendOpen] = useState(false);
  const selectedSite = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? null, [sites, selectedSiteId]);
  const mesh = status.kind === 'ready' && status.siteId === selectedSiteId ? status.mesh : null;
  const readoutState = useRef({ mesh, selectedSite });
  readoutState.current = { mesh, selectedSite };
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
    const materials = createTerrainMaterials();
    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 0, 0);
    controls.minDistance = ORBIT_MIN_DISTANCE_M;
    controls.maxDistance = 200_000;
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
    const lightTarget = new Vector3();
    const render = () => {
      frame = 0;
      const mode = latest.current.cameraMode;
      if (mode === 'orbital') controls.update();
      sky.group.position.copy(camera.position);
      if (mode === 'orbital') lightTarget.copy(controls.target); else lightTarget.set(0, 0, 0);
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
      const half = mode === 'surface' ? SURFACE_SHADOW_HALF_M : Math.min(ORBIT_SHADOW_HALF_MAX_M, Math.max(1_500, camera.position.distanceTo(controls.target) * 0.8));
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
    };
    const requestRender = () => {
      if (frame === 0) frame = requestAnimationFrame(render);
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
        const key = [lookRef.current.headingDeg.toFixed(2), hfov.toFixed(4), canvas.clientWidth, compass.clientWidth, s?.azDeg, s?.visible, e?.azDeg, e?.visible].join('|');
        if (key !== lastCompass) {
          lastCompass = key;
          const markers: CompassMarker[] = [];
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

    runtimeRef.current = { renderer, labels: labelRenderer, scene, camera, controls, sunLight, inspect, ambient, sky, materials, lightDirection, requestRender, applyLook };
    resize();
    setReady(true);

    return () => {
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
    if (!runtime || !mesh || !terrain || cameraMode !== 'orbital') return undefined;
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
        name.textContent = site.category === 'mock' ? `${site.name} · mock` : site.nameVerified ? site.name : `${site.name} · name unverified`;
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
      lookRef.current = { headingDeg: sunAz, pitchDeg: 3 };
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
  const mock = terrain?.provenance.kind === 'mock';
  const extentKm = mesh ? (mesh.maxRangeM / 1000).toFixed(0) : null;
  return (
    <div ref={containerRef} className="lunar-viewer" data-camera-mode={cameraMode}>
      {failure && <div className="lunar-viewer__failure" role="alert">3D view unavailable: {failure}. The data panels still work.</div>}
      {/* Every overlay lives inside the App-provided safe insets (contract-2). */}
      <div ref={safeRef} className="lunar-viewer__safe">
        {surface && <canvas ref={compassRef} className="lunar-viewer__compass" aria-hidden="true" />}
        <div className="lunar-viewer__sr" aria-live="polite">{describeBody('Sun', sun)}. {describeBody('Earth', earth)}.{!sun ? ' Lighting: neutral light (no Sun direction for this site yet).' : ''}</div>
        <div className="lunar-viewer__corner">
          {mock && <div className="lunar-viewer__mock" role="status">MOCK DATA · fictional terrain</div>}
          <div className="lunar-viewer__toolbar" role="toolbar" aria-label="3D view options">
            <div className="lunar-viewer__segment" role="group" aria-label="Surface layer">
              <button type="button" aria-pressed={surfaceMode === 'realistic'} onClick={() => setSurfaceMode('realistic')} title="Shaded relief">Relief</button>
              <button type="button" aria-pressed={surfaceMode === 'elevation'} onClick={() => setSurfaceMode('elevation')} title="Elevation colour">Elev</button>
            </div>
            <button type="button" aria-pressed={labels} onClick={() => setLabels((v) => !v)} title="Show labels" aria-label="Labels">Aa</button>
            <button type="button" aria-pressed={reliefAid} onClick={() => setReliefAid((v) => !v)} title={reliefAid ? 'Inspection fill light on — display aid, not sunlight' : 'Sun light only'} aria-label="Inspection fill light (display aid)">Fill</button>
            <button type="button" aria-pressed={quality === 'high'} onClick={() => setQuality((q) => (q === 'high' ? 'balanced' : 'high'))} title={quality === 'high' ? 'High detail (denser mesh, sharper shadows; slower)' : 'Balanced (default)'} aria-label="High detail rendering">HD</button>
            <button type="button" aria-expanded={legendOpen} aria-controls="lunar-viewer-legend" onClick={() => setLegendOpen((v) => !v)} title="Legend" aria-label="Legend">i</button>
          </div>
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
              <div className="lunar-viewer__legend-meta">{surface ? 'Drag or arrow keys to look · wheel or ± to zoom.' : 'Drag to orbit · right-drag to pan · wheel to zoom · click a site.'}</div>
            </div>
          )}
        </div>
        <div className="lunar-viewer__center">
          {status.kind === 'loading' && <div className="lunar-viewer__loading" role="status"><span className="lunar-viewer__spinner" aria-hidden="true" />Building local terrain for {status.siteName}…</div>}
          {status.kind === 'error' && <div className="lunar-viewer__error" role="alert">Terrain unavailable: {status.message}</div>}
          {status.kind === 'idle' && ready && !selectedSite && <div className="lunar-viewer__loading" role="status">Select a site to build its local terrain.</div>}
        </div>
        <div className="lunar-viewer__readout-row">
          {mesh?.partialCoverage && <span className="lunar-viewer__chip" role="status">Partial footprint · coverage edge</span>}
          {!sun && ready && <span className="lunar-viewer__chip">Neutral light · no Sun direction yet</span>}
          {reliefAid && ready && <span className="lunar-viewer__chip" title="Cool inspection light from the view's front-left; not sunlight. Toggle with Fill.">Fill light · display aid</span>}
          <div ref={readoutRef} className="lunar-viewer__readout" aria-hidden="true" title={surface ? 'Drag or arrow keys to look · wheel or ± to zoom' : 'Drag to orbit · wheel to zoom · click a site'} />
        </div>
      </div>
    </div>
  );
}
