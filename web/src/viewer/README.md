# Viewer: local Three.js terrain view + panoramic sky/horizon chart

`LunarViewer` (WebGL2 via Three.js `WebGLRenderer`) and `SkyHorizonView` (SVG) consume only `data/contract.ts` types and the props in `types.ts` (contract-1 props unchanged; `TerrainSource` per contract-3). They never import `data/mock/*`, the terrain worker or any Cesium code. All displayed data is mock; a persistent **MOCK DATA** badge is shown when `terrain.provenance.kind === 'mock'`.

## Local frame (contract-3)

- Origin: the selected site's real mock ground point (`mesh.origin`, height from `heightAt`), not the sphere surface.
- Axes: **x = East, y = Up, z = South (−North)**, metres. `localFrame.ts`:
  - `toLocal(origin, point)` = (dot(P−O, E), dot(P−O, U), −dot(P−O, N)) with E/N/U at the origin, Moon radius 1 737 400 m — keeps lunar curvature (a point 10 km away at equal height sits ≈ 29 m below the tangent plane).
  - `bodyDirectionLocal(az, el)` = (cos el · sin az, sin el, −cos el · cos az); azimuth clockwise from north.
- Surface camera: exactly `(0, observerHeightM, 0)`. No height floor; 0 m and 0.25 m are honoured. The near plane is 2 cm (logarithmic depth buffer) — clipping only, the eye never moves.
- Site markers and sky use the same origin/basis as the mesh. Scientific doubles stay on the CPU; only local float32 positions go to the GPU.

## Lifecycle

| Resource | Created | Updated | Disposed |
| --- | --- | --- | --- |
| Renderer, scene, camera, OrbitControls, CSS2D label layer, lights, sky, materials | once on mount | imperatively by effects | unmount (RAF cancelled, listeners/observers removed, controls/geometry/material/texture/shadow map/renderer disposed, canvases removed) |
| Mesh loader | per `TerrainSource` via `terrain.createMeshLoader()` | — | on source replacement/unmount (`loader.dispose()`) |
| Terrain mesh | per selected site lat/lon or quality only (`loader.load`) | material swap for Relief/Elevation | on site/quality change or unmount; stale loads are aborted (`AbortController`) and late results ignored |
| GPU geometry | one indexed `BufferGeometry` per chunk, attributes reference the loader's arrays read-only; per-vertex elevation colour built once from `heightsM` | — | `geometry.dispose()`; loader cache untouched |

Timeline, observer height, Sun/Earth and camera changes never reload or rebuild geometry: they update light direction, sky transforms, uniforms and the camera only. While a new site loads, the previous site's ground is removed immediately (never shown as the new site) and a "Building local terrain…" state is shown.

## Rendering

- On-demand rendering: a frame is requested only on a real change (props, resize, safe-area change, pointer/keyboard look, OrbitControls `change`). OrbitControls damping keeps requesting frames only while it is still moving; `prefers-reduced-motion` disables damping. No per-frame allocation, no per-frame buffer or texture creation.
- Safe area: the projection centre is moved to the centre of the App's `--viewer-safe-*` box with `camera.setViewOffset`, so the framed site and the surface horizon are not hidden behind floating panels; all HUD overlays sit inside that box.
- Terrain: neutral grey `MeshStandardMaterial` (Relief) or vertex-coloured elevation ramp (Elev, legend shows the mesh's min/max height above the 1737.4 km sphere). One `DirectionalLight` from the supplied Sun direction (neutral overhead light, labelled, when there is no time cursor); it alone casts shadows.
- Fill (toolbar "Fill", on by default, HUD chip "Fill light · display aid"): a cool-tinted, non-shadowing **inspection light** from the viewer's front-left at 18° elevation (azimuth follows the view; cartographic hillshade convention) plus a faint ambient. It is a display aid, not sunlight: near the pole the Sun is within a few degrees of the horizon (Ridge A default: median n·l ≈ 0.02), so Sun light alone leaves most slopes black or flat, and a hemispheric fill shows only slope steepness, not aspect — together they rendered the default view as near-uniform grey. Off = Sun light only. No geometry, heights or analysis change.
- Default orbital framing: 75 km from the site at 60° elevation, from the Sun's azimuth, so roughly ±30 km of crater rims/ridges sit inside the safe area around the centred site. Manual orbit/Surface unchanged.
- Shadows: one PCF shadow map in a bounded box around the view target (surface ±6 km; orbital up to ±60 km, same 2048/4096 map). They are a display only; the scientific visible/hidden state comes from the horizon mask in props.
- Quality (toolbar "HD"): **Balanced is the default** — pixel ratio capped at 1.5, shadow map 2048, `balanced` mesh. High: pixel ratio ≤ 2, shadow map 4096, `high` mesh (reloads the mesh).

## Sky

- Sun: depth-tested sprite at 0.533° (plus decorative glow; enlarged only during the landing view, see below), 500 km from the camera along the supplied direction. Earth: sphere at 1.90°, lit by the same Sun direction, so its phase is illustrative of the supplied directions only; its texture is procedural and **decorative** (not a map). Stars: seeded decorative points, not a catalogue.
- Terrain hides the discs by depth. Hidden/unknown bodies (from props) also get an always-on-top dashed/dotted ring and a label "hidden below terrain horizon" / "visibility unknown" so occlusion by the rendered mesh is never the only cue.
- Camera modes are both local to the site's loaded footprint (no globe or global zoom). The App labels them **Site overview** (internal `cameraMode: 'orbital'`) and **Ground view** (`'surface'`). Site overview draws direction lines from the site toward the Sun and Earth; Ground view shows the heading compass (azimuth clockwise from north) with Sun/Earth ticks.
- While the App is computing a different site, it passes that site's id with `sun`/`earth` = null. The viewer builds the new footprint under a labelled neutral light ("no Sun direction yet") instead of lighting it with the previous site's Sun.

## Lander and landing showcase (display aid)

`landerScene.ts` owns an illustrative lander (`public/models/lander.glb`, regenerated by `pnpm build:lander` from `scripts/build-lander-model.mjs`; an original generic design, not a real spacecraft) and the "Play landing" showcase. None of it is a trajectory simulation and none of it feeds the analysis.

- Parked lander: 30 m from the site point (so Ground view looks at it, not from inside it), on the rendered ground found by one downward raycast per terrain build. Its azimuth is fixed per build. In Site overview it is scaled with camera distance so it stays visible; the HUD chip "Lander enlarged ×N · not to scale" is shown whenever it is not at true size. Ground view shows it at true size and adds a LANDER tick to the compass.
- Play landing: `onPlayLanding` lets the App move the time cursor first (first sample where `analysis.both` is true; otherwise the cursor stays) and explain it in `landingNote`. The descent path, flame, engine glow and dust are decorative. `prefers-reduced-motion` skips straight to the landed state with still visuals.
- Sun ray and Earth link: their state is exactly the `visible` flag in the `sun` / `earth` props (horizon-mask centre visibility). Visible draws the full ray or travelling wavefronts; hidden draws a short dashed stub tagged "blocked by terrain horizon"; unknown is dotted and tagged unknown. They follow the time cursor while the landing view is open. They do not represent electrical power or radio-link performance.
- Touchdown card: rows come preformatted from the App's already-computed window metrics (`landingSummary`); the viewer derives no values.
- During the landing view the Sun disc is drawn ×4 (chip "Illustrative landing · Sun enlarged ×4 · display aid") and the shadow box shrinks to ±300 m around the lander so it casts a readable shadow; terrain outside that box is temporarily unshadowed. Both revert when the view ends.
- Rendering stays on-demand: frames are requested continuously only during the descent and for at most 45 s of link animation, after which the picture is still. Ending the view, changing site, quality or camera mode stops it and restores the previous camera.

## Known limitations

- The view covers only the loaded local footprint (`mesh.maxRangeM`, up to ~150 km where coverage allows); nothing is drawn beyond it and a "Partial footprint" chip is shown when the builder skipped triangles at the coverage edge. Distant terrain is coarse, so the rendered skyline approximates the horizon mask; the chart and props remain authoritative. Rendered-vs-mask agreement has not yet been measured for this renderer.
- Shadows are bounded to the box above; long shadows cast from terrain outside it are not drawn.
- Site markers are shown in orbital mode for sites inside the loaded footprint only; other sites remain selectable through the App list/search.
- Compass azimuth placement is exact at zero pitch.
