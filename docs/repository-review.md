# Repository setup review — 13 November 2026

Reviewed baseline: `fa4acfb89174d891d2abc43e836255f8440910b1` on `main`, 41 tracked files. Scope: current repository contents, agent entry points, planning documents and contribution templates. This is not an application test audit: no executable application or test suite exists at this revision.

## Assessment

**Suitable as a documentation and agent handoff foundation. Not yet an implementation-ready or scientifically validated demo.** Missing runtime/CI is intentional under the accepted documentation-only phase, not a bootstrap defect. The next constraint is choosing a bounded demonstration and evidence standard, not creating more infrastructure.

| Area | Evidence in the baseline | Assessment |
| --- | --- | --- |
| Scope and truth | `AGENTS.md`, project state, ADR 0001 distinguish proposals, accepted choices, historical observations and verified behavior. | Strong protection against agents inventing readiness or treating the 56.2 GB example as a download commitment. |
| Shared agent context | Root rules, short Claude/Copilot/Antigravity adapters, document index, current handoff. | Sensible single source of guidance. Loading in the team's actual clients remains unverified; text rules alone do not enforce behavior. |
| Product traceability | 18 FRs, 6 NFRs, historical findings HF-001–006, and proposed acceptance evidence. | Useful link between the prototype's known uncertainties and future checks. Priorities are not yet team decisions. |
| Architecture | A shared scenario/result and deterministic analysis separated from optional explanations; deployment boundaries are proposals. | Appropriate foundation for consistency and incremental development; does not force microservices. |
| Scientific integrity | Units, coverage, provenance, unknown values, frames and interpretation boundaries in data/verification documents. | Strong intent; exact data products, reference cases, tolerances and empirical evidence are still absent. |
| Test-generation discipline | Baseline verification plan catalogs future checks but gives no explicit admission/retirement or impact-selection policy. | Gap addressed by the shared testing policy and task/PR hooks in this update. |
| Challenge delivery | Product and roadmap cover a broad workspace while audience, pilot region and method remain open. | Main remaining scope risk: implementing all features before a credible site/date comparison works. |
| Collaboration and release | Contribution rules, issue templates and open licensing/release decision OD-12. | Adequate for setup; license, reviewers and release requirements must be resolved for the team's sharing/submission plan. Repository settings/branch protection were not audited. |

## Changes made by this review

- Added [shared testing policy](testing-policy.md), required from root agent instructions and the workflow. It includes a five-question admission gate, zero-new-test option, offline fixture rules, domain priorities, conservative impact selection, read-only audit semantics, and failure/retirement safeguards.
- Connected the policy to the existing verification plan, task brief, contribution guidance and PR template. Detailed rules remain in one document; tool adapters continue inheriting the root guidance.
- Updated project state and current handoff. No runtime, scripts, test suite, dependency manifest, CI job, dataset, provider or model was introduced.

## Recommended next decisions, not accepted implementation scope

1. **Choose the demonstration (OD-01).** A candidate is: configure a supported site and dates, explain Sun/Earth visibility, change site/date, compare alternatives, and inspect the evidence. Export belongs if selected by the team. This aligns with the challenge's indexed summary; it is a recommendation, not a claim about judging criteria.
2. **Choose the evidence boundary (OD-02–05, OD-10).** Fix a bounded pilot region/product, time interval/cadence, coordinate and height conventions, visibility definition, reference cases and tolerances. Record unavailable quantities explicitly. A full southern-hemisphere dataset is not a prerequisite established by this review.
3. **Select a thin implementation slice (OD-06/08/11).** Pick the simplest stack that can demonstrate the chosen scenario with repeatable local checks. Preserve optional AI, thermal/resource extensions and broader coverage for later decisions (OD-03/09).
4. **Resolve sharing and release needs (OD-12).** Decide license, source attribution, review responsibility and required demonstration evidence. No legal or competition-eligibility conclusion is made here.

## How to evaluate the future test suite

Start with the confirmed behavior and these historical risks: inconsistent overlap metrics (HF-001), false benchmark passes (HF-002), unsupported coverage/values (HF-003), advisor failure isolation (HF-004 if implemented), and unverified load/export flows (HF-005). Historical findings are candidate regression targets, not confirmed bugs in this empty implementation.

A small independently derived calculation case plus a relevant integration check can provide stronger evidence than many render snapshots. Conversely, all panels agreeing on one wrong result is not numerical validation. Keep both distinctions visible in review.

## Evidence and limitations

The current tree was retrieved through GitHub at the reviewed revision and inspected locally. No application build, runtime test, scientific benchmark, client instruction-loading session or CI timing measurement was possible from this documentation-only tree. The [current handoff](handoffs/current.md) records checks performed on this update.

The [testing policy's primary references](testing-policy.md#basis) explain the research basis and the official challenge page retrieval limitation. Source research informs recommendations; it does not resolve the team's open product/data choices or certify mission safety.
