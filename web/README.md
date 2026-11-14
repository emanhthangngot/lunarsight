# LunarSight mock workspace

**Implemented and independently production-verified within the exercised mock scope:** Vite + React + strict TypeScript + **local Three.js 0.187.0**, deterministic mock data, synchronized scenario analysis, modern panels, comparison and timeline. The accepted finite terrain viewer replaces the Cesium globe ([ADR 0002](../docs/decisions/0002-mock-first-3d-web.md)); default Ridge/Rim relief clarity **V1 is closed**. Submitted-result identity and mock **1.1.0** behavior remain. **MOCK DATA** stays visible; no validated lunar science or global globe capability is claimed.

## Run locally

Node used for the initial verification: v26.10.0; pnpm: 11.3.0.

```sh
cd web
pnpm install
pnpm dev
```

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm preview
```

`pnpm build` runs `tsc -b && vite build`. `pnpm test` runs the offline Vitest suite with one worker. No server, database, token, downloaded lunar data, environment variables or external service is required.

## Public Vercel demo

**[https://lunarsight.vercel.app](https://lunarsight.vercel.app) — healthy within the anonymous live smoke scope.** The cloud build passed on Node26.x with pinned pnpm11.3.0; actual Three.js terrain, Worker/static delivery, Surface, timeline, site changes, a **10 m** height update and mock provenance were exercised remotely. Exact remote cache/job/transfer counters remain **unverified**; local tests below do not become a remote counter certification.

Deployment used an archived committed `web/` plus local [vercel.json](vercel.json), not a Git auto-deploy/link or a wholly committed artifact. The configuration was uncommitted at initial upload time; pushing setup/docs does not redeploy it. The uploaded app contents are root **`.`**; only a future Git-linked full repository would use Root Directory **`web`**. Follow [operations](../docs/operations.md#vercel-static-mock-deployment) for the clean-source upload/health/recovery route and [the handoff](../docs/handoffs/current.md) for exact identity. The stable alias is public; unique/preview URLs may remain protected. No runtime secrets, real datasets or scientific certification are implied.

## Local Three.js and terrain Worker

Cesium, its static-copy plugin/assets, `CESIUM_BASE_URL` and widget CSS are removed from the active package/Vite/startup wiring. Three.js is pinned to **0.187.0** with matching types; Vite bundles the native module Worker from `src/terrain/localMesh.worker.ts`. No remote terrain, texture service or token is configured.

- `TerrainSource.createMeshLoader()` creates a loader, not a Worker immediately. `load({latDeg, lonDegE, quality}, signal?)` starts real off-main-thread generation on an uncached request. Unsupported Worker/startup/build errors reject; there is **no synchronous geometry fallback**.
- Mesh origin is actual local ground on the **1,737,400 m sphere**. Positions/normals use **xEast / yUp / zSouth**, metres; compute curved Moon-fixed offsets in doubles before Float32 output. The observer is `(0, requestedHeightM, 0)` relative to ground, not a clamped or elevated substitute.
- One indexed welded chunk spans radial density bands ending at **100 m / 1 km / 10 km / 50 km / 150 km**. Shared ring vertices prevent transition cracks. Missing/invalid samples and their faces are omitted, with `partialCoverage: true`; no zero-height terrain is invented. `heightsM` retains original sphere-relative scalar heights for relief color.

Analytic full-coverage upper bounds (not measured timing or GPU memory):

| Quality | Angular segments | Vertices | Triangles | Source buffer bytes |
| --- | ---: | ---: | ---: | ---: |
| balanced | 256 | 80,641 | 161,024 | 4,190,236 |
| high | 512 | 322,561 | 644,608 | 16,767,004 |

The loader owns a **two-entry LRU**, keyed by normalized coordinates and quality, not cursor or equipment height. Its maximum two-high-mesh source-buffer budget is **33,534,008 bytes**, excluding Worker build temporaries, renderer/GPU copies and object overhead. Successful buffers transfer once from Worker to client; cached client arrays must remain immutable and must not be retransferred/detached.

Latest load intent supersedes a pending job. Abort/supersede terminates its Worker, rejects with `AbortError` and ignores stale replies. Completed signals cannot cancel a newer request. `dispose()` rejects pending work, terminates the Worker, removes listeners and clears the cache; further loads reject. The renderer owns loader and GPU-resource cleanup. Scalar science queries create no Worker. A new uncached request after cancellation starts a fresh Worker.

This is a finite local patch, **not a global lunar globe or a real-data adapter**. Independent production checks exercised actual Worker transfer, cache reuse/cancellation, build packaging, navigation, requested heights and bounded sky/geometry agreement. Finite mesh sampling is not exact horizon-mask equivalence: the near-boundary Ridge533 centre-classification discrepancy remains. See [current evidence and limits](../docs/handoffs/current.md), not historical Cesium measurements, for the verified scope.

## Provider boundary

`src/main.tsx` is the sole concrete `MockDataProvider` wiring point. UI components accept `LunarDataProvider` from [`src/data/contract.ts`](src/data/contract.ts); a future processed provider remains pending. The interface retains contract 1 and Amendment A's optional fifth `getEphemeris(..., observerHeightM = 0)` argument, and adds contract 3's required `TerrainSource.createMeshLoader()` boundary.

Entry points:

- `src/data/mock/MockDataProvider.ts`: `MockDataProvider implements LunarDataProvider`.
- `src/data/mock/terrainField.ts`: unchanged pure mock 1.1.0 scalar field and provenance, shared with the Worker.
- `src/data/mock/terrain.ts`: `TerrainSource` adapter and lazy native Worker factory.
- `src/terrain/`: pure mesh builder, Worker protocol/entry, abort-safe bounded-cache client and focused tests.
- `src/geo/coordinates.ts`: longitude normalization, coordinate policy and south-polar stereographic projection.
- `src/geo/topocentric.ts`: ENU basis and finite-distance topocentric azimuth/elevation.
- `src/geo/horizon.ts`: curvature-aware terrain elevation, cyclic mask interpolation and nullable visibility.

All terrain, site, mask and ephemeris outputs include `provenance.kind: 'mock'`, a generator version, a fixed generator epoch, and a warning that they are **not JPL ephemerides or LOLA data**. `generatedAt` records the deterministic generator epoch, not a runtime acquisition timestamp. No real place names or catalog-verified coordinates are asserted.

## Mathematical conventions and limitations

- Moon is a sphere of radius **1,737,400 m**. Heights are metres above that sphere. No refraction, Earth orientation kernels, gravitational model or validated lunar frame realization is included.
- Latitude is strictly between −90° and +90° for observers and terrain queries. Exact poles are rejected because azimuth is undefined. Longitudes normalize to [0°, 360°); 360° becomes 0°. The inverse projection can return the mathematical pole for its plane origin; that is not a supported observer.
- South-polar stereographic plane has +y toward longitude 0° and +x toward 90° E. Synthetic terrain covers −90° < latitude ≤ −84°; the pole itself remains unsupported. Generator **1.1.0** keeps the primary bowls/raised rims, ridge and massif, adds six small secondary craters (radii 1.3–3.8 km), and replaces the sinusoidal streak field with integer-hashed quintic gradient noise. Its six rotated/offset fBm octaves use seed 17, an 18 km initial wavelength, lacunarity 2.03 and amplitude gain 0.45; a separate broad gradient field supplies regional variation. There is no selected tiling period, sine hash or random state. Relief is illustrative, not measured surface elevation; geometry/coverage conventions are unchanged.
- ENU azimuth is clockwise from local north; elevation is above the local sphere-tangent horizontal. `subPointToAzEl` accepts Moon-centre-to-body distance and observer height **above the sphere**, and subtracts the observer vector before ENU projection. This includes finite-distance Earth parallax. Zenith/nadir azimuth is conventionally 0° and has no physical meaning.
- Masks use 360 azimuths at 1° spacing. Rays begin at 25 m; steps are at least 25 m and then grow by 4% of distance. Curvature uses the accepted mock approximation `atan2(Δh − d²/(2R), d)`.
- Maximum mask range is 150 km, reduced to the largest conservative fully covered circle around a site. Read each mask's `maxRangeM`; this is not an infinite-range horizon. Sites outside coverage, or with less than 25 m of supported ray range at its edge, return `null`. Unavailable samples never become zero terrain.
- Ephemeris is analytic, **not JPL**: epoch 2026-01-01T00:00:00Z. Generator **1.1.0** uses a deliberately fictional **110° E** sub-solar longitude at epoch and **−π/2 radians** solar-latitude phase (initial sub-solar latitude −1.543°); Earth longitude/latitude sinusoid phases remain **0**. This separates the default sky markers by about 110° in azimuth and avoids the old coincident-subpoint demo, without claiming a real lunar phase/eclipse prediction. Sub-solar longitude still decreases once per 29.530589 d; latitude amplitude 1.543° with period 346.62 d. Sub-Earth longitude amplitude 7.9°/27.5546 d; latitude 6.68°/27.2122 d. Distances remain Sun 149,597,870.7 km; Earth 384,400 km.
- `getEphemeris` samples UTC epoch milliseconds from the requested start, including the end only if aligned to the step. No extrapolated final sample is inserted. Steps must be at least 1 ms; requests over 1,000,000 samples are rejected to bound memory.
- Amendment A makes `getEphemeris` equipment-height-aware. The observer vector uses local terrain height plus the supplied equipment height (default 0 m for existing callers). The scenario computer passes the same height to both ephemeris and mask computation. Outside terrain coverage ephemeris rejects with `RangeError`; the workspace explicitly clears the unavailable result and explains coverage rather than inventing a ground height.
- Visibility convention v1 is **`center`**: body centre elevation must be strictly greater than the linearly interpolated mask elevation at its azimuth. The fixed convention is documented in provenance and here; no extra field is added to contract 1. Equality is hidden; unknown inputs produce `null`. This is “visible above terrain horizon,” not electrical-power or radio-link performance.

## Workspace and analysis

- Inputs are a **draft** until **Apply scenario**. Site selections, custom coordinates, UTC window, cadence and height remain editable. The viewer, horizon, timeline and metrics continue to show the identified submitted result until the new result is ready. Recomputing is explicitly stale; obsolete asynchronous responses cannot replace a newer request or a loaded comparison.
- Custom coordinates validate through `geo/`; exact poles and nonfinite values reject. Supported coordinate longitudes normalize. A valid but unsupported coordinate remains visible in the draft with an explicit coverage message; applying catches the provider's `RangeError`, removes old scientific results and shows unavailable.
- `state/scenario.ts` owns one reducer and a bounded one-entry mask/ephemeris cache. Window-only edits reuse a site-height mask. Height changes recompute **both** mask and finite-distance ephemeris. Site changes also recompute. Cursor, camera, playback, comparison-save and load actions do not request new scientific calculations.
- `analysis/visibility.ts` uses strict centre-above-mask visibility with cyclic interpolation. Each state applies to `[t_i, t_(i+1))`; the terminal sample receives no extra full step. Percentages and hours are **elapsed-time weighted**, over the actual requested window. For an unaligned end the scenario computer obtains one actual end-point ephemeris sample, yielding a shorter final interval rather than extrapolating data.
- Longest darkness and Earth blackout include runs touching either window edge, clipped to the window. These are not the complete physical durations beyond it. Unknown positive-duration intervals make the affected aggregate unknown; they are never excluded from a denominator to inflate visibility.
- Events are the first detected sample-to-sample transition **after** the cursor. The returned UTC is the right sample boundary, with uncertainty **± one nominal step**; no sub-step interpolation or extra-window event is claimed. No event inside the window returns null. Unknown gaps prevent claiming a later transition as the next event.
- Timeline speed **1× = one simulated hour per real second**; 5×, 20× and 60× are also available. Scrubbing/stepping/event jumps pause playback. Playback stops at the end; pressing Play there restarts at the beginning. The cursor drives all panels and the viewer's Sun/Earth directions.
- Comparison saves up to **three immutable result snapshots**. Draft edits do not modify them. The side-by-side table includes dates, duration, height, step and visibility metrics; highlighted cells differ from the first snapshot. **Load into workspace** restores every scientific input and its matching computed result, resets the cursor and pauses playback. Different windows are explicitly disclosed.
- Controls bound scenarios to 90 days, equipment height 0–1000 m, minimum cadence 60 s and at most 25,000 samples; errors explain how to reduce a request. These are prototype resource bounds, not lunar or mission requirements. Presets 1.2 / 2.5 / 10 m are demo assumptions.
- Scenario state/analysis retain their existing reducer and scalar computation path. The new Worker is **only for terrain mesh generation**, not ephemeris or mask semantics. Historical mask timing is not a universal latency guarantee; stale/pending states remain explicit.

Layout: the Moon viewer is a full-viewport canvas behind floating instruments, not a scrolling card dashboard. The top command bar contains a searchable site switcher (**Ctrl/Cmd+K**), submitted UTC, camera mode, Mission/Inspector toggles, comparison/provenance access and persistent **MOCK DATA**. Mission and Inspector collapse independently at ≥1280 px; at ≤1199 px they become mutually exclusive overlays. Closed drawers stay mounted/inert, preserving custom-coordinate drafts. The bottom timeline dock keeps play, speed, event jumps and three visibility lanes immediately available. **Local sky & horizon** expands a panoramic companion above it; it starts collapsed to prioritize the terrain. Comparison and provenance open in keyboard-contained native dialogs; Escape closes them and restores focus.

`src/theme/tokens.css` defines the shared `--ls-*` interface for UI and viewer: fonts, neutral surfaces, Sun/Earth/mock colors, type/spacing, borders, shadow, blur and motion. Geist and Geist Mono variable fonts and lucide-react icons are self-hosted npm dependencies; no CDN or Google Fonts requests. UTC and coordinates use the mono face; all figures are tabular. Floating surfaces are high-opacity glass so contrast remains readable over bright terrain. Reduced-motion disables travel.

App sets `--viewer-safe-top/right/bottom/left` on `.viewer-stage`, the element containing `LunarViewer`. A ResizeObserver measures command/dock geometry; drawer open/close changes side insets. The viewer consumes these insets for its own overlays. App does not style scene, sky chart internals, shaders or HUD elements. The panoramic wrapper is bounded and locally scrollable when the viewer-owned chart's natural aspect needs more vertical room.

Design direction: “Field of view,” a neutral-black geospatial canvas with retractable instruments; warm-white chrome, semantic solar amber/Earth blue/mock sand, a large tabular Sun elevation and focused snapshot comparison. The full-bleed terrain and connected Sun/Earth/Both lanes replace the old boxed three-column layout. Scientific semantics, submitted-result identity and existing scenario assertions are preserved; the terrain mesh interface changes as documented above.

Surface rendering honors the requested observer height, including 0 and sub-0.5 m values; a clipping plane cannot offset the scientific observer. See [viewer notes](src/viewer/README.md) for the local camera/sky implementation and [the handoff](../docs/handoffs/current.md) for independent production measurements and their limits. Older Cesium observations are historical only.

Default relief uses explicitly labelled **view-relative inspection lighting** to clarify terrain shape, not to predict sunlight. **Fill** toggles the non-shadowing display light/ambient aid; the provider-driven Sun remains the only shadow caster and science/mesh inputs do not change. Decorative Earth texture/starfield are display aids, not measured imagery. The accepted clarity outcome covers default Ridge/Rim views, not every site/date or photorealism; [viewer notes](src/viewer/README.md) own framing and rendering details.

## Verification scope

The unit tests protect coordinate/pole policy, projection direction and round-trip arithmetic, ENU quadrants, tangent/zenith geometry, south-polar near-side geometry, Earth parallax direction, curvature, cyclic interpolation, strict/unknown visibility, provider determinism and missing coverage. Fixtures are hand-checkable synthetic mathematics, not scientific certification. The provider test prints a raw `MASK_TIMING` measurement for one 360-azimuth computation; it deliberately has no machine-dependent timing assertion.

Test admission: the assigned contract requires these scientific/geometric behaviors; sign/axis/unit/parallax errors or zero-filled missing terrain would mislead consumers. No pre-existing executable protection existed. Pure unit tests are the lowest reliable layer for these gaps; browser observation checks the actual shell rather than duplicating its text in permanent UI tests.

Round-two tests extend protection for actual intersection versus marginal visibility, common-sample bounds, duration weighting, window-edge runs, wrap-around azimuth, unknown propagation, cursor-relative/no-event behavior, equipment-height parallax, stale response identity, comparison isolation/capacity and selective terrain recomputation. Existing geometry tests remain the oracle for coordinates and finite-distance direction calculations. Browser scenarios verify the controls and synchronized workspace end to end; no source-text/wiring snapshots are used as product evidence.

The local-mesh tests cover synthetic frame/curvature, normals/winding, welded seams, coverage and client abort/stale/cache/disposal behavior. Controlled client tests alone do not prove real Worker execution; independent round-18 **production-browser** observation additionally verified native Worker generation, buffer detachment, usable cache return after GPU disposal and superseded-build termination.

Final independent round 20 passed **typecheck, tests (7 files / 57 tests) and build**, all exit 0, then exercised the actual production output. It closed V1 for default Ridge **1600×1000** and Rim **1280×900**, verified labelled Fill behavior, 0.25 m Surface/Sun/Earth and no unnecessary mesh builds. Unchanged data/Worker/science paths reused round-18 evidence after hash comparison. The large-chunk warning remains.

The final **616.3 ms first terrain-bearing render** is one local production observation, not a latency guarantee or inter-engine speedup. Shared-host moving-camera measurements were bounded, not monitor FPS or a universal smoothness claim. See [the current handoff](../docs/handoffs/current.md) for measurement scope, retained threshold discrepancy and untested mobile/no-WebGL/unmount-memory/real-data paths. No application runtime checks were rerun during this documentation reconciliation.
