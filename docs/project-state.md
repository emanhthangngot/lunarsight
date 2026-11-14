# Current project state

Updated: **14 November 2026**. This is the concise starting point for the team and agents.

## Established facts

- Project: **LunarSight — Lunar Landing Site Explorer & Mission Planner**.
- Repository: **emanhthangngot/lunarsight**, created as private.
- Current user instruction: keep work reviewable through a new branch and PR. The initial data-mining feature priorities are now recorded in [ADR 0002](decisions/0002-data-mining-feature-scope.md); exact data products, coverage, versions, and acquisition remain undecided.
- The team's proposal is preserved as a [historical reference](reference/proposal-v2.md). It informs requirements; it is not proof of a backend or validated science in this repo.
- The [shared testing policy](testing-policy.md) governs agent test creation, selection and maintenance. It does not select a stack/data product or authorize runtime implementation.
- Initial source research reports that NASA Data Book reference centers do not fall inside inspected PGDA 78 ROI polygons; they are not substitutes for ROI or landing-point geometry. Bounded 9×9 reads were reported at Site01/04/07/11/20/23 in local 5 m and regional 80 m/20 m LDEMs; Site20v2 also had a local 5 m read. Site06/Site42/Haworth received metadata/size checks only. Site07's center lies outside both inspected polygons; Site06's listed ROI link returned not-found; Site20/Site23 ROI bundles were unavailable at checked paths; Site42/Haworth have no ROI links on the PGDA page. This nine-candidate set is not exhaustive. The historical horizon reports and their unresolved limitations are retained in the inventory; no site, product or coverage scenario is selected.
- Pre-decision review now includes nine 2.5 km local DEM previews, including Site06/Site42/Haworth; all nine displayed crops had 250,000/250,000 valid pixels. This does not verify their regional coverage or complete ROI. See the [worksheet](predecision-review.md) and [terrain notebook](../notebooks/terrain-predecision-review.ipynb).
- Review correction, 14 November 2026: the historical horizon/p95 reports have unresolved cross-radius inconsistencies and lack retained per-bin reproduction evidence. They are not a basis for selecting p95 tolerance, resolution or horizon radius; see the [inventory warning](data-mining-plan.md#bounded-80-m--20-m-horizon-profile-comparison). Horizons lunar observer-frame checks use `Center pole/equ`; `0.001 km` in the feasibility query is ellipsoid altitude, not height above terrain.

- The team accepted a revisable Site01/Site04 pilot working configuration: see [ADR 0003](decisions/0003-pilot-working-agreement.md) and [pilot-v1](../config/pilot-v1.json). Full acquisition, final ROI and p95 tolerance remain open.

- A [conditional Site04 observer diagnostic](site04-observer-diagnostic.md) retains two Horizons responses and 80 m nested-radius per-azimuth evidence. It assumes datum compatibility, omits the inner 1 km and is not a validated full horizon or mission visibility result.

- A [conditional 5 m/80 m near/far diagnostic](site04-near-far-review.md) retains 360-bin fusion evidence. It assumes compatible vertical datum and frame; 1 km seam, true-north conversion, far convergence and independent validation remain open.

- [Site04 seam and convergence review](site04-seam-convergence-review.md) compares area-weighted 5 m/80 m overlap and a conditional 50 km profile; 50 km is not established as converged, and datum/reference remain open.

## Current scope

Documentation plus explicitly authorized analysis notebooks for pre-decision review. The current request authorizes bounded local DEM previews, visual comparison and a decision worksheet; native preview arrays are cached under ignored `data/preview/`. Rendered notebook outputs and source/window metadata are retained for review. No production ingestion pipeline, full raster acquisition, application implementation or deployment is authorized by this step.

An earlier bootstrap imported exploratory processing material. That approach was superseded by the user's documentation-only clarification. The current tree is the source of truth; earlier exploratory work and Git history do not establish approval or current capabilities.

## Decisions not yet made

- Primary audience, demo success measures, and performance targets.
- Exact pilot coordinates/sites, product versions and footprints, resolution mix, time cadence, total data volume, and storage budget. ADR 0002 selects a bounded south-polar site-screening workflow, not a geographic coverage or dataset product.
- Technology stack, map engine, persistence/authentication, hosting, and AI provider.
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

Use the [decision packet](open-decisions.md#terrain-horizon-comparison-decision-packet) and [candidate-site notebook](../notebooks/candidate-site-visual-review.ipynb) to discuss roster and mission needs. Before using the historical p95/profile summaries to select a threshold, scale or radius, resolve their documented inconsistency with the original method and per-bin evidence or an explicitly scoped reproduction. Observer points/ROI, tolerance, coverage scenario, exact products and acquisition budget remain open. Site06/Site42/Haworth have metadata-only evidence, not pixel coverage. This research inventory does not authorize acquisition, processing or validation.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
