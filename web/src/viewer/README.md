# Viewer: Cesium lunar view + panoramic sky/horizon chart

`LunarViewer` (3D) and `SkyHorizonView` (2D SVG) consume only `data/contract.ts` types and the props in `types.ts` (contract-1, unchanged). They never import `data/mock/*`.

Everything shown inherits the data's provenance: `LunarViewer` shows a persistent **MOCK DATA** badge when `terrain.provenance.kind === 'mock'`; `SkyHorizonView` draws one when the mask or ephemeris is mock. Nothing here is a measurement.

## Layout contract (contract-2)

- The viewer fills its container (full-bleed). Every overlay (body chips, MOCK badge, streaming state, compass, legend, view toolbar, readout, Cesium attribution) sits inside `--viewer-safe-top|right|bottom|left`, set by the App on the viewer's container.
- In surface mode the camera pitch is lowered so the horizon lands in the middle of the safe area, not behind floating panels (camera state only).
- Colours and fonts come from `--ls-*` tokens (`--ls-sun`, `--ls-earth`, `--ls-mock`, `--ls-accent`, `--ls-font-sans`, `--ls-font-mono`, `--ls-surface-glass`, …) with built-in fallbacks for the dev harness. Cesium labels and the compass read the same tokens once at mount.
- No Orbital/Surface switch here: the App owns it (`cameraMode` prop).
- `SkyHorizonView` fills its container height (min 140 px): the SVG is sized from the plot box with a `ResizeObserver` and taken out of flow; the caption is one line (full text in its tooltip and the SVG `aria-label`).

## How contract data maps to Cesium

| Contract / prop | Cesium |
| --- | --- |
| Moon sphere, R = 1,737,400 m | `Ellipsoid.default = Ellipsoid.MOON` before the `Viewer`; `baseLayer: false`; no ion, imagery, geocoder or atmosphere; zero external requests. |
| `TerrainSource.heightFunction` | `terrain.ts` custom provider building quantized-mesh tiles (33×33) with **smooth vertex normals** from central differences. `null` (no data) → exactly 0 m, drawn flat dark grey. Refinement is capped by distance to the selected site (L13 ≤ 600 m, L12 ≤ 1.5 km, L11 ≤ 5 km, L10 ≤ 15 km, else L9) and stopped past the data (`stopRefiningPastData`, private Cesium API, 1.147.0). |
| `TerrainSource.quantizedMesh` | `CesiumTerrainProvider.fromUrl(url)`; site heights via `sampleTerrainMostDetailed`. **Untested** (path for later Trek-style data). |
| Surface appearance | `reliefMaterial.ts`. *Relief* (default): Lommel-Seeliger regolith photometry lit by the scene light, procedural albedo mottling and bump-mapped small craters (decorative, labelled as such). *Elevation*: colour ramp + 500 m contours + legend. |
| `sun` at the selected site | `scene.light = DirectionalLight` from the site's ENU az/el; terrain shadows (hard, darkness 0.06). `sun = null` → neutral light, labelled. |
| `sun` / `earth` (surface) | Depth-tested discs 400 km along the supplied az/el. Their physical diameter includes decorative padding; a pre-render update converts it to CSS pixels for the actual camera distance, vertical FOV and viewport height. Sun is 0.533° plus glow, Earth 1.9°; Earth texture/phase shading remains decorative. Hidden/unknown centres retain fixed-size dashed markers. The sizing registry and atlas-settle callbacks are cleared when sky content changes or the viewer unmounts. |
| `sun` / `earth` (orbital) | Fixed-size icons 40 km from the site + direction lines. |
| Sky | Cesium's bundled Tycho-2 sky box (decorative starfield, not aligned to the lunar sky). |
| `sites` | Point + label entities; selected = white; amber outline + "· mock" for mock sites; click → `onSelectSite`. |
| `cameraMode` | `orbital`: eased fly-to of the site (or the polar cap). `surface`: eye at ground + `observerHeightM`; drag/arrow keys look, wheel/± FOV; heading compass tape with Sun/Earth markers. |

## 3D ↔ chart consistency

Surface uses **ground + the requested equipment height**, including **0 m and sub-0.5 m** values, consistently for its sky origin, flight destination/completion and live height edits. Camera collision detection is disabled in Surface; its 0.01 m near clipping plane is a rendering setting, not an eye-position offset. Height changes during flight are applied at completion without changing the scientific coordinate or silently narrowing the input range.

The chart's centre-above-mask convention remains authoritative. A partial Sun limb can be rendered even when its centre is hidden. Previous prototype skyline/FPS numbers are not bounds for current mock generator 1.1.0 or the repaired viewer: measure the actual rendered terrain and moving camera. The proposed ≤0.1° / ≥24 fps demo diagnostics are not scientific certification or guaranteed device performance.

## Conventions

- Azimuth: degrees clockwise from local north; elevation above the local sphere-tangent horizontal. `skyGeometry.ts` maps az/el to Moon-fixed axes via `geo/localEnuBasis`.
- Exact poles are never sampled (latitude clamped to ±89.99999°).
- Visibility is body-centre above the terrain horizon; it says nothing about power or radio-link performance.

## Known limitations

- Geographic tiling narrows tiles near the pole; the **Streaming** indicator can resume as view-dependent LOD changes. First visible terrain is not the same as a fully settled skyline. Preset names do not imply a verified FPS.
- Mock generator 1.1.0 uses seeded non-tiling gradient fBm and secondary craters, not the old sinusoidal ripple field. Its fictional epoch phases separate the default Sun/Earth directions; no real lunar phase/eclipse prediction is implied.
- Surface sprites, decorative textures, rendered tile approximation and the provider mask have different roles; inspect actual occlusion/skyline residuals rather than treating a label or screenshot as accuracy proof.
- The compass tape assumes zero pitch for azimuth placement (exact on the horizon).
- No-WebGL fallback and touch gestures are implemented but not exercised on a device.

## Dev harness

`pnpm dev`, then `/src/viewer/dev/harness.html` (optional `?site=mock-ridge-a&mode=surface&cursor=0&h=2`). It mimics contract-2 (full-bleed viewer, floating panel and dock with safe insets). Dev-only; not part of the build.

In development only, `window.__dbgViewer` exposes the current Cesium instance for bounded camera/primitive measurements. It is removed on teardown and is not assigned in production. Public component props remain in `types.ts`; this diagnostic hook is not a product API.
