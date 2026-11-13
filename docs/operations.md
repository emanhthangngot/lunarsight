# Proposed development and operations model

**Status: planning document.** No runtime, dependency installation, infrastructure, cloud account configuration, scheduled download, deployment, telemetry service, or operational budget has been created for this setup. All technologies, providers, limits, and retention periods remain to be agreed by the team.

Basis: the integrated workflow and reliability goals in the [LunarSight V2 proposal](reference/proposal-v2.md). Related documents: [architecture](architecture.md), [API design](api-design.md), [data proposals](data-sources.md), and [roadmap](roadmap.md).

## Environment responsibilities

| Proposed environment | Purpose | Decision still needed |
| --- | --- | --- |
| Documentation workspace | Review requirements, source candidates, architecture, decisions, and agent handoffs | This is the current phase; no application run command exists yet. |
| Local development | Implement a bounded approved feature with controllable inputs and useful diagnostics | Runtime, package manager, rendering stack, and minimum machine resources. |
| Shared preview or staging | Review integrated behavior, data coverage, accessibility, exports, and representative failures | Hosting, access, deployment trigger, test data policy, and cost limits. |
| Production or public demo | Serve a reviewed release with declared capabilities, operating limits, and recovery procedures | Intended audience, uptime/cost targets, access model, release process, and support owner. |

These are responsibilities, not a requirement to create four separate hosted environments. A small team may combine stages if the chosen scope and risk permit it.

## Storage options to evaluate

Keep repository documentation, future source code, small purposeful fixtures, and versioned metadata in Git. Large source products and generated scientific artifacts need an explicit storage decision before acquisition.

Local files may be sufficient for a bounded development example. Shared object storage could serve versioned assets and large outputs if a deployed application needs them. A metadata index may begin with files or use a database when query, concurrency, persistence, and ownership needs justify it. None of these options has been selected.

The future acquisition inventory should distinguish expected bytes, downloaded bytes, validated assets, processing copies, and generated results. Source-size estimates are not approved budgets. Storage forecasts should state their assumptions and be revised from a bounded trial rather than from guessed runtime behavior.

Retain original provenance and a recoverable connection between processed products and their inputs. Decide which originals can be reacquired, which outputs can be regenerated, which reports must remain reproducible, and when caches may be evicted. No retention period is committed here.

## Long-running analysis and cost

- Define maximum area, time span, resolution, concurrent jobs, and retained outputs for each supported request class.
- Estimate work from the normalized request and selected products before launching expensive processing.
- Make retries idempotent and distinguish transient source failures from permanent unsupported inputs.
- Record actual progress only when the unit of work is meaningful; use an indeterminate state rather than an invented percentage.
- Publish completed artifacts consistently and mark interrupted or incomplete outputs so they cannot satisfy a cache lookup.
- Implement cancellation semantics that report actual worker state and account for work already completed.
- Agree cloud/provider spending limits, advisor request limits, and any paid dependency before provisioning or enabling them.

Execution mode, worker placement, queue technology, resource limits, and timeouts remain implementation decisions. The current documentation does not start background work.

## Secrets and external services

Future provider keys should remain in approved local environment configuration or a deployment secret store. Browser-delivered bundles, source files, examples, logs, and reports should not contain credentials. An AI advisor, if selected, should call its provider through an appropriate server-side boundary.

The team should decide which external services receive scenario inputs and user inquiries. Send only the evidence needed for the chosen function; keep provider/model identity and failure behavior explicit. Third-party prose and source metadata are untrusted content and must not become execution instructions for an advisor or development agent.

Accounts and collaboration are optional product decisions. If enabled, define ownership of projects, scenarios, result artifacts, and conversations before exposing persistent APIs. Public source data alone does not make all user-created analysis or conversation data public.

## Observability proposal

| Signal | Purpose | Limits to preserve |
| --- | --- | --- |
| Request/job/result identifiers | Follow an analysis across submission, processing, presentation, and export | These identifiers should reference the actual scenario revision. |
| Stage durations and resource use | Locate bottlenecks and revise supported request budgets | Record measurements before claiming performance guarantees. |
| Source access and validity outcomes | Distinguish network failure, unsupported coverage, and unusable source samples | A successful HTTP response is not scientific validation. |
| Cache hit and version information | Explain reuse and diagnose stale or mismatched results | Expose relevant scientific versions to the user. |
| Error categories and cancellation outcomes | Support recovery and clear UI states | Avoid logging secrets or full private inquiries by default. |
| Advisor availability and usage | Diagnose provider failures and bound optional cost | Keep advisory failure separate from deterministic analysis success. |

The logging/metrics provider and retention policy are undecided. An initial implementation can use a simpler setup if it preserves useful identity, privacy, and recovery information.

## Release and recovery expectations

A future release should identify its application revision, scientific method versions, supported data products, coverage, known limitations, and representative validation evidence. It should disclose any unsupported features still shown as explanatory placeholders.

Prefer changes that preserve prior result identities. If scientific results change, record why and retain enough inputs and metadata to explain the difference. Database or artifact-format migrations, if introduced, need a reversible or recoverable plan appropriate to their impact.

Before deployment, demonstrate recovery from a source outage, interrupted job, unavailable advisor, and a stale client request. Define how the team disables a broken feature or returns to a known release. Backup and restore expectations depend on the persistence option ultimately selected.

## Readiness questions before provisioning

- What exact feature slice and dataset selection has the team accepted?
- Which environments and users need access, and does the first release require saved accounts or projects?
- Which workloads run in the browser, request handler, or background execution?
- What measured resource envelope supports a representative request?
- Which assets/results must survive a deployment or machine failure?
- Who manages secrets, source updates, release review, and spending limits?
- What evidence permits a release to claim the supported scientific and product behavior?

Resolve these questions through documented team decisions and subsequent implementation requests. This operations proposal prepares those decisions; it does not authorize unbounded downloads, paid services, or a deployment.
