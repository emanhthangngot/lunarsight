# Current project state

Updated: **14 November 2026**. This is the concise starting point for the team and agents.

## Established facts

- Project: **LunarSight — Lunar Landing Site Explorer & Mission Planner**.
- Repository: **emanhthangngot/lunarsight**, created as private.
- Current user instruction: keep work reviewable through a new branch and PR. The initial data-mining feature priorities are now recorded in [ADR 0002](decisions/0002-data-mining-feature-scope.md); exact data products, coverage, versions, and acquisition remain undecided.
- The team's proposal is preserved as a [historical reference](reference/proposal-v2.md). It informs requirements; it is not proof of a backend or validated science in this repo.
- The [shared testing policy](testing-policy.md) governs agent test creation, selection and maintenance. It does not select a stack/data product or authorize runtime implementation.
- Initial source validation found that NASA Data Book reference centers do not fall inside the inspected PGDA 78 ROI polygons; they are not substitutes for ROI or landing-point geometry. Small reads verified valid pixels at all four centers in the local 5 m LDEMs and PGDA 90 80 m/20 m LDEMs. Exploratory 80 m/20 m horizon profiles at 20 km and 25 km show material angular differences at Site01, Site11 and Site23. 80 m-only profiles to 50 km still peak in the outer 10% for 93/94/35 azimuths at Site01/11/23. JPL documents the current high-precision Horizons lunar surface frame as DE421 `MOON_ME`, despite the DE441 ephemeris provenance. Site selection, ROI coverage, horizon extent, and acceptable angular error remain undecided.

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

Resolve exact pilot sites, data products/footprints, time cadence, and validation references against the accepted scope in ADR 0002. Agree an angular tolerance, observer points and horizon/relief scenario, then extend the 80 m profiles to that distance and determine whether Site23's 80S edge limits the result. Obtain a verified Site23 ROI if available. Bulk dataset acquisition and application implementation have not started; a later explicit request is required for those steps.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
