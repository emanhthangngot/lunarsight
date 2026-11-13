# Roadmap and open decisions

Status: **13 November 2026 — documentation-only foundation**.

LunarSight's proposed purpose is to help users connect a lunar location, a mission configuration, and evidence for a preliminary site comparison. This repository currently records that direction, candidate data sources, proposed system design, open decisions, and quality expectations. Data acquisition, processing scripts, application implementation, provisioning, and final technology selection are outside the current scope. Conceptual architecture and API documentation are part of the current work.

Earlier experiments or prototype behavior do not establish team approval of a dataset, calculation method, or implementation. Future stages below are proposals. A later explicit task may authorize one or several implementation stages; do not repeatedly request permission for work that instruction already covers. Record only decisions actually made.

## Current stage — Prepare a reviewable project definition

Maintain concise documentation that the team can discuss and revise.

- Describe the intended audience, scientific questions, and proposed user journeys.
- Maintain the [candidate data register](data-sources.md) with no implied selection or acquisition.
- Record the [data-quality specification](data-quality.md), known ambiguities, and evidence needed for future acceptance.
- Keep implementation status explicit. Documented features and acceptance criteria are not completed capabilities.

## Decisions for the team

| Decision | Options or questions to resolve |
| --- | --- |
| First-version purpose | Education, location exploration, scientific comparison, or mission-oriented screening? Which outcomes matter most? |
| Geographic domain | Selected locations, 60–90°S, 80–90°S, the whole southern hemisphere, or another agreed area? |
| Data products | Which terrain, imagery, thermal, shadow, resource, and ephemeris candidates are necessary? Which can be deferred? |
| Resolution and uncertainty | What detail is justified by the question and available evidence? Which uncertainty must be shown? |
| Time interpretation | Long-term context, seasonal comparisons, or calculations for a particular UTC window? What cadence would be defensible? |
| Site catalog | Which coordinates are authoritative? How should disputed names such as C/Faustini be resolved? |
| Analysis meaning | Which outputs are descriptive, modeled, or threshold-based? Which engineering questions remain outside scope? |
| Resource constraints | What source volume, working storage, computation, and maintenance can the team support? |
| Implementation choices | Architecture, language/frameworks, storage, deployment, and service boundaries remain undecided. |

**Completion criterion for this documentation stage:** the project has a navigable product/system specification, source options, open-decision register, agent workflow, and explicit current status. The team's selections can remain open when the documentation bootstrap is complete; completing the documents does not resolve those decisions.

## Proposed later stage A — Specify the chosen data work

If the team selects products and explicitly requests implementation, define a bounded acquisition and preparation plan before building it.

**Proposed acceptance criteria**

- A product/file inventory identifies exact versions, footprints, variables, units, volume estimates, and attribution.
- The plan distinguishes source originals, metadata, derived products, and temporary files, with an agreed retention policy.
- Integrity checks, missing-data handling, coordinate conventions, and independent sample comparisons are specified.
- A small representative area is proposed for evaluation before wider processing is considered.
- The plan states which work is requested now and which work remains optional.

## Proposed later stage B — Evaluate data suitability

If requested, evaluate the selected products against the documented scientific questions and quality criteria. Acquisition success alone would not establish suitability.

**Proposed acceptance criteria**

- Coverage, valid-observation masks, native resolution, uncertainty, time definitions, and variable semantics are documented.
- Coordinate/name conflicts receive an explicit resolution. No location is moved silently to fit a name.
- Any derived field has a documented method, assumptions, and comparison evidence appropriate to the field.
- Missing ice abundance, annual surface minimum temperature, or other unsupported quantities remain unavailable.
- A team review determines whether to accept the products, change the scope, or investigate alternatives.

## Proposed later stage C — Refine and accept the calculation and system design

The current [architecture](architecture.md), [domain model](domain-model.md), and [API design](api-design.md) are proposals. Before implementing their relevant parts, resolve the decisions needed by the authorized task and refine the design against the chosen data and intended workflows.

**Proposed acceptance criteria**

- Scenario inputs, output meanings, source/model provenance, and temporal conventions are specified before numerical claims are made.
- Terrain horizons, ephemeris geometry, illumination, Earth visibility, and any engineering models have separately stated validation needs.
- Map, timeline, comparison, sensitivity, and report designs refer to consistent scenario results.
- Unsupported coordinates, dates, missing data, loading, and failure states are defined.
- Any advisor feature is grounded in identified results and distinguishes missing evidence from an answer.

## Proposed later stage D — Implement and assess an agreed version

Only after an explicit request, implement the agreed scope and assess it against the accepted specification. Wider geographic coverage, finer resolution, rover routing, thermal simulation, power budgets, radio links, and collaboration remain optional extensions.

A future release would need evidence appropriate to its claims: a source inventory, coverage and quality report, documented calculations, representative comparisons, reproducible reports, and clear limitations. None of these proposed gates is represented as already passed by this repository.
