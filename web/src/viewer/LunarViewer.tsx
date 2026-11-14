import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Billboard,
  BillboardCollection,
  BoundingSphere,
  buildModuleUrl,
  Cartesian2,
  Cartesian3,
  Cartographic,
  CesiumTerrainProvider,
  Color,
  DirectionalLight,
  EasingFunction,
  Ellipsoid,
  Entity,
  HeadingPitchRange,
  HorizontalOrigin,
  LabelCollection,
  LabelStyle,
  Material,
  Math as CesiumMath,
  Matrix4,
  PerspectiveFrustum,
  PolylineCollection,
  sampleTerrainMostDetailed,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  ShadowMode,
  SkyBox,
  VerticalOrigin,
  Viewer,
} from 'cesium';
import type { SiteSummary, TerrainSource } from '../data/contract';
import { drawCompass } from './compass';
import { createSurfaceMaterial, RAMP_STOPS, updateSurfaceMaterial, type SurfaceMode } from './reliefMaterial';
import { EARTH_DIAMETER_DEG, EARTH_PAD_SCALE, EARTH_PHASE_STEP_DEG, earthImage, SUN_DIAMETER_DEG, SUN_GLOW_SCALE, sunImage } from './skyBodies';
import { skyIcon, visibleToState } from './skyIcons';
import { billboardDiameterPixels, describeBody, formatSigned, skyDirectionFixed, visibilityText } from './skyGeometry';
import { createHeightFunctionProvider, estimateHeightRange, sampleGroundHeight, stopRefiningPastData } from './terrain';
import type { BodyDirection, CameraMode, LunarViewerProps } from './types';
import './viewer.css';

export type { BodyDirection, CameraMode, LunarViewerProps } from './types';

type Quality = 'high' | 'balanced';
type Vec3 = readonly [number, number, number];

const SITE_PREFIX = 'site:';
/** Sky bodies in surface mode: far enough to sit beyond the mock terrain (coverage radius ≈ 180 km). */
const SKY_DISTANCE_SURFACE_M = 400_000;
const SKY_DISTANCE_ORBITAL_M = 40_000;
const MARKER_LIFT_M = 30;
const MIN_FOV = 0.15;
const MAX_FOV = 1.6;
const DEFAULT_FOV = 1.2;
const OVERVIEW_RANGE_M = 560_000;
/** Rendering presets, not guarantees of Surface throughput or skyline accuracy. */
const SSE: Record<Quality, Record<CameraMode, number>> = { high: { surface: 12, orbital: 4 }, balanced: { surface: 16, orbital: 8 } };
// Balanced uses a smaller shadow map; actual throughput depends on the host and view.
const SHADOW_SIZE: Record<Quality, number> = { high: 4096, balanced: 1024 };
/** Fallbacks when the app's design tokens (contract-2 `--ls-*`) are absent, e.g. in the dev harness. */
const DEFAULT_PALETTE = { sun: '#ffd36b', earth: '#7cb8ff', mock: '#ecc06c', accent: '#8cd9cb', font: 'Inter, ui-sans-serif, system-ui, sans-serif' };
type Palette = typeof DEFAULT_PALETTE;

function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element);
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return { sun: token('--ls-sun', DEFAULT_PALETTE.sun), earth: token('--ls-earth', DEFAULT_PALETTE.earth), mock: token('--ls-mock', DEFAULT_PALETTE.mock), accent: token('--ls-accent', DEFAULT_PALETTE.accent), font: token('--ls-font-sans', DEFAULT_PALETTE.font) };
}

interface Look { headingRad: number; pitchRad: number }

type SiteLike = Pick<SiteSummary, 'latDeg' | 'lonDegE'>;

function surfacePosition(site: SiteLike, groundM: number, heightM: number): Cartesian3 {
  return Cartesian3.fromDegrees(site.lonDegE, site.latDeg, groundM + heightM, Ellipsoid.MOON);
}

function offsetPosition(v: Vec3, scale: number, origin: Cartesian3): Cartesian3 {
  return new Cartesian3(origin.x + v[0] * scale, origin.y + v[1] * scale, origin.z + v[2] * scale);
}

function siteLabel(site: SiteSummary): string {
  if (site.category === 'mock') return site.name + ' · mock';
  return site.nameVerified ? site.name : site.name + ' · name unverified';
}

/** Effect cleanups run in declaration order, so the viewer may already be destroyed. */
function removeEntities(viewer: Viewer, entities: readonly Entity[]): void {
  if (viewer.isDestroyed()) return;
  for (const entity of entities) viewer.entities.remove(entity);
}

/** Angular size → billboard size in metres at a given distance. */
function sizeAt(distanceM: number, angleDeg: number): number {
  return 2 * distanceM * Math.tan((angleDeg * Math.PI) / 360);
}

/**
 * No network-backed widgets, imagery, geocoder or ion. The starfield is Cesium's bundled
 * Tycho-2 sky box (served locally); it is decorative and not aligned to the lunar sky.
 */
function createViewer(container: HTMLElement): Viewer {
  const face = (name: string) => buildModuleUrl(`Assets/Textures/SkyBox/tycho2t3_80_${name}.jpg`);
  return new Viewer(container, {
    baseLayer: false,
    geocoder: false,
    baseLayerPicker: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    timeline: false,
    animation: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    skyBox: new SkyBox({ sources: { positiveX: face('px'), negativeX: face('mx'), positiveY: face('py'), negativeY: face('my'), positiveZ: face('pz'), negativeZ: face('mz') } }),
    skyAtmosphere: false,
    shadows: true,
    terrainShadows: ShadowMode.ENABLED,
  });
}

interface SkyLayer { billboards: BillboardCollection; labels: LabelCollection; lines: PolylineCollection }
interface SizedBody { billboard: Billboard; diameterM: number }

export function LunarViewer(props: LunarViewerProps) {
  const { terrain, sites, selectedSiteId, observerHeightM, cameraMode, sun, earth, onSelectSite } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLCanvasElement>(null);
  const safeRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const skyRef = useRef<SkyLayer | null>(null);
  const bodyBillboards = useRef<SizedBody[]>([]);
  const materialRef = useRef<Material | null>(null);
  const lookRef = useRef<Look>({ headingRad: 0, pitchRad: CesiumMath.toRadians(3) });
  const latest = useRef({ onSelectSite, sun, earth, cameraMode, sites, observerHeightM });
  latest.current = { onSelectSite, sun, earth, cameraMode, sites, observerHeightM };
  const flyingRef = useRef(false);
  const palette = useRef<Palette>(DEFAULT_PALETTE);
  const [ground, setGround] = useState<Record<string, number | null>>({});
  const [ready, setReady] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('realistic');
  const [labels, setLabels] = useState(true);
  // Lower-cost default; measure the actual moving scene before making FPS claims.
  const [quality, setQuality] = useState<Quality>('balanced');
  const [legendOpen, setLegendOpen] = useState(false);
  const [earthImages, setEarthImages] = useState<ReadonlyMap<number, HTMLCanvasElement>>(new Map());
  const range = useMemo(() => (terrain ? estimateHeightRange(terrain) : null), [terrain]);
  const selectedSite = useMemo(() => sites.find((s) => s.id === selectedSiteId) ?? null, [sites, selectedSiteId]);
  const groundKnown = !selectedSite || selectedSite.id in ground;
  const selectedGround = selectedSite ? ground[selectedSite.id] ?? 0 : 0;
  const readoutRefs = useRef({ selectedSite, selectedGround });
  readoutRefs.current = { selectedSite, selectedGround };

  // 1. Viewer lifecycle. Created once; everything else is updated imperatively.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    // Must precede any Cesium geometry: all Cartographic/Cartesian maths uses the Moon sphere.
    Ellipsoid.default = Ellipsoid.MOON;
    palette.current = readPalette(container);
    let viewer: Viewer;
    try {
      viewer = createViewer(container);
    } catch (error) {
      // No WebGL (or context creation failed): the HUD text still reports Sun/Earth state.
      setFailure(error instanceof Error ? error.message : 'WebGL is unavailable');
      return undefined;
    }
    // Cap the render resolution at 2x CSS pixels (a 3x phone screen would triple fill cost).
    viewer.resolutionScale = Math.min(1, 2 / window.devicePixelRatio);
    const { scene } = viewer;
    scene.backgroundColor = Color.BLACK;
    scene.globe.baseColor = new Color(0.07, 0.07, 0.08, 1);
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    // Primitives (Sun/Earth discs) are hidden by terrain in front of them.
    scene.globe.depthTestAgainstTerrain = true;
    scene.globe.tileCacheSize = 1000;
    stopRefiningPastData(scene.globe);
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
    scene.fog.enabled = false;
    // Render only when something changed (camera moves, tile loads and the explicit
    // requestRender calls below); an idle 3D view then costs nothing.
    scene.requestRenderMode = true;
    scene.maximumRenderTimeChange = Number.POSITIVE_INFINITY;
    // Airless: hard, nearly black shadows. 0.06 leaves a hint of earthshine/scatter.
    scene.shadowMap.softShadows = false;
    scene.shadowMap.darkness = 0.06;
    scene.screenSpaceCameraController.minimumZoomDistance = 500;
    scene.screenSpaceCameraController.maximumZoomDistance = 4_000_000;
    scene.light = new DirectionalLight({ direction: new Cartesian3(0, 0, 1), intensity: 2 });
    // Procedural terrain tiles are computed on the main thread; tell the user while they stream in.
    // With requestRenderMode, tile loading only advances on rendered frames: keep requesting
    // frames while tiles are pending.
    const removeProgress = scene.globe.tileLoadProgressEvent.addEventListener((pending: number) => {
      setStreaming(pending > 0);
      if (pending > 0) scene.requestRender();
    });
    viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
    const sky: SkyLayer = {
      billboards: scene.primitives.add(new BillboardCollection({ scene })) as BillboardCollection,
      labels: scene.primitives.add(new LabelCollection({ scene })) as LabelCollection,
      lines: scene.primitives.add(new PolylineCollection()) as PolylineCollection,
    };
    skyRef.current = sky;
    viewerRef.current = viewer;
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__dbgViewer = viewer;

    // Pixel-sized body discs keep their angular diameter as FOV, viewport or flight
    // distance changes. Marker icons stay fixed-size and are deliberately excluded.
    const removeBodySizing = scene.preRender.addEventListener(() => {
      const frustum = viewer.camera.frustum as PerspectiveFrustum;
      const heightPx = scene.canvas.clientHeight;
      const verticalFov = frustum.fovy;
      if (heightPx <= 0 || verticalFov === undefined) return;
      for (const body of bodyBillboards.current) {
        const distanceM = Cartesian3.distance(viewer.camera.positionWC, body.billboard.position);
        if (distanceM <= 0) continue;
        const pixels = billboardDiameterPixels(body.diameterM, distanceM, verticalFov, heightPx);
        if (body.billboard.width !== pixels) body.billboard.width = pixels;
        if (body.billboard.height !== pixels) body.billboard.height = pixels;
      }
    });
    scene.canvas.tabIndex = 0;
    scene.canvas.setAttribute('aria-label', 'Interactive 3D lunar terrain view. In surface view use the arrow keys to look around and plus/minus to change the field of view.');

    const handler = new ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((click: { position: Cartesian2 }) => {
      const picked = scene.pick(click.position) as { id?: unknown } | undefined;
      const entity = picked?.id;
      if (entity instanceof Entity && typeof entity.id === 'string' && entity.id.startsWith(SITE_PREFIX)) {
        latest.current.onSelectSite?.(entity.id.slice(SITE_PREFIX.length));
      }
    }, ScreenSpaceEventType.LEFT_CLICK);

    // Surface mode: drag = look around (camera stays at the observer), wheel = field of view.
    const canvas = scene.canvas;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const applyLook = () => {
      viewer.camera.setView({ orientation: { heading: lookRef.current.headingRad, pitch: lookRef.current.pitchRad, roll: 0 } });
      scene.requestRender();
    };
    const onKey = (e: KeyboardEvent) => {
      if (latest.current.cameraMode !== 'surface') return;
      const step = CesiumMath.toRadians(e.shiftKey ? 10 : 3);
      const look = lookRef.current;
      const frustum = viewer.camera.frustum as PerspectiveFrustum;
      const fov = frustum.fov ?? DEFAULT_FOV;
      if (e.key === 'ArrowLeft') look.headingRad = CesiumMath.zeroToTwoPi(look.headingRad - step);
      else if (e.key === 'ArrowRight') look.headingRad = CesiumMath.zeroToTwoPi(look.headingRad + step);
      else if (e.key === 'ArrowUp') look.pitchRad = Math.min(look.pitchRad + step, CesiumMath.toRadians(85));
      else if (e.key === 'ArrowDown') look.pitchRad = Math.max(look.pitchRad - step, CesiumMath.toRadians(-85));
      else if (e.key === '+' || e.key === '=') frustum.fov = Math.max(fov * 0.9, MIN_FOV);
      else if (e.key === '-') frustum.fov = Math.min(fov / 0.9, MAX_FOV);
      else return;
      e.preventDefault();
      applyLook();
    };
    const onDown = (e: PointerEvent) => {
      if (latest.current.cameraMode !== 'surface') return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging || latest.current.cameraMode !== 'surface') return;
      const fov = (viewer.camera.frustum as PerspectiveFrustum).fov ?? DEFAULT_FOV;
      const perPx = fov / Math.max(canvas.clientWidth, canvas.clientHeight, 1);
      const look = lookRef.current;
      look.headingRad = CesiumMath.zeroToTwoPi(look.headingRad - (e.clientX - lastX) * perPx);
      look.pitchRad = CesiumMath.clamp(look.pitchRad + (e.clientY - lastY) * perPx, CesiumMath.toRadians(-85), CesiumMath.toRadians(85));
      lastX = e.clientX;
      lastY = e.clientY;
      applyLook();
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      if (latest.current.cameraMode !== 'surface') return;
      e.preventDefault();
      const frustum = viewer.camera.frustum as PerspectiveFrustum;
      frustum.fov = CesiumMath.clamp((frustum.fov ?? DEFAULT_FOV) * Math.exp(e.deltaY * 0.001), MIN_FOV, MAX_FOV);
      scene.requestRender();
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('keydown', onKey);

    // Compass tape + readout, redrawn only when the view actually changed.
    let lastKey = '';
    const removePostRender = scene.postRender.addEventListener(() => {
      const camera = viewer.camera;
      const frustum = camera.frustum as PerspectiveFrustum;
      const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
      const fovy = frustum.fovy ?? DEFAULT_FOV;
      const hfov = 2 * Math.atan(Math.tan(fovy / 2) * aspect);
      const headingDeg = CesiumMath.toDegrees(camera.heading);
      const { sun: s, earth: e, cameraMode: mode } = latest.current;
      const { selectedSite: site, selectedGround: groundM } = readoutRefs.current;
      const key = [mode, headingDeg.toFixed(2), camera.pitch.toFixed(4), hfov.toFixed(4), canvas.clientWidth, canvas.clientHeight, s?.azDeg, s?.visible, e?.azDeg, e?.visible, site?.id, groundM, latest.current.observerHeightM, Math.round(camera.positionCartographic.height)].join('|');
      if (key === lastKey) return;
      lastKey = key;
      const compass = compassRef.current;
      if (compass && mode === 'surface') {
        const markers = [];
        if (s) markers.push({ azDeg: s.azDeg, color: palette.current.sun, label: 'SUN', hidden: s.visible === null ? null : !s.visible });
        if (e) markers.push({ azDeg: e.azDeg, color: palette.current.earth, label: 'EARTH', hidden: e.visible === null ? null : !e.visible });
        // The tape is narrower than the canvas: give it the FOV that its own width spans.
        const tapeFov = 2 * Math.atan(Math.tan(hfov / 2) * (compass.clientWidth / Math.max(canvas.clientWidth, 1)));
        drawCompass(compass, headingDeg, tapeFov, markers, palette.current.accent, palette.current.font);
      }
      const readout = readoutRef.current;
      if (readout) {
        const parts: string[] = [];
        if (site) parts.push(`${site.latDeg.toFixed(3)}° ${site.lonDegE.toFixed(3)}°E`, `ground ${groundM >= 0 ? '+' : '−'}${Math.abs(groundM).toFixed(0)} m`);
        if (mode === 'surface') {
          const heading = Math.round(((headingDeg % 360) + 360) % 360) % 360;
          parts.push(`eye +${latest.current.observerHeightM} m`, `FOV ${CesiumMath.toDegrees(hfov).toFixed(0)}°`);
          readout.title = `heading ${heading}°, pitch ${formatSigned(CesiumMath.toDegrees(camera.pitch))}`;
        } else {
          parts.push(`alt ${(camera.positionCartographic.height / 1000).toFixed(0)} km`);
        }
        readout.textContent = parts.join(' · ');
      }
    });
    setReady(true);

    return () => {
      removeBodySizing();
      bodyBillboards.current.length = 0;
      const diagnostics = window as unknown as Record<string, unknown>;
      if (diagnostics.__dbgViewer === viewer) delete diagnostics.__dbgViewer;
      removePostRender();
      removeProgress();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKey);
      handler.destroy();
      viewerRef.current = null;
      skyRef.current = null;
      materialRef.current = null;
      setReady(false);
      if (!viewer.isDestroyed()) viewer.destroy();
    };
  }, []);

  // 2. Terrain source → terrain provider, refined near the selected site so the rendered
  //    skyline matches the horizon mask (see README "3D ↔ chart consistency").
  const focusLat = selectedSite?.latDeg;
  const focusLon = selectedSite?.lonDegE;
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || !terrain) return undefined;
    if (terrain.type === 'heightFunction') {
      const focus = focusLat === undefined || focusLon === undefined ? null : { latDeg: focusLat, lonDegE: focusLon };
      viewer.scene.terrainProvider = createHeightFunctionProvider(terrain, focus);
      viewer.scene.requestRender();
      return undefined;
    }
    // Path for later real data (Trek-style quantized mesh). Not exercised by the mock prototype.
    let cancelled = false;
    void CesiumTerrainProvider.fromUrl(terrain.url).then((provider) => {
      if (!cancelled && !viewer.isDestroyed()) viewer.scene.terrainProvider = provider;
    });
    return () => { cancelled = true; };
  }, [terrain, ready, focusLat, focusLon]);

  // Surface material (realistic regolith or elevation colour).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || !range) return;
    const detail = quality === 'high';
    if (materialRef.current) updateSurfaceMaterial(materialRef.current, range, surfaceMode, detail);
    else {
      materialRef.current = createSurfaceMaterial(range, surfaceMode, detail);
      viewer.scene.globe.material = materialRef.current;
    }
  }, [ready, range, surfaceMode, quality]);

  // Render quality.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    const { scene } = viewer;
    scene.shadowMap.size = SHADOW_SIZE[quality];
    // Keep the existing FXAA preset without claiming an unmeasured speedup.
    scene.msaaSamples = 1;
    scene.postProcessStages.fxaa.enabled = true;
    scene.globe.maximumScreenSpaceError = SSE[quality][cameraMode];
    // Balanced Surface caps fill cost at 0.75x; this changes render resolution,
    // never observer coordinates. The base scale remains capped at 2x CSS pixels.
    viewer.resolutionScale = Math.min(1, 2 / window.devicePixelRatio) * (quality === 'balanced' && cameraMode === 'surface' ? 0.75 : 1);
  }, [quality, cameraMode, ready]);

  // Coverage edge (orbital only): amber ring so out-of-coverage (flat dark grey) reads as "no data".
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || !terrain || cameraMode !== 'orbital') return undefined;
    const lat = terrain.coverage.northDeg;
    const positions: Cartesian3[] = [];
    for (let lon = 0; lon <= 360; lon += 2) positions.push(Cartesian3.fromDegrees(lon, lat, 50, Ellipsoid.MOON));
    const material = Color.fromCssColorString(palette.current.mock).withAlpha(0.7);
    const edge = viewer.entities.add({
      id: 'coverage-edge',
      polyline: { positions, width: 1.5, material, depthFailMaterial: material, clampToGround: false, arcType: 0 },
    });
    return () => { removeEntities(viewer, [edge]); };
  }, [terrain, ready, cameraMode]);

  // 3. Ground heights at sites (sync for height functions).
  useEffect(() => {
    if (!terrain) { setGround({}); return undefined; }
    if (terrain.type === 'heightFunction') {
      const next: Record<string, number | null> = {};
      for (const s of sites) next[s.id] = sampleGroundHeight(terrain, s.latDeg, s.lonDegE);
      setGround(next);
      return undefined;
    }
    // quantizedMesh: sample the rendered terrain. [UNTESTED path]
    let cancelled = false;
    void (async () => {
      const provider = await CesiumTerrainProvider.fromUrl(terrain.url);
      const points = sites.map((s) => Cartographic.fromDegrees(s.lonDegE, s.latDeg));
      const sampled = await sampleTerrainMostDetailed(provider, points);
      if (cancelled) return;
      const next: Record<string, number | null> = {};
      sites.forEach((s, i) => { next[s.id] = sampled[i]?.height ?? null; });
      setGround(next);
    })();
    return () => { cancelled = true; };
  }, [terrain, sites]);

  // 4. Site markers.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return undefined;
    const added: Entity[] = sites.map((site) => {
      const selected = site.id === selectedSiteId;
      const mock = site.category === 'mock';
      const position = surfacePosition(site, ground[site.id] ?? 0, MARKER_LIFT_M);
      return viewer.entities.add({
        id: SITE_PREFIX + site.id,
        position,
        point: {
          pixelSize: selected ? 13 : 8,
          color: selected ? Color.WHITE : Color.fromCssColorString(palette.current.accent),
          outlineColor: mock ? Color.fromCssColorString(palette.current.mock) : Color.BLACK,
          outlineWidth: selected ? 3 : 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
          show: cameraMode === 'orbital',
        },
        label: {
          text: siteLabel(site),
          font: `${selected ? 600 : 500} ${selected ? 13 : 12}px ${palette.current.font}`,
          style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: selected ? Color.WHITE : Color.fromCssColorString('#d7e4ec'),
          outlineColor: Color.fromCssColorString('#05070a'),
          outlineWidth: 4,
          verticalOrigin: VerticalOrigin.BOTTOM,
          horizontalOrigin: HorizontalOrigin.LEFT,
          pixelOffset: new Cartesian2(10, -8),
          show: cameraMode === 'orbital' && labels,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    });
    return () => { removeEntities(viewer, added); };
  }, [sites, selectedSiteId, ground, cameraMode, labels, ready]);

  // 5. Sun light + shadows from the selected site's local frame.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    const lightDir = selectedSite && sun
      ? skyDirectionFixed(selectedSite.latDeg, selectedSite.lonDegE, sun.azDeg, sun.elDeg)
      : selectedSite
        ? skyDirectionFixed(selectedSite.latDeg, selectedSite.lonDegE, 0, 60)
        : ([0, 0, -1] as const);
    // DirectionalLight.direction is the way the light travels: away from the Sun.
    viewer.scene.light = new DirectionalLight({
      direction: new Cartesian3(-lightDir[0], -lightDir[1], -lightDir[2]),
      intensity: 2,
    });
  }, [selectedSite, sun, ready]);

  // Earth disc images, one per quantized phase angle (cached; generation is async).
  const earthPhaseKey = useMemo(() => {
    if (!selectedSite || !sun || !earth) return null;
    const s = skyDirectionFixed(selectedSite.latDeg, selectedSite.lonDegE, sun.azDeg, sun.elDeg);
    const e = skyDirectionFixed(selectedSite.latDeg, selectedSite.lonDegE, earth.azDeg, earth.elDeg);
    const phase = CesiumMath.toDegrees(Math.acos(CesiumMath.clamp(-(s[0] * e[0] + s[1] * e[1] + s[2] * e[2]), -1, 1)));
    return Math.round(phase / EARTH_PHASE_STEP_DEG) * EARTH_PHASE_STEP_DEG;
  }, [selectedSite, sun, earth]);
  useEffect(() => {
    if (earthPhaseKey === null || earthImages.has(earthPhaseKey)) return undefined;
    let live = true;
    void earthImage(earthPhaseKey).then((canvas) => {
      if (live) setEarthImages((previous) => new Map(previous).set(earthPhaseKey, canvas));
    });
    return () => { live = false; };
  }, [earthPhaseKey, earthImages]);

  // 6. Sky: Sun and Earth directions at the selected site.
  useEffect(() => {
    const viewer = viewerRef.current;
    const sky = skyRef.current;
    if (!viewer || !ready || !sky) return;
    bodyBillboards.current.length = 0;
    sky.billboards.removeAll();
    sky.labels.removeAll();
    sky.lines.removeAll();
    if (!selectedSite || !groundKnown) return;
    const surface = cameraMode === 'surface';
    const origin = surfacePosition(selectedSite, selectedGround, surface ? observerHeightM : MARKER_LIFT_M);
    const distance = surface ? SKY_DISTANCE_SURFACE_M : SKY_DISTANCE_ORBITAL_M;
    const sunDir = sun ? skyDirectionFixed(selectedSite.latDeg, selectedSite.lonDegE, sun.azDeg, sun.elDeg) : null;
    const add = (kind: 'sun' | 'earth', body: BodyDirection | null) => {
      if (!body) return;
      const dir = skyDirectionFixed(selectedSite.latDeg, selectedSite.lonDegE, body.azDeg, body.elDeg);
      const position = offsetPosition(dir, distance, origin);
      const color = kind === 'sun' ? palette.current.sun : palette.current.earth;
      if (surface) {
        // True apparent size (pixel size from the angular diameter and the current FOV; updated
        // on zoom in postRender); depth-tested so rendered terrain occludes it.
        let billboard: Billboard | null = null;
        if (kind === 'sun') {
          billboard = sky.billboards.add({ id: 'sky:sun:disc', position });
          billboard.setImage('sun-disc', sunImage());
          bodyBillboards.current.push({ billboard, diameterM: sizeAt(distance, SUN_DIAMETER_DEG) * SUN_GLOW_SCALE });
        } else if (earthPhaseKey !== null) {
          const image = earthImages.get(earthPhaseKey);
          if (image) {
            billboard = sky.billboards.add({ id: 'sky:earth:disc', position });
            billboard.setImage('earth-phase-' + earthPhaseKey, image);
            bodyBillboards.current.push({ billboard, diameterM: sizeAt(distance, EARTH_DIAMETER_DEG) * EARTH_PAD_SCALE });
            if (sunDir) {
              // Image "up" = sunward: align with the Sun direction projected across the line of sight.
              const k = sunDir[0] * dir[0] + sunDir[1] * dir[1] + sunDir[2] * dir[2];
              const axis = new Cartesian3(sunDir[0] - k * dir[0], sunDir[1] - k * dir[1], sunDir[2] - k * dir[2]);
              if (Cartesian3.magnitude(axis) > 1e-6) billboard.alignedAxis = Cartesian3.normalize(axis, axis);
            }
          }
        }
        if (body.visible !== true) {
          // Hidden or unknown: an always-on-top dashed marker shows where the body is.
          const marker = sky.billboards.add({ id: 'sky:' + kind + ':marker', position, width: 30, height: 30, disableDepthTestDistance: Number.POSITIVE_INFINITY });
          marker.setImage(`marker-${kind}-${visibleToState(body.visible)}`, skyIcon(kind, visibleToState(body.visible)));
        }
      } else {
        const icon = sky.billboards.add({ id: 'sky:' + kind + ':icon', position, width: 30, height: 30, disableDepthTestDistance: Number.POSITIVE_INFINITY });
        icon.setImage(`icon-${kind}-${visibleToState(body.visible)}`, skyIcon(kind, visibleToState(body.visible)));
        sky.lines.add({ positions: [origin, position], width: 2, material: Material.fromType('Color', { color: Color.fromCssColorString(color).withAlpha(0.75) }) });
      }
      if (labels) {
        const name = kind === 'sun' ? 'Sun' : 'Earth';
        sky.labels.add({
          position,
          text: `${name} ${formatSigned(body.elDeg)} · ${visibilityText(body.visible)}`,
          font: `600 12px ${palette.current.font}`,
          style: LabelStyle.FILL_AND_OUTLINE,
          fillColor: Color.fromCssColorString(color),
          outlineColor: Color.fromCssColorString('#05070a'),
          outlineWidth: 4,
          // De-confliction: the Sun label sits up-right of its body, the Earth label down-left,
          // so the two never overlap even when the bodies share a direction.
          horizontalOrigin: kind === 'sun' ? HorizontalOrigin.LEFT : HorizontalOrigin.RIGHT,
          verticalOrigin: kind === 'sun' ? VerticalOrigin.BOTTOM : VerticalOrigin.TOP,
          pixelOffset: new Cartesian2(kind === 'sun' ? 14 : -14, kind === 'sun' ? -10 : 10),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        });
      }
    };
    add('sun', sun);
    add('earth', earth);
    // Billboard images reach the texture atlas asynchronously; in requestRenderMode nothing
    // would redraw once they land, so request a couple of follow-up frames.
    let frames = 0;
    const settleAtlas = () => {
      if (viewer.isDestroyed()) return;
      viewer.scene.requestRender();
      if (++frames < 10) atlasFrame = requestAnimationFrame(settleAtlas);
    };
    let atlasFrame = requestAnimationFrame(settleAtlas);
    return () => {
      cancelAnimationFrame(atlasFrame);
      bodyBillboards.current.length = 0;
      if (!viewer.isDestroyed()) {
        sky.billboards.removeAll();
        sky.labels.removeAll();
        sky.lines.removeAll();
      }
    };
  }, [selectedSite, selectedGround, groundKnown, cameraMode, observerHeightM, sun, earth, labels, earthImages, earthPhaseKey, ready]);

  // requestRenderMode: redraw after any non-camera change (light, sky, material, quality, sites).
  useEffect(() => {
    const viewer = viewerRef.current;
    if (viewer && ready && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [sun, earth, surfaceMode, quality, labels, cameraMode, sites, selectedSiteId, observerHeightM, earthImages, ground, terrain, ready]);

  // 7. Camera. Flies on site/mode change; never writes camera state back into data.
  const firstCamera = useRef(true);
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready) return;
    // Wait until the ground height of the selected site is known, so we fly once.
    if (!groundKnown) return;
    const { camera, scene } = viewer;
    camera.cancelFlight();
    camera.lookAtTransform(Matrix4.IDENTITY);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = firstCamera.current || reduceMotion ? 0 : 2.2;
    firstCamera.current = false;
    const controller = scene.screenSpaceCameraController;
    (camera.frustum as PerspectiveFrustum).fov = DEFAULT_FOV;
    // Low observers need a close near plane, not an invisible minimum eye height.
    (camera.frustum as PerspectiveFrustum).near = cameraMode === 'surface' ? 0.01 : 1;
    scene.shadowMap.maximumDistance = cameraMode === 'surface' ? 150_000 : 300_000;
    flyingRef.current = true;
    const done = () => { flyingRef.current = false; };
    const easingFunction = EasingFunction.QUADRATIC_IN_OUT;

    if (cameraMode === 'surface' && selectedSite) {
      controller.enableInputs = false;
      // Root cause of the round-2 skyline mismatch: collision detection kept the camera
      // `minimumZoomDistance` (500 m) above terrain, so the "2 m" observer saw a lower skyline.
      controller.enableCollisionDetection = false;
      scene.canvas.style.touchAction = 'none';
      // Put the horizon in the middle of the App's safe area (contract-2 insets) rather than
      // the canvas centre, which floating panels may cover: pitch down by the angle that the
      // safe-area centre sits above the canvas centre (camera state only).
      const safe = safeRef.current?.getBoundingClientRect();
      const box = scene.canvas.getBoundingClientRect();
      const fovy = (camera.frustum as PerspectiveFrustum).fovy ?? DEFAULT_FOV;
      const dy = safe && box.height > 0 ? (box.top + box.height / 2) - (safe.top + safe.height / 2) : 0;
      const lift = Math.atan((dy / (box.height / 2)) * Math.tan(fovy / 2));
      lookRef.current = { headingRad: CesiumMath.toRadians(latest.current.sun?.azDeg ?? 0), pitchRad: CesiumMath.toRadians(3) - lift };
      camera.flyTo({
        destination: surfacePosition(selectedSite, selectedGround, latest.current.observerHeightM),
        orientation: { heading: lookRef.current.headingRad, pitch: lookRef.current.pitchRad, roll: 0 },
        duration,
        easingFunction,
        complete: () => {
          flyingRef.current = false;
          // Pick up an observer-height change that happened mid-flight.
          camera.setView({
            destination: surfacePosition(selectedSite, selectedGround, latest.current.observerHeightM),
            orientation: { heading: lookRef.current.headingRad, pitch: lookRef.current.pitchRad, roll: 0 },
          });
          scene.requestRender();
        },
        cancel: done,
      });
      return () => { if (!viewer.isDestroyed()) camera.cancelFlight(); flyingRef.current = false; };
    }
    controller.enableInputs = true;
    controller.enableCollisionDetection = true;
    scene.canvas.style.touchAction = 'auto';
    if (selectedSite) {
      camera.flyToBoundingSphere(new BoundingSphere(surfacePosition(selectedSite, selectedGround, 0), 2_000), {
        offset: new HeadingPitchRange(CesiumMath.toRadians((latest.current.sun?.azDeg ?? 0) + 180), CesiumMath.toRadians(-32), 110_000),
        duration,
        easingFunction,
        complete: done,
        cancel: done,
      });
    } else {
      // Oblique overview of the covered south-polar cap.
      camera.flyToBoundingSphere(new BoundingSphere(new Cartesian3(0, 0, -Ellipsoid.MOON.maximumRadius), 120_000), {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-58), OVERVIEW_RANGE_M),
        duration,
        easingFunction,
        complete: done,
        cancel: done,
      });
    }
    return () => { if (!viewer.isDestroyed()) camera.cancelFlight(); flyingRef.current = false; };
  }, [selectedSite, selectedGround, groundKnown, cameraMode, ready]);

  // Observer height change in surface mode: move the eye, keep the look direction.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !ready || cameraMode !== 'surface' || !selectedSite) return;
    if (flyingRef.current || !groundKnown) return;
    viewer.camera.setView({
      destination: surfacePosition(selectedSite, selectedGround, observerHeightM),
      orientation: { heading: lookRef.current.headingRad, pitch: lookRef.current.pitchRad, roll: 0 },
    });
    viewer.scene.requestRender();
  }, [observerHeightM, selectedSite, selectedGround, groundKnown, cameraMode, ready]);

  const mock = terrain?.provenance.kind === 'mock';
  const surface = cameraMode === 'surface';
  return (
    <div className="lunar-viewer" data-camera-mode={cameraMode}>
      <div ref={containerRef} className="lunar-viewer__canvas" />
      {failure && <div className="lunar-viewer__failure" role="alert">3D view unavailable: {failure}. The data panels still work.</div>}
      {/* Every overlay lives inside the App-provided safe insets (contract-2). */}
      <div ref={safeRef} className="lunar-viewer__safe">
        {surface && <canvas ref={compassRef} className="lunar-viewer__compass" aria-hidden="true" />}
        {/* Sun/Earth state lives in the App's Inspector; here it is announced for screen readers only. */}
        <div className="lunar-viewer__sr" aria-live="polite">{describeBody('Sun', sun)}. {describeBody('Earth', earth)}.{!sun ? ' Lighting: neutral light (no time cursor).' : ''}</div>
        <div className="lunar-viewer__corner">
          {mock && <div className="lunar-viewer__mock" role="status">MOCK DATA · fictional terrain</div>}
          <div className="lunar-viewer__toolbar" role="toolbar" aria-label="3D view options">
            <div className="lunar-viewer__segment" role="group" aria-label="Surface layer">
              <button type="button" aria-pressed={surfaceMode === 'realistic'} onClick={() => setSurfaceMode('realistic')} title="Shaded relief">Relief</button>
              <button type="button" aria-pressed={surfaceMode === 'elevation'} onClick={() => setSurfaceMode('elevation')} title="Elevation colour">Elev</button>
            </div>
            <button type="button" aria-pressed={labels} onClick={() => setLabels((v) => !v)} title="Show labels" aria-label="Labels">Aa</button>
            <button type="button" aria-pressed={quality === 'high'} onClick={() => setQuality((q) => (q === 'high' ? 'balanced' : 'high'))} title={quality === 'high' ? 'High detail (slower)' : 'Balanced (faster)'} aria-label="High detail rendering">HD</button>
            <button type="button" aria-expanded={legendOpen} aria-controls="lunar-viewer-legend" onClick={() => setLegendOpen((v) => !v)} title="Legend" aria-label="Legend">i</button>
          </div>
          {legendOpen && range && (
            <div id="lunar-viewer-legend" className="lunar-viewer__legend">
              {surfaceMode === 'elevation' ? (
                <>
                  <div className="lunar-viewer__ramp" style={{ background: `linear-gradient(to right, ${RAMP_STOPS.join(', ')})` }} />
                  <div className="lunar-viewer__ticks"><span>{range.minM} m</span><span>{range.maxM} m</span></div>
                  <div>Height above the 1737.4 km sphere · 500 m contours</div>
                </>
              ) : (
                <div>Shaded relief: mock heights lit by the Sun at the selected site; hard terrain shadows. Fine craters and mottling are decorative texture, not data.</div>
              )}
              <div className="lunar-viewer__legend-meta">{surface ? 'Sun 0.53° and Earth 1.9° at true angular size. Starfield and Earth texture decorative.' : 'Dark grey = no data · amber ring = coverage edge.'}</div>
              <div className="lunar-viewer__legend-meta">{surface ? 'Drag or arrow keys to look · wheel or ± to zoom.' : 'Drag to orbit · wheel to zoom · click a site.'}</div>
            </div>
          )}
        </div>
        {!terrain && <div className="lunar-viewer__loading" role="status"><span className="lunar-viewer__spinner" aria-hidden="true" />Loading terrain…</div>}
        <div className="lunar-viewer__readout-row">
          {terrain && streaming && <span className="lunar-viewer__streaming" role="status"><span className="lunar-viewer__spinner" aria-hidden="true" />Streaming</span>}
          <div ref={readoutRef} className="lunar-viewer__readout" aria-hidden="true" title={surface ? 'Drag or arrow keys to look · wheel or ± to zoom' : 'Drag to orbit · wheel to zoom · click a site'} />
        </div>
      </div>
    </div>
  );
}
