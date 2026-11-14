# Decision records

An architecture decision record (ADR) captures one consequential choice, its rationale, and its authority. This repository uses the format in [template.md](template.md); it does not treat every agent suggestion as an accepted decision.

## Register

| ID | Decision | Status | Authority |
| --- | --- | --- | --- |
| [0001](0001-documentation-first.md) | Keep the current bootstrap documentation-only; data and implementation remain proposals. | Accepted for the current phase | Explicit user clarification, 13 November 2026. |
| [0002](0002-data-mining-feature-scope.md) | Prioritize bounded south-polar site screening and terrain-uncertainty analysis; defer broad acquisition and hardware power modeling. | Accepted feature scope; no dataset acquisition selected | Explicit user instruction, 13 November 2026. |

Exact sites, products, footprints, cadence, budget, stack, provider, and operational choices remain in [open decisions](../open-decisions.md). ADR 0002 fixes the feature/data categories to prioritize; it does not select exact datasets or authorize acquisition.

## Lifecycle

Use **Proposed**, **Accepted**, **Rejected**, or **Superseded**. An accepted record states who made the choice and when. Preserve its context when replacing it; add a superseding record instead of silently rewriting history.

Link the relevant requirement IDs and source evidence. Record the consequence and what would justify revisiting the choice. Update project state and affected design documents when a real decision changes them.
