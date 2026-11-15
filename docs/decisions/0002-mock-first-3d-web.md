# ADR 0002 — Mock-first 3D web viewer behind a data-provider contract

- Status: **Accepted for the mock prototype; renderer revised to local Three.js**
- Date: **13 November 2026; renderer revision 14 November 2026**
- Authority / decision-maker: explicit user instruction of 13 November to build with mock data first and connect processed data later. The orchestrating agent initially selected Cesium under the instruction to follow the challenge resources' stack. On 14 November the user explicitly accepted a **local Three.js representation prioritizing smoothness/effectiveness**, rather than further global Cesium tuning. This supersedes the renderer choice, not the mock-only boundary.
- Related requirements and open decisions: FR-005, FR-006, FR-007, FR-008, FR-010; OD-06 and OD-08 (resolved for the mock prototype only). Supersedes the scope limit of [ADR 0001](0001-documentation-first.md) for this bounded step; ADR 0001 is otherwise unchanged.

## Context and problem

The user authorized an implementation step: a 3D web app built first on mock data, with processed real data connected later. No dataset, region, product, or resolution has been selected (see [open decisions](../open-decisions.md) OD-02–OD-04). The official [challenge](../reference/challenge-2026.md) names Moon Trek, LROC QuickMap and JPL Horizons as resources.

Historical evidence for the initial Cesium choice (probed 13 November 2026, see [candidate data sources](../data-sources.md)):

- Moon Trek's `run.js` package list includes `cesium`.
- LROC QuickMap loads `/assets/cesium-*.js` (its bundle also loads OpenLayers).
- CesiumJS provides `Ellipsoid.MOON` and `CustomHeightmapTerrainProvider`.
- Trek serves quantized-mesh terrain (`marshub.s3.amazonaws.com/moon_v14/layer.json`) with CORS `*`. [INFERENCE: directly consumable by `CesiumTerrainProvider`; not load-tested.]

## Original options considered

| Option | For | Against |
| --- | --- | --- |
| **Vite + React + TypeScript + CesiumJS + pnpm + Vitest** | Same engine family as both NASA tools; Moon ellipsoid, custom heightmap and quantized-mesh terrain are built in; typed provider boundary. | Large bundle; Cesium is a heavy dependency; team skills unassessed. |
| three.js / React-Three-Fiber | Flexible, smaller core. | Lunar coordinate handling, terrain tiling and LOD would be hand-built; no direct reuse of Trek terrain. |
| deck.gl | Strong 2D/2.5D data layers. | Weaker fit for first-person surface horizon views of terrain. |

## Accepted choice

1. Build the mock viewer in `web/` using **Vite + React + strict TypeScript + Three.js 0.187.0 + pnpm + Vitest**. Use a finite local terrain patch for Orbital/Surface views, not a global globe. This replaces the original CesiumJS 1.147.x renderer.
2. All scientific data enters through `LunarDataProvider`. Every mock value carries `provenance.kind = 'mock'`, the UI retains "MOCK DATA", sites remain fictional with `nameVerified: false`, and missing values remain explicit.
3. `TerrainSource` retains scalar height queries for science and supplies an abortable Worker-backed local-mesh loader. Geometry uses curved Moon-relative coordinates, bounded near/far detail and a bounded cache; missing samples are omitted, not zero-filled. The modern UI, scenario identity and mock generator **1.1.0** arithmetic remain unchanged.
4. A future processed-data adapter remains **pending**, not implemented. Real datasets, formats and delivery infrastructure are not selected by this renderer decision.

Implementation and independent production acceptance for the bounded mock paths are recorded in [project state](../project-state.md); that evidence, not this engine decision or earlier Cesium results, determines what is verified. The renderer remains finite/local, not a global globe, validated science or a universal-performance guarantee.

## Rationale and evidence

The original Cesium rationale was alignment with the challenge resources' ellipsoid and terrain formats; that historical evidence remains above. The revised choice follows the user's preference for effective local navigation rather than more global-engine tuning. Off-main-thread mesh generation and finite budgets are implementation choices, **not measured smoothness or FPS evidence**. The provider boundary continues to separate mock UI development from real-data/scientific claims.

## Consequences and follow-up

- Becomes possible: UI/UX work on horizon, Sun/Earth visibility and timeline against mock data.
- Still **not authorized**: dataset acquisition, processing or download scripts, deployment, CI, and any claim that displayed values are real, validated or certified.
- Still open: hosting, backend (if any), and the real terrain delivery format (Trek quantized mesh vs processed DEM tiles), plus OD-01–OD-05 and OD-07, OD-09–OD-12.
- The mock ephemeris and terrain are illustrative; they must not be used for mission conclusions.

## Revisit trigger

Measured local-view limitations, target-device performance, or subsequently accepted real terrain/ephemeris requirements justify revisiting this choice. No universal FPS, exact skyline agreement or scientific certification follows from choosing an engine.
