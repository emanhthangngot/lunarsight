# Decision records

An architecture decision record (ADR) captures one consequential choice, its rationale, and its authority. This repository uses the format in [template.md](template.md); it does not treat every agent suggestion as an accepted decision.

## Register

| ID | Decision | Status | Authority |
| --- | --- | --- | --- |
| [0001](0001-documentation-first.md) | Keep the initial bootstrap documentation-only; data and implementation remain proposals. | Accepted; scope limit partly superseded by 0002 records | Explicit user clarification, 13 November 2026. |
| [0002 (web)](0002-mock-first-3d-web.md) | Build a labelled mock-data 3D viewer behind `LunarDataProvider`; processed data remains pending. Stack: Vite + React + TypeScript + **local Three.js** + pnpm + Vitest. | Accepted for the mock prototype; local Three.js viewer verified within mock scope | User mock-first instruction, 13 November 2026; explicit local Three.js choice, 14 November, superseding the initial delegated Cesium renderer. |
| [0002 (data)](0002-data-mining-feature-scope.md) | Prioritize bounded south-polar site screening and terrain-uncertainty analysis; defer broad acquisition and hardware power modeling. | Accepted feature scope; no dataset acquisition selected | Explicit user instruction, 13 November 2026. |
| [0003](0003-pilot-working-agreement.md) | Provisional Site01/Site04 pilot working configuration (`config/pilot-v1.json`: 2.5 km preview, Jan 2027 hourly, 1 m AGL). | Accepted as a revisable working configuration | User-reported team agreement, 14 November 2026. |

> [!NOTE]
> Parallel branches each created an ADR numbered `0002` (`0002-mock-first-3d-web.md` and `0002-data-mining-feature-scope.md`). Both filenames are preserved so existing links remain valid.

Exact sites, final products/footprints, cadence, budget, backend/real-data hosting, and provider choices remain in [open decisions](../open-decisions.md). ADR 0002 (data) fixes the feature/data categories to prioritize; it does not select final datasets or authorize full acquisition.

## Lifecycle

Use **Proposed**, **Accepted**, **Rejected**, or **Superseded**. An accepted record states who made the choice and when. Preserve its context when replacing it; add a superseding record instead of silently rewriting history.

Link the relevant requirement IDs and source evidence. Record the consequence and what would justify revisiting the choice. Update project state and affected design documents when a real decision changes them.
