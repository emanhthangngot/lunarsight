# Open decision register

Status: **proposals awaiting team discussion**. None of the options below is selected by its presence in this document. Decision ownership is currently the team; individual owners and dates are unassigned.

| ID | Question | Options to compare | Evidence needed before deciding |
| --- | --- | --- | --- |
| OD-01 | Who is the first demonstration for? | Education/exploration, technical student screening, or another defined audience. | One primary user, a concrete scenario, and what the demo must help them understand. |
| OD-02 | Which exact pilot sites and terrain footprints support the accepted bounded south-polar screening scope? | ADR 0002 accepts a small south-polar site-screening workflow; candidate-footprint options remain selected locations, a wider polar region, or a combination. | Verify names/coordinates and mission status; compare source coverage, horizon extent, and processing/storage limits. |
| OD-03 | Which exact product versions and resolutions support P0/P1 features? | ADR 0002 identifies required evidence categories; candidate products include local detail plus coarser surrounding terrain and a limited uncertainty sample. | Variable definitions, effective resolution, uncertainty, coordinate frame, valid coverage, format, and source availability. |
| OD-04 | What download and storage budget is acceptable? | Small pilot, selected regional layers, or a larger source collection. | Team hardware, available disk, hosting limits, generated-output estimates, and acceptable acquisition cost. The 56.2 GB example is not a default. |
| OD-05 | What time/model fidelity and benchmark cases are needed? | ADR 0002 requires mission-window ephemeris and terrain horizons; cadence, transition refinement, reference cases, and advanced occultation/engineering models remain open. | Intended precision, mission interval, terrain error, independent reference cases, and computation cost. |
| OD-06 | What is the first technology stack? | Client + modular server; lighter browser-focused prototype; separated compute worker only if justified. | Team skills, lunar rendering needs, numerical workload, deployment target, and maintainability. No framework/version is selected. |
| OD-07 | How should projects be saved and shared? | No account/local export; optional accounts; persistent team workspace later. | Actual collaboration need, privacy expectations, and minimum persistence lifecycle. |
| OD-08 | How should the map and terrain be rendered? | Candidate 2D/3D engines and terrain delivery formats to be evaluated. | Lunar coordinate support, tile/mesh compatibility, interaction requirements, and performance evidence. |
| OD-09 | Is an AI advisor needed in the first slice? | Defer; deterministic explanations first; optional provider-backed advisor. | Required value, supported evidence, cost/privacy constraints, provider failure behavior, and evaluation examples. |
| OD-10 | Which prototype catalog labels and values can survive? | Keep proposal coordinates with revised names; deliberately select different coordinates; show only verified entries. | Nomenclature and source checks. Do not silently move a point to match a name or reuse demo science numbers. |
| OD-11 | Where will the application and data live? | Local demonstration; a chosen deployment provider; independently hosted data/compute where needed. | Budget, data access patterns, execution duration, identity/secrets needs, and operational ownership. |
| OD-12 | What licenses and review/release conventions apply? | Team-selected code license and contribution/release process. | Ownership, source data acknowledgements, intended sharing, and collaborators' agreement. |

## Suggested discussion order

Resolve OD-01 first, then OD-02–OD-05 for a bounded use case. Compare stack/storage choices against that use case rather than choosing them from a generic template. Address persistence and the advisor according to the first useful demonstration.

Researching options, drafting contracts, and improving documentation can proceed without pretending these choices have been made. Raise a focused question only when its answer materially blocks the current assigned work.

## Recording a real decision

Create an [ADR](decisions/template.md) with the chosen option, alternatives, rationale, authority, date, consequences, and revisit trigger. Update this register and [project state](project-state.md). A requirement, source link, estimate, or agent recommendation alone is not acceptance.
