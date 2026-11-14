# Decision records

An architecture decision record (ADR) captures one consequential choice, its rationale, and its authority. This repository uses the format in [template.md](template.md); it does not treat every agent suggestion as an accepted decision.

## Register

| ID | Decision | Status | Authority |
| --- | --- | --- | --- |
| [0001](0001-documentation-first.md) | Keep the initial bootstrap documentation-only; data and implementation remain proposals. | Accepted; scope limit partly superseded by 0002 for the mock prototype | Explicit user clarification, 13 November 2026. |
| [0002](0002-mock-first-3d-web.md) | Build a labelled mock-data 3D viewer behind `LunarDataProvider`; processed data remains pending. Stack: Vite + React + TypeScript + **local Three.js** + pnpm + Vitest. | Accepted for the mock prototype; local-renderer cutover in progress/unverified | User mock-first instruction, 13 November 2026; explicit local Three.js choice, 14 November, superseding the initial delegated Cesium renderer. |

Dataset, hosting, backend, and provider choices remain in [open decisions](../open-decisions.md). No dataset ADR has been accepted.

## Lifecycle

Use **Proposed**, **Accepted**, **Rejected**, or **Superseded**. An accepted record states who made the choice and when. Preserve its context when replacing it; add a superseding record instead of silently rewriting history.

Link the relevant requirement IDs and source evidence. Record the consequence and what would justify revisiting the choice. Update project state and affected design documents when a real decision changes them.
