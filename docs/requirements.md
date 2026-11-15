# Requirements and proposal traceability

**Status: draft requirements for discussion. No requirement is marked implemented.** The authorized scope is documentation plus a mock-data viewer prototype in progress ([ADR 0002](decisions/0002-mock-first-3d-web.md)). Dataset selection, data quantities, geographic coverage, hosting, providers, dates, and storage budgets remain team decisions.

The source of product intent is the [LunarSight V2 proposal](reference/proposal-v2.md), 5 November 2026. Section numbers below refer to that document. Acceptance conditions describe future behavior to verify; they are not records of passing tests.

**Mock prototype mapping (in progress, not verified, not implemented):** the mock viewer on branch `feat/3d-mock-viewer` is intended to exercise FR-005 (3D terrain navigation), FR-006 (overlays/mode context, mock-labelled), FR-007 (local horizon and Sun/Earth direction), FR-008 (timeline) and FR-010 (site comparison) against a `LunarDataProvider` boundary. Mock values satisfy none of these requirements' scientific acceptance conditions.

## Functional requirements

The identifiers are stable discussion references. Initial feature priorities are recorded in [ADR 0002](decisions/0002-data-mining-feature-scope.md); exact release assignments beyond that scope remain open.

| ID | Capability and proposed behavior | Proposal section | Future acceptance condition |
| --- | --- | --- | --- |
| FR-001 | Shared workspace: maintain one selected scenario and identified result across panels. | 3, 13, 14 | Map, horizon, timeline, assessment, comparison load, advisor context, and report expose the matching scenario/result identity; stale results are marked or replaced. |
| FR-002 | Mission configuration: support named profile presets and editable mission assumptions. | 4 | Inputs show explicit start/end UTC, duration interpretation, observer height, and constraint values; preset defaults remain distinguishable from sourced requirements. |
| FR-003 | Candidate discovery: support understandable search, filters, and selection. | 5.1–5.2 | Empty results, selected results, category meanings, and coordinate-search behavior are defined; names and mission associations have provenance. |
| FR-004 | Custom coordinates: validate location and assumed elevation against supported conventions and coverage. | 5.3 | Invalid coordinates are rejected clearly; equivalent longitudes and pole cases follow documented rules; an unsupported or partially covered point does not receive fabricated values. |
| FR-005 | Terrain navigation: provide orbital/surface inspection and a meaningful scale. | 6.1 | Camera state and scientific coordinates remain distinct; location annotations and the displayed terrain refer to the correct supported area. |
| FR-006 | Thematic modes and overlays: support appropriate terrain/environment context when evidence exists. | 6.2–6.3 | Each enabled scientific layer exposes its meaning, units, source/version, coverage, scale, and data type; unavailable layers have a useful state. |
| FR-007 | Local horizon: explain the Sun/Earth direction and relevant terrain obstruction. | 7 | Displayed angles use stated conventions and the selected observer height; the visibility definition and obstruction sampling are inspectable. |
| FR-008 | Mission timeline: synchronize time navigation, geometry, tracks, and event information. | 8.2 | Scrubbing or stepping selects the matching instant; next-event behavior handles no event and out-of-window events; display precision matches the calculation cadence. |
| FR-009 | Operational screening: explain constraint checks and their underlying values. | 8.1 | Each constraint has a result, threshold, unit, evidence status, and explanation; missing evidence is distinguishable from pass/fail; the score is not presented as mission-success probability. |
| FR-010 | Scenario comparison: compare independent alternatives and load a selected trial into the workspace. | 9.1 | Trial inputs are isolated; loading transfers all advertised settings; metrics use explicit, comparable definitions and disclose different intervals or evidence coverage. |
| FR-011 | Sensitivity exploration: examine controlled changes relative to a preserved baseline. | 9.2 | Each trial records changed inputs and matching results; Reset restores the baseline; the interface does not describe a heuristic explanation as formal sensitivity analysis. |
| FR-012 | Site dossier: present source-based attributes, context, and limitations. | 10.1 | Catalog statistics and mission-window outputs have distinct labels; unsupported thermal/resource fields remain unavailable; narratives do not imply live telemetry. |
| FR-013 | Provenance and benchmark view: make scientific evidence and checks inspectable. | 10.2, 15.2–15.3 | Reference and computed values, residual convention, units, tolerance, source/version, and calculated status are shown; unrun checks are not displayed as passed. |
| FR-014 | AI advisor: explain an identified result and handle missing inputs or service failure. | 11 | Responses reference the scenario evidence used; missing engineering inputs are surfaced; advisor failure does not disable deterministic analysis or export. |
| FR-015 | Assessment and export: preserve the reasoning behind a preliminary comparison. | 12.1 | Report and structured export agree on inputs, metrics, constraints, units, source/model versions, limitations, and generation identity; print output is readable. |
| FR-016 | Explorer and Planner: provide educational and technical presentations of the same evidence. | 12.2 | Changing presentation does not silently change scenario values or scientific definitions; educational additions are explicitly specified. |
| FR-017 | English and Vietnamese: provide consistent language switching. | 12.3 | Navigation, controls, statuses, errors, technical definitions, reports, and chart alternatives have reviewed translations; values and unit meanings are preserved. |
| FR-018 | Processing states: explain waiting, missing, partial, failed, canceled, and stale results. | 14, 15.4; supporting requirement | A user can identify what happened and the next supported action; an old or partial result is not silently presented as current and complete. |

## Cross-cutting requirements

| ID | Proposed requirement | Future evidence |
| --- | --- | --- |
| NFR-001 | Reproducibility and consistency | A recorded scenario and its selected data/model versions reproduce the result within documented tolerances; all views consume that result. |
| NFR-002 | Scientific semantics and coverage | Coordinate frame, units, height datum, resolution/cadence, uncertainty, and missing-data rules survive calculation and export. |
| NFR-003 | Accessible interpretation | Core tasks support keyboard use, visible focus, readable contrast, textual status, and alternatives to color-only/chart-only meaning. |
| NFR-004 | Defined performance and resource limits | The team selects representative workloads and targets before timing claims; processing exposes limits and responsive states without claiming unlimited coverage. |
| NFR-005 | Controlled external services and credentials | Provider credentials are kept out of client responses and Git; external data and advisor inputs have documented boundaries. |
| NFR-006 | Clear product claims | UI, documentation, and exports distinguish intended features, implemented behavior, observed results, and independently validated results. |

## Scientific acceptance rules to resolve and preserve

- Use one documented coordinate and time interpretation, including longitude normalization, height datum, frame conversions, and the treatment of an exact pole.
- Define the scenario interval, time step, visibility convention, and handling of partially observed intervals before deriving percentages or longest runs.
- Keep catalog long-term fractions, instantaneous states, and selected-window summaries distinct.
- For the same complete interval and samples, simultaneous availability is the intersection of Sun and Earth visibility. It must satisfy the corresponding set bounds.
- Keep the map's slope visualization threshold separate from the mission's allowable slope. State the terrain scale of either result.
- Treat hydrogen, permanent shadow, modeled ice stability, and local water-ice mass percentage as different quantities. A named data source alone does not validate a derived quantity.
- Preserve differences among surface temperature, subsurface temperature, seasonal averages, and annual extrema.
- State whether an apparent missing field can be sourced, modeled with defined assumptions, or should remain unavailable. Never replace missing science with a demo value.

These are interpretation requirements. Numerical tolerances and eligible products must be selected with the relevant method and evidence, not inferred from this document.

## Historical findings requiring resolution

The proposal records issues observed in a prototype on 5 November 2026. The following priorities concern future release claims; they do not describe defects detected in an implemented version of this repository.

| Finding | Historical observation | Proposed significance | Resolution evidence |
| --- | --- | --- | --- |
| HF-001 | Assessment and timeline reported different availability values; the displayed overlap was incompatible with the stated fractions under one common interval. | Blocking reliable scenario interpretation. | Identify each metric's interval/definition and verify all same-window displays against a shared state sequence. |
| HF-002 | The benchmark view showed pass labels alongside values inconsistent with its stated residual tolerance. | Blocking scientific-validation claims. | Clarify whether columns are residuals or absolute coordinates; recompute status from documented comparisons. |
| HF-003 | Declared terrain coverage was narrower than some catalog/custom-coordinate options; source accuracy and resource/thermal values were not sufficiently traceable. | Blocking claims for affected locations or variables. | Check selected products, actual footprints, variable definitions, and coverage before enabling a result. |
| HF-004 | The advisor returned a service-unavailable response; successful grounding was not demonstrated. | Blocks a claim of a reliable advisor; should not block the deterministic workflow. | Verify evidence-grounded answers and graceful service failure after a provider is selected. |
| HF-005 | Custom-site submission, scenario loading, persistence, JSON payloads, and print output were not fully verified. | Unverified behavior, not automatically a confirmed defect. | Execute the agreed end-to-end user journeys and inspect actual outputs. |
| HF-006 | Some language labels remained untranslated; accessibility and narrow-screen behavior needed dedicated review. | Limits usability and bilingual completeness. | Review the agreed language and accessibility coverage against representative workflows. |

Source: proposal sections 5.3, 9, 11, 12, and 15. A later catalog audit may add naming issues with its own evidence; prototype labels must not be treated as independent geographic verification.

## Decisions not made by this specification

The feature matrix does not select the first release's region, candidate coordinates, source products, raster spacing, total download size, cache timespan, cloud service, AI provider, authentication model, database, or storage capacity. The map/terrain engine and framework are accepted only for the mock prototype ([ADR 0002](decisions/0002-mock-first-3d-web.md)). The prototype's named provider, dates, ranges, and defaults are reference material pending team review.

See [product.md](product.md) for proposed release ordering, [data-sources.md](data-sources.md) for candidate data, [architecture.md](architecture.md) for a proposed system structure, and [verification-plan.md](verification-plan.md) for how future evidence should be gathered.
