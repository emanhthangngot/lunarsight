# Current project state

Updated: **14 November 2026**. This is the concise starting point for the team and agents.

## Established facts

- Project: **LunarSight — Lunar Landing Site Explorer & Mission Planner**.
- Repository: **emanhthangngot/lunarsight**, created as private.
- Current user instruction: keep work reviewable through a new branch and PR. The initial data-mining feature priorities are now recorded in [ADR 0002](decisions/0002-data-mining-feature-scope.md); exact data products, coverage, versions, and acquisition remain undecided.
- The team's proposal is preserved as a [historical reference](reference/proposal-v2.md). It informs requirements; it is not proof of a backend or validated science in this repo.
- The [shared testing policy](testing-policy.md) governs agent test creation, selection and maintenance. It does not select a stack/data product or authorize runtime implementation.
- Initial source validation found that NASA Data Book reference centers do not fall inside the inspected PGDA 78 ROI polygons; they are not substitutes for ROI or landing-point geometry. Small reads verified valid pixels at all four centers in local 5 m and PGDA 90 80 m/20 m LDEMs. 80 m profiles to 131.8 km under a provisional 5 km-relief scenario remain radius-limited at Site01, Site11 and Site23; Site04's maximum stays near 19.4 km. JPL documents the current high-precision Horizons lunar surface frame as DE421 `MOON_ME`, despite the DE441 ephemeris provenance. Site selection, ROI coverage, horizon extent, relief scenario and acceptable angular difference remain undecided.

## Current scope

Documentation and declarative contribution/agent guidance only. The current tree has no application source, processing scripts, executable test suite, package dependencies, acquired datasets, or deployment configuration.

An earlier bootstrap imported exploratory processing material. That approach was superseded by the user's documentation-only clarification. The current tree is the source of truth; earlier exploratory work and Git history do not establish approval or current capabilities.

## Decisions not yet made

- Primary audience, demo success measures, and performance targets.
- Exact pilot coordinates/sites, product versions and footprints, resolution mix, time cadence, total data volume, and storage budget. ADR 0002 selects a bounded south-polar site-screening workflow, not a geographic coverage or dataset product.
- Technology stack, map engine, persistence/authentication, hosting, and AI provider.
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

The next decision is documented in the [terrain-horizon comparison packet](open-decisions.md#terrain-horizon-comparison-decision-packet): the team must confirm observer points/ROI, a p95 angular-difference threshold, and the relief or maximum-ray-distance scenario. Three pre-acquisition parts remain: team decision; final coverage/resolution/footprint analysis; and asset manifest plus transfer/storage estimate with an acquisition request. Acquisition, processing and validation are a separate later phase requiring explicit scope. No final data choice has been made.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
