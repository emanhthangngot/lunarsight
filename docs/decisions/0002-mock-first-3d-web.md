# ADR 0002 — Mock-first 3D web viewer behind a data-provider contract

- Status: **Accepted for the mock prototype** (scope); stack choice accepted under delegated authority
- Date: **13 November 2026**
- Authority / decision-maker: explicit user instruction of 13 November 2026 to build the 3D web application with mock data first and connect processed data later. The user also told the orchestrating agent to follow the stack used by the challenge resource sites; the **orchestrating agent selected the stack** under that instruction. The team has not separately reviewed the stack.
- Related requirements and open decisions: FR-005, FR-006, FR-007, FR-008, FR-010; OD-06 and OD-08 (resolved for the mock prototype only). Supersedes the scope limit of [ADR 0001](0001-documentation-first.md) for this bounded step; ADR 0001 is otherwise unchanged.

## Context and problem

The user authorized an implementation step: a 3D web app built first on mock data, with processed real data connected later. No dataset, region, product, or resolution has been selected (see [open decisions](../open-decisions.md) OD-02–OD-04). The official [challenge](../reference/challenge-2026.md) names Moon Trek, LROC QuickMap and JPL Horizons as resources.

Evidence for the stack (probed 13 November 2026, see [candidate data sources](../data-sources.md)):

- Moon Trek's `run.js` package list includes `cesium`.
- LROC QuickMap loads `/assets/cesium-*.js` (its bundle also loads OpenLayers).
- CesiumJS provides `Ellipsoid.MOON` and `CustomHeightmapTerrainProvider`.
- Trek serves quantized-mesh terrain (`marshub.s3.amazonaws.com/moon_v14/layer.json`) with CORS `*`. [INFERENCE: directly consumable by `CesiumTerrainProvider`; not load-tested.]

## Options considered

| Option | For | Against |
| --- | --- | --- |
| **Vite + React + TypeScript + CesiumJS + pnpm + Vitest** | Same engine family as both NASA tools; Moon ellipsoid, custom heightmap and quantized-mesh terrain are built in; typed provider boundary. | Large bundle; Cesium is a heavy dependency; team skills unassessed. |
| three.js / React-Three-Fiber | Flexible, smaller core. | Lunar coordinate handling, terrain tiling and LOD would be hand-built; no direct reuse of Trek terrain. |
| deck.gl | Strong 2D/2.5D data layers. | Weaker fit for first-person surface horizon views of terrain. |

## Accepted choice

1. Build a 3D web viewer in `web/` using **Vite + React + TypeScript (strict) + CesiumJS 1.147.x + pnpm + Vitest**.
2. All data enters the UI through a `LunarDataProvider` contract (sites, terrain, horizon mask, ephemeris). The first implementation is a **mock provider**. Every mock value carries `provenance.kind = 'mock'`, the UI shows a persistent "MOCK DATA" badge, mock sites use fictional names with `nameVerified: false`, and missing values stay explicit (`null`).
3. A later `ProcessedDataProvider` implements the same contract from processed real data; UI code depends only on the contract.

Status: the viewer is **in progress on branch `feat/3d-mock-viewer`**; nothing here is implemented, verified or deployed until recorded in [project state](../project-state.md) with evidence.

## Rationale and evidence

Following the challenge resources' own stack reduces integration risk for later real data (same ellipsoid model, terrain formats). A provider contract lets the UI, conventions and visual design be exercised before any dataset decision, without presenting invented values as science.

## Consequences and follow-up

- Becomes possible: UI/UX work on horizon, Sun/Earth visibility and timeline against mock data.
- Still **not authorized**: dataset acquisition, processing or download scripts, deployment, CI, and any claim that displayed values are real, validated or certified.
- Still open: hosting, backend (if any), and the real terrain delivery format (Trek quantized mesh vs processed DEM tiles), plus OD-01–OD-05 and OD-07, OD-09–OD-12.
- The mock ephemeris and terrain are illustrative; they must not be used for mission conclusions.

## Revisit trigger

Team skills or performance on target devices make Cesium unsuitable; terrain/ephemeris sources chosen later require a different engine; Trek or QuickMap terms or formats prove unusable for the intended use; or the team rejects the delegated stack choice.
