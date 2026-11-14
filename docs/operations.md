# Development and operations

**Current scope:** user-authorized static **Vercel** hosting for the mock app, with current public health recorded in [project state](project-state.md) and [the handoff](handoffs/current.md). The broader backend, storage, telemetry and budget sections below remain proposals. No dataset, backend, CI, DNS change or paid service is authorized by this hosting exception.

Basis: the integrated workflow and reliability goals in the [LunarSight V2 proposal](reference/proposal-v2.md). Related documents: [architecture](architecture.md), [API design](api-design.md), [data proposals](data-sources.md), and [roadmap](roadmap.md).

## Vercel static mock deployment

### Target and access

The production route is project **`lunarsight`** in scope **`emanhthangngots-projects`**, with stable public alias **[lunarsight.vercel.app](https://lunarsight.vercel.app)**. Boss owns account access and future uploads; verify the intended scope/project/environment before acting. The client needs **no application secrets**; never read or print token/`.env` contents or request pasted tokens. Provider deployment protection may still apply to unique deployment/preview URLs: the public stable alias does not make every URL public. Do not create bypass secrets or disable protection.

### Clean source upload — boss only

The deployed route is **CLI source upload, not Git auto-deploy or a local Vercel project link**. Upload an archive of the explicitly reviewed committed `web/` revision, plus the reviewed local [vercel.json](../web/vercel.json). A live-worktree dry-run included `dist` and TypeScript build metadata despite Git ignores; do not treat `.gitignore` as the CLI upload filter.

For an authorized subsequent Production release, the following recreates the clean layout from the repository, with **HEAD only if that is the intended reviewed revision**. These are owner-run instructions, not commands executed during documentation work:

```bash
set -euo pipefail
repo=$(git rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse HEAD)
snapshot=$(mktemp -d)
git -C "$repo" archive "$revision" web | tar -xf - -C "$snapshot"
cp "$repo/web/vercel.json" "$snapshot/web/vercel.json"
sha256sum "$snapshot/web/vercel.json"
```

Before uploading, inspect the staged file names: no `node_modules`, `dist`, `*.tsbuildinfo`, `.env*` or `.vercel` metadata belongs in the source snapshot. An archive omits uncommitted source changes; stop if those are intended for the release. The explicit local config overlay is the exception, not a claim that every uploaded file is committed. Capture the selected revision/config hash and deployment receipt; clean up only the owned temporary snapshot afterward, never use its path as permanent navigation. No commit/push is implied.

Only after reviewing that snapshot and confirming the Production target, run in the same shell:

```bash
(
  cd "$snapshot/web"
  pnpm dlx vercel@65.15.0 deploy --project lunarsight --scope emanhthangngots-projects --prod
)
```

The **upload directory is `$snapshot/web`**, so the selected Vercel project's **Root Directory is `.`**: it already contains the app files. Do not configure `web` again and produce a `web/web` lookup. If a future authorized workflow instead Git-links the full repository, deliberately set Root Directory **`web`** for that different source layout; no such integration currently exists.

In **Settings → Build and Deployment**, retain **Node.js 26.x**. [vercel.json](../web/vercel.json) and [package.json](../web/package.json) own the Vite preset, pinned **pnpm 11.3.0** frozen-lockfile install, `pnpm build` and `dist` output. No backend Functions, runtime secrets, custom headers/CSP, cross-origin policy or analytics are needed. Use explicit project/scope targeting rather than link/default-account prompts; if owner login has expired, stop for owner authentication rather than using a temporary/anonymous upload workaround.

There is no pathname-based deep-link route in the current workspace; camera/site changes are application state. No wildcard rewrite is added: Worker and static-JS requests must resolve to their real files, not `index.html`.

### Health and redeploy

For each new deployment, open its actual stable alias anonymously in a fresh browser context: confirm readable Three.js terrain and persistent mock/display-aid labels, active module Worker delivery as JavaScript (not HTML), fonts/assets, Orbital/Surface, timeline play/scrub, Ridge/Rim selection and an observer-height update. Check runtime/network errors and mock provenance/unknown/partial-coverage meaning. A build marked READY, HTTP 200 or upload exit 0 alone is insufficient. Exact cache/job/transfer counters need their own valid instrumentation; successful site return or absence of module refetch does not certify them.

New source revisions use the clean upload route above. To rebuild an existing deployment's source, select that deployment in the intended project's **Deployments** list and use **Redeploy**, checking revision/environment; this does not upload newer local edits. Inspect that deployment's build log for failures, limiting excerpts and redacting sensitive output. Recheck actual public health after any redeploy; do not silently create another project or change account/protection settings.

### Recovery

The initial healthy deployment has **no earlier hosted rollback target**. Keep its identity in [the handoff](handoffs/current.md) as a known-good candidate for recovery from a later regression, not as evidence that rollback has been exercised. When an eligible previous Production deployment exists, the authorized owner may use **Production Deployment → Instant Rollback**, verify the prior target/domains, confirm, then recheck the restored URL. Availability depends on permissions/plan; do not buy an upgrade or alter DNS. Rollback may disable automatic Production domain assignment; inspect the resulting state before the next intentional promotion. If no eligible prior target exists, retain failure evidence and plan an authorized clean-source redeploy rather than inventing a rollback target.

Provider route references checked **14 November 2026**: [Vite](https://vercel.com/docs/frameworks/frontend/vite), [project configuration](https://vercel.com/docs/project-configuration), [package-manager selection](https://vercel.com/docs/package-managers), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [CLI deploy](https://vercel.com/docs/cli/deploy), [deployment management/redeploy](https://vercel.com/docs/deployments/managing-deployments), [Instant Rollback](https://vercel.com/docs/instant-rollback). Current deployment identity and bounded live evidence belong in project state/handoff, not a temporary upload path.

## Environment responsibilities

| Proposed environment | Purpose | Decision still needed |
| --- | --- | --- |
| Documentation workspace | Review requirements, sources, decisions and handoffs | Current, alongside the implemented local mock app. |
| Local development | Exercise the bounded mock prototype | Existing commands live in [the web guide](../web/README.md); broader target-device guarantees remain unproven. |
| Shared preview or staging | Review integrated behavior | No separate preview environment or public-preview guarantee; deployment protection remains unchanged. |
| Production or public demo | Serve the bounded static mock app | Stable Vercel alias is publicly healthy within the recorded smoke; see [current state](project-state.md). No backend or scientific certification. |

These are responsibilities, not a requirement to create four separate hosted environments. A small team may combine stages if the chosen scope and risk permit it.

## Storage options to evaluate

Keep repository documentation, application source, small purposeful fixtures and versioned metadata in Git. Large source products and generated scientific artifacts need an explicit storage decision before acquisition.

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

For future service-backed releases, demonstrate recovery from applicable source outages, interrupted jobs, unavailable advisors and stale requests before release. For the current static mock app, use the bounded Vercel health/recovery route above; unimplemented backend/advisor services are not requirements to provision them. Backup and restore expectations depend on any later accepted persistence option.

## Readiness questions before provisioning

- What exact feature slice and dataset selection has the team accepted?
- Which environments and users need access, and does the first release require saved accounts or projects?
- Which workloads run in the browser, request handler, or background execution?
- What measured resource envelope supports a representative request?
- Which assets/results must survive a deployment or machine failure?
- Who manages secrets, source updates, release review, and spending limits?
- What evidence permits a release to claim the supported scientific and product behavior?

Resolve the broader questions through documented decisions and explicit implementation requests. They do not revoke the bounded static Vercel authorization above or authorize downloads, paid services, other infrastructure or real-data claims.
