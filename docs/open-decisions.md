# Open decision register

Status: **mostly proposals awaiting team discussion**; OD-06 and OD-08 are resolved for the mock prototype only ([ADR 0002](decisions/0002-mock-first-3d-web.md)). None of the other options is selected by its presence in this document. Decision ownership is currently the team; individual owners and dates are unassigned.

| ID | Question | Options to compare | Evidence needed before deciding |
| --- | --- | --- | --- |
| OD-01 | Who is the first demonstration for? | Education/exploration, technical student screening, or another defined audience. | One primary user, a concrete scenario, and what the demo must help them understand. |
| OD-02 | What geographic scope is useful first? | A bounded candidate region; 80–90°S polar analysis; 60–90°S regional screening; 0–90°S context. | Feature value, source coverage, processing/storage constraints, and expected query types. |
| OD-03 | Which products and resolutions are necessary? | Coarse context plus selected detailed regions; broader higher-resolution coverage; on-demand subsets. | Variable definitions, effective resolution, uncertainty, coverage, format, and source availability. |
| OD-04 | What download and storage budget is acceptable? | Small pilot, selected regional layers, or a larger source collection. | Team hardware, available disk, hosting limits, generated-output estimates, and acceptable acquisition cost. The 56.2 GB example is not a default. |
| OD-05 | What time/model fidelity is needed? | Coarse exploratory sampling; refined transitions for selected sites; advanced occultation or engineering models later. | Intended precision, mission interval, terrain error, reference cases, and computation cost. |
| OD-06 | What is the first technology stack? | **Resolved for the mock prototype (13 Nov 2026, ADR 0002):** Vite + React + TypeScript + CesiumJS + pnpm + Vitest in `web/`, selected by the orchestrating agent under the user's instruction to follow the challenge resource sites' stack. | Still open: hosting, backend (if any), persistence, and whether the stack suits the real-data phase (team skills, performance on target devices). |
| OD-07 | How should projects be saved and shared? | No account/local export; optional accounts; persistent team workspace later. | Actual collaboration need, privacy expectations, and minimum persistence lifecycle. |
| OD-08 | How should the map and terrain be rendered? | **Resolved for the mock prototype (ADR 0002):** CesiumJS 3D globe with a procedural mock terrain behind `LunarDataProvider`. | Still open: real terrain delivery format (e.g. Trek quantized mesh vs processed DEM tiles), far-field vs near-field DEM for horizons, and performance evidence. Candidate sources are in [data-sources.md](data-sources.md). |
| OD-09 | Is an AI advisor needed in the first slice? | Defer; deterministic explanations first; optional provider-backed advisor. | Required value, supported evidence, cost/privacy constraints, provider failure behavior, and evaluation examples. |
| OD-10 | Which prototype catalog labels and values can survive? | Keep proposal coordinates with revised names; deliberately select different coordinates; show only verified entries. | Nomenclature and source checks. Do not silently move a point to match a name or reuse demo science numbers. |
| OD-11 | Where will the application and data live? | Local demonstration; a chosen deployment provider; independently hosted data/compute where needed. | Budget, data access patterns, execution duration, identity/secrets needs, and operational ownership. |
| OD-12 | What licenses and review/release conventions apply? | Team-selected code license and contribution/release process. | Ownership, source data acknowledgements, intended sharing, and collaborators' agreement. |

## Suggested discussion order

Resolve OD-01 first, then OD-02–OD-05 for a bounded use case. Compare stack/storage choices against that use case rather than choosing them from a generic template. Address persistence and the advisor according to the first useful demonstration.

Researching options, drafting contracts, and improving documentation can proceed without pretending these choices have been made. Raise a focused question only when its answer materially blocks the current assigned work.

## Recording a real decision

Create an [ADR](decisions/template.md) with the chosen option, alternatives, rationale, authority, date, consequences, and revisit trigger. Update this register and [project state](project-state.md). A requirement, source link, estimate, or agent recommendation alone is not acceptance.
