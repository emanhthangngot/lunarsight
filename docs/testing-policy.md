# Shared testing policy

**Authority:** the repository owner's request on 13 November 2026 to add agent-neutral testing rules for LunarSight's NASA Challenge scope. These workflow rules apply now; executable checks apply only when the corresponding implementation is authorized. No framework, runner, CI workflow, data acquisition, or numerical tolerance is selected here.

Read [project state](project-state.md), the relevant accepted contract/decision, and the affected part of the [verification plan](verification-plan.md). That plan is a risk catalog, not a requirement to generate every listed test. Proposed requirements remain proposed until the task or a decision accepts the relevant behavior.

## 1. Admit a test only for a protection gap

Before creating or expanding a test, answer these five questions briefly in the task or PR. One answer set per coherent change is enough; do not create a new tracking document for every assertion.

1. **Behavior and authority:** what observable behavior changes, or what previously unprotected requirement is being implemented? Link its FR/NFR, accepted task, decision, or confirmed defect. The implementation itself is not the specification.
2. **Failure:** what plausible mistake would harm the scenario comparison, scientific interpretation, or user workflow? Name the wrong observable result.
3. **Existing evidence:** which existing checks already protect it? Inspect their assertions and fixtures, not just filenames or coverage percentages.
4. **Lowest reliable layer:** can a unit/property test prove it, or does it cross a parser, data adapter, state boundary, API, or browser interaction that needs integration/E2E evidence?
5. **Decision:** reuse, extend, add, or add none? State the remaining gap and why the selected check closes it.

For documentation-only edits use content review. For a behavior-preserving refactor with adequate existing checks, add no test. For a genuine bug, prefer a minimal reproducer that fails for the intended reason before the fix and passes after it. For new behavior, demonstrate sensitivity to a representative wrong result when safe and practical; report when this evidence is unavailable. Do not create permanent mutation infrastructure merely to satisfy this step.

No test-per-function quota, test count target, arbitrary coverage gate, fixed test-layer ratio, or blanket test generation. Coverage can reveal investigation areas; it does not prove correct science or independent protection.

## 2. What earns a place in the suite

- Exercise application behavior through the narrowest meaningful boundary. Assert actual values, identities, units, states, and effects that matter to the contract.
- Derive expected answers independently: a hand-worked small case, documented mathematical property, or frozen external reference with provenance. Do not call the implementation under test to manufacture its expected answer.
- Prefer extending a suitable test or a small parameterized boundary table to duplicating whole setups. Do not enumerate every site, date, language, and layer combination without distinct risk.
- Mock external I/O at a boundary. Keep the scientific calculation under test real. A mock returning its own configured answer proves neither geometry nor source compatibility.
- Use properties with their assumptions stated. Agreement between two panels proves consistency, not accuracy; protect the underlying calculation separately.
- Reject tautologies, import-only checks with no identified packaging risk, snapshots of huge scenes/DOM trees, private-function call-count assertions, and tests that repeat production formulas. Small snapshots or interaction assertions are acceptable when they protect an explicit contract and are reviewed as such.
- A smoke test protects a critical path that actually executes. A page rendering or HTTP 200 alone does not prove correct mission metrics.

## 3. LunarSight priorities and candidate evidence

The challenge focus is rapid comparison of lunar sites/dates using Sun/Earth geometry and understandable visibility windows. The table is a recommended risk ordering for an accepted implementation slice, not approval of all proposed features. Select relevant cases from [the verification plan](verification-plan.md); preserve the requirement definitions in [the register](requirements.md).

| Risk / traceability | Smallest useful evidence when implemented | Escalate when needed |
| --- | --- | --- |
| Missing science becomes a valid zero or a passing assessment — FR-004/006/009/018, NFR-002, HF-003 | Small fixtures with valid zero, nodata, outside coverage, and partial evidence; check availability and denominator rules. | Adapter-to-result and export checks when availability crosses boundaries. |
| Wrong lunar location, angle, height, or time — FR-002/004/007/008, NFR-002 | Independent coordinate/time examples: longitude wrap, invalid input, near/exact pole policy, degrees/radians, meters/kilometers, ground vs observer height, UTC/model-time conversion. | A pinned geometry reference after frames, kernels/provider, cadence, and tolerances are accepted. |
| Misleading sunlight/Earth overlap or event durations — FR-007/008/009, HF-001 | Hand-worked visibility sequences: intersection, all visible/hidden, missing intervals, clipped runs, equality and interval boundaries. | Adapter/integration checks for time weights, transition interpolation, and displayed summaries. |
| Benchmark label contradicts its evidence — FR-013, HF-002 | Residual below/equal/above an accepted tolerance; circular residuals; missing/unrun reference yields unavailable/unrun, never pass. | Reference display/export preserves units, method, source, and result status. |
| Stale or cross-contaminated scenario — FR-001/010/011/018, NFR-001 | State/integration cases for out-of-order responses, trial isolation, cache identity, load and reset. | A browser journey only for the real interaction/wiring not already proven below it. |
| Report changes the meaning — FR-015/017, NFR-002/006 | Contract check for scenario/result ID, values, units, UTC meaning, provenance, missing state, and language-independent numbers. | Browser print/download and legibility review for the affected output. |
| Advisor invents evidence or disables core analysis — FR-014, NFR-005, HF-004 | Offline boundary fixtures for missing/conflicting evidence, timeout and unavailable provider; deterministic results stay authoritative. | Explicitly scoped live evaluation if the advisor is selected; never exact prose matching as a correctness oracle. |
| User cannot complete the comparison — NFR-003, HF-005/006 | Relevant component/integration checks and keyboard/status review. | Small representative E2E journey: configure supported scenario, inspect results, change site/date, compare, export if in scope; also inspect unsupported-input behavior. |

**Example of a useful oracle:** for four equal-duration, fully known intervals, Sun states `[1,1,0,0]` and Earth states `[1,0,1,0]` imply 50% for each and 25% simultaneous visibility. This is a synthetic arithmetic example, not lunar data or an adopted sampling policy. It catches substitution of `min(sun, earth)` for the actual intersection. Unknown or unequal intervals require the accepted weighting/coverage policy.

Advanced terrain, thermal/resource layers, full-area processing, power/battery budgets, radio-link budgets, accounts, and AI do not earn speculative test suites before they belong to an authorized feature. Visibility evidence alone must not be described as electrical-power, link-performance, or landing-safety validation.

## 4. Fixtures and scientific references

Use small, deterministic, offline fixtures for normal development. Synthetic fixtures must say what property they demonstrate and must never be labeled measured NASA data. If real source subsets are later authorized, retain source URL/product/version, checksum, extraction extent, coordinate frame, units, nodata/scaling convention, and extraction method. Preserve applicable attribution and redistribution conditions.

For geometry references retain site coordinates, height convention, epoch/time scale, observer/target, reference frame, geometric/apparent and correction settings, provider/kernel versions and coverage, expected values, residual convention, and justified tolerance. A second wrapper around the same calculation is not an independent oracle; disclose shared upstream dependencies when comparing tools.

Distinguish source pixel spacing from effective accuracy. Tolerances must follow the accepted method, data uncertainty, cadence, and intended use; neither display rounding nor an agent's convenient epsilon is authority. Reference agreement only validates the conditions exercised, not terrain obstruction or untested regions.

No live NASA/JPL calls, whole-pole downloads, paid model calls, real credentials, or uncontrolled network access in ordinary offline tests. Live contract checks, large scientific benchmarks, browser/GPU workloads, and provider evaluations belong to separately scoped runs with explicit inputs, cost/resource bounds, and actual results. A fixture/mock run must be reported as such.

## 5. Select checks by impact

These are **conceptual groups**, not existing commands or CI jobs. Use actual repository commands only after implementation defines them. Record changed paths, affected contracts/consumers, selected groups, and reasons for excluding relevant groups. Start narrow; preserve all mandatory repository gates.

| Change | Selection once the relevant checks exist |
| --- | --- |
| Documentation or instruction rules only | Links, consistency, traceability, templates, diff; no application suite for prose alone. If docs intentionally change an implemented contract, include its affected checks. |
| Pure metric or geometry logic | Focused unit/property cases, relevant scientific reference cases, then consumers of changed outputs. |
| Data parser, frame, units, fixture, kernel or product metadata | Data/geometry checks plus affected metrics, result contracts and exports; a fixture update is not documentation-only. |
| Shared schema, result identity, state or cache | Producer/consumer integration checks, regression cases, and relevant comparison/export journeys. |
| UI, translation or report | Affected component/output checks; browser/visual/accessibility evidence where interaction or layout is the contract. |
| Dependency, runner, build, shared configuration, uncertain impact | Broaden to the applicable full offline suite and required build/check gates. Do not infer safety from a path filter alone. |

Consider indirect imports, shared fixtures, generated artifacts, configuration, renames and deletions. Unmapped changes or an unavailable/untrusted diff base broaden to the full applicable suite; never silently select zero tests. Deterministic ordering should keep mandatory checks first, then the most consequential affected contracts, using stable identifiers to break ties. Record the actual base/head when selection uses a diff.

Do not build an impact-manifest system until a real suite and measured need exist. A future manifest must include dependencies, mandatory groups, fallback behavior and selected/skipped reasons. A release/demo should run the applicable full offline suite, critical journey, and scientific reference evidence required for its claims. Unavailable required evidence limits or blocks those claims; passing a subset does not establish release readiness.

## 6. Audit, maintenance and failures

**Audit is read-only by default.** Rank findings by consequence, then evidence and measured maintenance cost. Report location, protected contract, weakness (tautology, duplication, outdated expectation, skip, flake, costly setup), remaining protection, and proposed action. Similar names, overlapping line coverage, or overlapping sampled mutation kills alone do not establish redundancy.

When suite changes are authorized, compare protected contracts, regression history, fixtures/boundaries, failure sensitivity, and measured runtime before consolidating, moving a test to a lower layer, or retiring it. Show where each distinct protection remains; review the remaining suite together and rerun affected checks. An audit request alone does not authorize deletions. Do not ask again for maintenance work already explicitly authorized.

When a test fails, distinguish product regression, incorrect test expectation, stale fixture, environmental failure, and nondeterminism. If the intended behavior changed, cite the accepted change before updating the expectation. Never loosen tolerances, overwrite goldens, swallow errors, remove assertions, or skip/delete a failure just to make CI green. A legitimate reference refresh needs provenance, an explained delta, and renewed comparison evidence.

A quarantine/skip must have a reason, tracked owner, follow-up/removal condition, and an honest statement of the lost protection within authorized maintenance scope. Preserve the original failure and rerun outcome; retries do not erase flakiness. Never report a skipped, blocked, or unexecuted check as passed.

Optimization needs a baseline: compare equivalent scope, runner/hardware, fixture versions, cache conditions, duration and flaky behavior before/after. Explain differences; use repeated measurements only where variance matters. No promised speedup, arbitrary CI-minute budget, or coverage percentage is introduced by this policy.

## 7. Completion evidence

Use the existing task/PR/handoff rather than adding a reporting framework. Record:

- The five-question decision, affected requirement/defect, and tests reused/added/changed/removed (including a reason for zero additions).
- Actual commands or manual checks, revision and fixture/reference identity where relevant, outcomes and measured duration where meaningful.
- Passed, failed, blocked, skipped, and not-run evidence separately; reasons for relevant omissions and failure-sensitivity limitations.
- Remaining scientific/product uncertainty, changed protection, and any unresolved decision.

Stop expanding checks once affected behavior and mandatory gates have adequate evidence, unless a new change, failure, or risk warrants more. In the present phase report **documentation verified; application/scientific tests not implemented**, never a fabricated green test run.

## Basis

The five-question admission gate and workflow are project policy requested by the owner. Domain risks come from [requirements and historical findings](requirements.md) and [data quality](data-quality.md). Primary references checked on 13 November 2026:

- [Google: Test Behavior, Not Implementation](https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html) — stable observable contracts.
- [Google: What Makes a Good End-to-End Test?](https://testing.googleblog.com/2016/09/testing-on-toilet-what-makes-good-end.html) — justify expensive system-level checks.
- [NASA Space Apps: Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) — official challenge; an earlier direct page retrieval returned HTTP 502, and the full text was later retrieved through the site's GraphQL API on 13 November 2026 (see [challenge summary](reference/challenge-2026.md)). No additional competition rules are asserted.
- [NASA GSFC: High-Resolution LOLA Topography](https://pgda.gsfc.nasa.gov/products/78) — source grid/frame, interpolation and uncertainty limitations.
- [JPL NAIF: Using SPICE Data](https://naif.jpl.nasa.gov/naif/using_spice_data.html) — kernel applicability, coverage and metadata must be inspected if SPICE is selected.
