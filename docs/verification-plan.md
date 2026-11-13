# Verification plan

**Status: proposed plan; no application or scientific test suite is implemented by this document.** The current phase is documentation and repository setup. Future checks depend on the team's decisions about data, methods, scope, and implementation.

The plan follows [requirements.md](requirements.md) and the historical findings in the [original proposal](reference/proposal-v2.md). Passing a repository-content check is separate from demonstrating model accuracy or usable application behavior.

**Selection rule:** apply the [shared testing policy](testing-policy.md) before turning a case below into a test. This is a catalog of future risks, not a requirement to generate every case for every change. Use accepted behavior, existing evidence, and the lowest reliable layer to select only the checks needed; no framework or executable suite is authorized by this plan.

## What can be reviewed now

| Documentation check | Expected evidence |
| --- | --- |
| Scope consistency | README, agent instructions, project state, roadmap, and design documents all identify the current documentation-only phase. |
| Proposal traceability | Intended features retain stable requirement IDs and reference the original proposal; newly proposed behavior is identified as such. |
| Decision honesty | Dataset volumes, region, grid spacing, technology choices, providers, dates, and budgets are marked proposed or undecided unless an explicit team decision is recorded. |
| Repository content | The current branch contains the agreed documentation/configuration only; no processing scripts, application implementation, installed dependencies, data downloads, or provisioning are implied. |
| Navigation | Internal document links resolve, names are consistent, and an agent can find the current state and relevant task documents without reading every reference. |
| Source traceability | Candidate data entries point to primary catalogs; research observations are distinct from product decisions. |
| Agent handoff | A short handoff states completed documentation, open decisions, changed files, verification performed, and the next useful action without invented progress. |

Record the checks actually performed in the handoff or change description. A checklist in this file is not evidence that its entries have passed.

## Future verification layers

### 1. Data acquisition and interpretation

These checks apply only after the team selects a bounded collection and implementation begins.

| Case | Required behavior or evidence |
| --- | --- |
| Source metadata and units | A selected product has an identifier/version, source URL, footprint, frame, height datum, variable definitions, native resolution, and validity rules. |
| Download interruption or mismatch | An incomplete or corrupt transfer is not marked ready; retry behavior preserves the distinction between discovered, downloaded, and verified data. |
| Native sample agreement | Independently chosen valid samples match the original product after documented scaling or transformation, within a justified tolerance. |
| Missing and boundary samples | Nodata, edge cells, partial overlap, and areas outside coverage produce explicit availability states rather than zero-filled science. |
| Resampling | Categorical masks retain valid classes; continuous-field interpolation is documented; grid refinement does not claim finer measurement resolution. |
| Product semantics | Surface/subsurface temperature, seasonal/annual quantities, hydrogen/ice evidence, and source/project-derived values remain distinguishable. |
| Provenance preservation | A displayed or exported value can be traced through the selected source and transformation version. |

### 2. Coordinates, time, and geometry

Choose numerical tolerances from the selected method, source resolution, and intended use. Do not inherit a tolerance simply because the prototype displayed it.

| Case | Required behavior or evidence |
| --- | --- |
| Equivalent longitude | Equivalent locations at 0° and 360° east have consistent interpretation; negative-longitude inputs follow an explicit policy. |
| Longitude wrap in residuals | Angular comparisons use the documented circular convention rather than subtracting wrapped values blindly. |
| Pole and near-pole input | The method handles or explicitly rejects ambiguous local orientation at the exact pole; nearby locations remain well-defined. |
| Height and reference frame | Surface height and equipment height are distinct; source/ephemeris frames and conversion assumptions are recorded. |
| Calendar and interval boundaries | Duration interpretation handles month length and leap dates; start/end inclusivity is consistent across summaries, tracks, and exports. |
| Reference geometry | Retained independent reference cases include inputs, conventions, expected values, residuals, tolerances, and evidence-derived status. |
| Terrain obstruction | Horizon sampling, search radius, interpolation, and near-observer limits are tested separately from celestial position calculations. |
| Numerical refinement | Finer spatial/temporal settings are compared on representative cases before a stronger precision claim is made. |

### 3. Scenario metrics and constraints

- Test intervals with all-visible, all-hidden, alternating, and missing states, using clearly labeled synthetic fixtures when implementation is authorized.
- For identical complete samples, verify `max(0, sun + earth - 1) <= simultaneous <= min(sun, earth)` and derive simultaneous states from the actual intersection.
- Verify how unknown intervals affect coverage and metric denominators. An entirely unsupported result must not receive a successful assessment.
- Test an interval starting inside darkness/blackout, an event ending beyond the interval, no transitions, and no next event. Distinguish a window-clipped run from the full physical event.
- Check threshold equality, unit conversions, missing constraints, and pass/fail/unknown counts against their documented rules.
- Keep a visualization slope threshold separate from the scenario's constraint threshold.
- Check that dates, height, terrain/model versions, or other identity inputs invalidate an inappropriate cached result.

### 4. Integration and user workflows

| Workflow | Required evidence |
| --- | --- |
| Select or change a scenario | Every visible panel refers to the matching inputs/result; old results are not silently mixed with new inputs. |
| Compare and load | Independent trials retain their inputs; loading one transfers all advertised settings and gives the corresponding result. |
| Sensitivity and Reset | A preserved baseline, changed parameter, resulting difference, and restored baseline agree across views. |
| Custom location | Validity, coverage, assumed elevation, partial evidence, and persistence behavior match the chosen product decisions. |
| Pending/failed/canceled analysis | The UI explains state, preserves useful user input, and offers the supported recovery action without labeling partial output complete. |
| Export and print | Exported inputs, metrics, units, provenance, status, and limitations agree with the selected result; printed content is legible and complete. |
| Concurrent changes | Responses from an older request cannot overwrite the active scenario; result identity remains visible and inspectable. |

### 5. Advisor, language, and accessibility

The advisor's provider and model remain undecided. A future evaluation should verify that it uses the identified scenario evidence, cites the supplied sources, preserves missing values, and asks for engineering inputs that are absent. Include unavailable service, timeout, unsupported question, conflicting evidence, and attempts to replace calculated values with unsupported text. Its failure must leave the core analysis and export usable.

Review English and Vietnamese across controls, status messages, scientific terms, errors, tooltips, report headings, and chart descriptions. Check number/date formatting without changing the underlying UTC or unit meaning.

Use representative end-to-end tasks to review keyboard navigation, focus visibility, dialogs, readable contrast, status cues beyond color, and text/table alternatives for charts. Screen-size targets and any formal accessibility target should be agreed and recorded before conformance is claimed.

### 6. Performance and operations

The team must first define representative data sizes, analysis intervals, geographic extents, hardware, concurrency, and resource budgets. Then measure meaningful tasks such as initial map access, scenario completion, cancellation, reuse of a valid cached result, and recovery from source/service failure. Report measured conditions and limits rather than a universal speed or scale claim.

Operational checks should cover secret handling, external-service boundaries, job identity/retries, storage accounting, observability, and restore/recovery appropriate to the chosen deployment. See [operations.md](operations.md).

## Evidence recorded for a future release

For each relevant check, retain the requirement or finding ID, scenario/fixture identity, selected data/model versions, method/settings, expected result or tolerance, observed result, outcome, and limitation. Report unrun, blocked, failed, and passed checks separately.

A documentation milestone may be complete while scientific and application verification remain unstarted. A later release should state exactly which behavior and geographic/data scope its evidence covers; it must not imply NASA/JPL certification or operational landing approval.
