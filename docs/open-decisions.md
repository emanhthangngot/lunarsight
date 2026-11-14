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

## Terrain-horizon comparison decision packet

The following inputs are proposals for team discussion, not approved values. The [pilot inventory](data-mining-plan.md#bounded-80-m--20-m-horizon-profile-comparison) records an unresolved inconsistency between profile runs and missing per-bin reproduction evidence. Discuss roster and mission needs now, but do not use the current p95/profile summaries to select a threshold, resolution or horizon radius until that evidence is resolved.

| Input to decide | Candidate options for discussion | Evidence and practical consequence |
| --- | --- | --- |
| Candidate roster, observer points and footprints (OD-02) | Decide whether the pilot compares the original Site01/04/11/23 cohort, includes screened Site07/Site20, adds Site06/Site42/Haworth, or evaluates other PGDA 78 areas; then select reference/ROI-specific analysis points. | Review the [candidate-site visual notebook](../notebooks/candidate-site-visual-review.ipynb) alongside the inventory. The bounded point screen covers Site01/04/07/11/20/23 only. Metadata/size checks also cover Site06/Site42/Haworth; Site06's PGDA-listed ROI link currently returns not-found, and the PGDA page has no ROI links for Site42/Haworth. The PGDA page lists 27 product entries including Site20v2, an alternate version. None of the reference centers is an approved landing coordinate; selected points require coverage checks again. |
| 80 m / 20 m consistency threshold (OD-03) | Define the required statistic and tolerance from the intended use and reference evidence; the historical 2°, 5°, 7° and 8° examples are not recommendations. | The notebook reproduces supplied p95 numbers, not their calculation. Its threshold groupings are arithmetically consistent with those numbers, but the profile-run inconsistency remains unresolved. Recover/reproduce the profiles before using these values to choose a threshold or scale; report maximum differences too. The 20 m DEM is not ground truth. |
| Relief / horizon coverage scenario (OD-02/OD-05) | Discuss illustrative 5 km relative relief (~131.8 km geometric horizon), 10 km (~186.4 km), or another mission-motivated scenario. | These distances are geometric planning estimates, not observed terrain bounds. Historical edge-maxima reports remain unverified pending profile reconciliation. Site23's estimated outward 80S margin is about 182.5 km; validate relevant rays and coverage before choosing a maximum distance or broader context. |

Suggested record for a decision: exact observer coordinates and ROI/version; the selected angular statistic and threshold; the relief or maximum-ray-distance scenario; and how to handle rays that reach an edge. Record the choice in an ADR with authority and date before using it to finalize a product, footprint, or scale.

## Suggested discussion order

Resolve OD-01 first, then OD-02–OD-05 for a bounded use case. Compare stack/storage choices against that use case rather than choosing them from a generic template. Address persistence and the advisor according to the first useful demonstration.

Researching options, drafting contracts, and improving documentation can proceed without pretending these choices have been made. Raise a focused question only when its answer materially blocks the current assigned work.

## Recording a real decision

Create an [ADR](decisions/template.md) with the chosen option, alternatives, rationale, authority, date, consequences, and revisit trigger. Update this register and [project state](project-state.md). A requirement, source link, estimate, or agent recommendation alone is not acceptance.
