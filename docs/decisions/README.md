# Decision records

An architecture decision record (ADR) captures one consequential choice, its rationale, and its authority. This repository uses the format in [template.md](template.md); it does not treat every agent suggestion as an accepted decision.

## Register

| ID | Decision | Status | Authority |
| --- | --- | --- | --- |
| [0001](0001-documentation-first.md) | Keep the current bootstrap documentation-only; data and implementation remain proposals. | Accepted for the current phase | Explicit user clarification, 13 November 2026. |

Product, data, stack, provider, and operational choices remain in [open decisions](../open-decisions.md). No technology or dataset ADR has been accepted.

## Lifecycle

Use **Proposed**, **Accepted**, **Rejected**, or **Superseded**. An accepted record states who made the choice and when. Preserve its context when replacing it; add a superseding record instead of silently rewriting history.

Link the relevant requirement IDs and source evidence. Record the consequence and what would justify revisiting the choice. Update project state and affected design documents when a real decision changes them.
