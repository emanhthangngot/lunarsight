# Current project state

**Production update — 15 November 2026:** PR13 is merged and source `5a34363` is deployed at https://lunarsight.vercel.app using retained static pilot assets, without a hosted backend. Anonymous terrain/Ground and completed two-site comparison checks passed; deployment identity and rollback candidate are in [the current handoff](handoffs/current.md). Older mock-deployment and merge-pending statements below describe the preceding acceptance snapshot, not the current deployment.

## Established facts

- Project: **LunarSight — Lunar Landing Site Explorer & Mission Planner**.
- Repository: **emanhthangngot/lunarsight**, created as private.
- Instruction history: the initial setup was documentation-only ([ADR 0001](decisions/0001-documentation-first.md)). On 13 November 2026 the user authorized a **3D web app built with mock data first, processed real data connected later** ([ADR 0002 — web](decisions/0002-mock-first-3d-web.md)), and separately recorded bounded south-polar data-mining feature priorities ([ADR 0002 — data](decisions/0002-data-mining-feature-scope.md)).
- The team's proposal is preserved as a [historical reference](reference/proposal-v2.md). It informs requirements; it is not proof of a backend or validated science in this repo.
- The [shared testing policy](testing-policy.md) governs agent test creation, selection and maintenance. It does not select a data product.
- The official [challenge statement](reference/challenge-2026.md) (Lunar Landing Site Navigator) was retrieved on 13 November 2026 and is recorded as reference.
- Pre-decision data-engineering findings on `main`: NASA Data Book reference centers do not fall inside inspected PGDA 78 ROI polygons; nine 2.5 km local DEM previews (including Site06/Site42/Haworth) had 250,000/250,000 valid pixels ([worksheet](predecision-review.md), [terrain notebook](../notebooks/terrain-predecision-review.ipynb)). Review correction (14 November 2026): historical horizon/p95 reports have unresolved cross-radius inconsistencies and are not a basis for selecting tolerances or horizon radius ([inventory warning](data-mining-plan.md#bounded-80-m--20-m-horizon-profile-comparison)).
- The team accepted a revisable Site01/Site04 pilot working configuration: [ADR 0003](decisions/0003-pilot-working-agreement.md) and [pilot-v1](../config/pilot-v1.json). Conditional Site04 observer and 5 m/80 m near/far diagnostics ([observer report](site04-observer-diagnostic.md), [near/far report](site04-near-far-review.md)) leave vertical datum reconciliation, 1 km seam validation, and far-field convergence open.

- [Site04 seam and convergence review](site04-seam-convergence-review.md) compares area-weighted 5 m/80 m overlap and a conditional 50 km profile; 50 km is not established as converged, and datum/reference remain open.

- The local [seam-quality review](site04-seam-quality-review.md) samples LDEC, Z error and PGDA 90 effective resolution over the 111 overlap footprints; the [DE pipeline roadmap](de-pipeline-roadmap.md) distinguishes an input pipeline from science validation.

- The [100 km review](site04-100km-review.md) was originally recorded as local-only and retains one valid bounded read; 70/360 far-field peaks occur in its outer 10%, so convergence remains unproven. Later research-PR merges do not turn that conditional history into independent science validation or fresh acquisition authority.

## Current scope

**Implemented and verified within the exercised mock scope (`feat/3d-mock-viewer`):** the accepted **local Three.js 0.187.0** renderer replaces the Cesium runtime ([ADR 0002 — web](decisions/0002-mock-first-3d-web.md)). The modern React workspace, scenario identity and mock **1.1.0** scientific behavior are preserved. The [provider contract](../web/src/data/contract.ts) supplies actual Worker-generated finite curved meshes with a bounded two-entry cache; [scalar terrain](../web/src/data/mock/terrainField.ts) remains shared with [science](../web/src/data/mock/MockDataProvider.ts). This is not a global globe. See the [web guide](../web/README.md) for existing commands and limits.

**Reviewed PR13 source integrated; bounded software acceptance PASS (round42).** The existing [offline pipeline](../scripts/pipeline/build_pilot_assets.py), fifteen retained sites, [static Pilot](../web/src/data/pilot/PilotDataProvider.ts), [API provider](../web/src/data/api/ApiDataProvider.ts) and [local backend](../backend/README.md) support the focused Site01 Connecting ridge / Site04 Shackleton rim comparison. Common-window/cadence/height A/B, automatic site/metric synchronization, three primary Summary metrics and readable local terrain controls are exercised; public advisor/server-library controls are removed and private APIs restricted. Legacy static ephemerides remain **1 m** with unknown historical ground/altitude null. Research PRs **7, 8, 11 and 12 are merged**; this records source acceptance, not GitHub merge status for PR13. Existing asset numbers/coordinates and conditional research histories are preserved.

**Pre-decision analysis artifacts (`main`):** bounded DEM preview notebooks (`notebooks/`) and Site04 diagnostic scripts (`analysis/`) are retained for review; native preview caches stay outside Git under ignored `data/preview/`.

**Recorded Vercel Production (older static mock baseline): healthy within the round-24 anonymous smoke**, at **[https://lunarsight.vercel.app](https://lunarsight.vercel.app)**. The cloud build passed with Node **26.x**, pinned **pnpm 11.3.0**, `pnpm build` and `dist`; local chunk warnings remain. The upload was a clean archive of committed `web/` plus local [vercel.json](../web/vercel.json), **not Git auto-deploy or an all-files-committed artifact**. Uploaded app contents form project root **`.`**; a future full-repository Git source would instead need root `web`. Exact identity/revision/config hash are in [the handoff](handoffs/current.md); [operations](operations.md#vercel-static-mock-deployment) owns the clean upload/recovery route. The configuration was uncommitted at initial upload time; no automatic push/link was created. Pushing setup/docs does not redeploy it.

The bounded existing-source/backend/pipeline repairs and ready-PR merges are authorized; boss owns all Git and deployment actions. **Still outside scope:** fresh raster acquisition/download, hosted backend, CI/DNS/paid services, unrelated infrastructure and scientific certification. Existing static mock hosting does not authorize or automatically deploy this changed processed-data source.

## Current verification and remaining limits

**Final independent acceptance (round42): PASS within the requested merge-gate scope.** Typecheck, **13 web files / 105 tests** (including 15 generated-preset cases) and production build exited0 before an interruption destroyed the original raw logs/manifests. These are retained observations, not recreated stdout or fresh reruns. Backend **111 tests / 31 subtests** and zero offline-network attempts are explicitly **reused from test39**, after a pre-loss 89-input identity/retained-asset check; they were not rerun in42. [The acceptance handoff](handoffs/current.md#final-bounded-acceptance-round42) records commands, recovery and reuse qualifications.

Historical mock production evidence covered native Worker transfer/cache/cancellation, curved geometry, eye heights0/0.25/2.5m, bodies and workspace flows. Current static processed data instead exposes its truthful **1 m** ephemeris capability; flexible API heights require matching metadata or an actual dynamic query. Inspection fill remains a labelled view-relative display aid, not physical sunlight or a change to scientific visibility.

**G1 closed:** synthetic generated-pack checks cover actual terrain dependency/current ground, the five-decimal pipeline altitude and semantic agreement between an explicit series observer and its canonical registry. [Backend policy](../backend/README.md#snapshot-provenance-and-resource-contract), [static verifier](../web/src/data/pilot/terrainDependency.ts) and [pipeline source](../scripts/pipeline/build_pilot_assets.py) own the contract. This is software coherence, not actual regenerated-data publication or physical accuracy. Legacy values stay conditional; `--skip-existing` is not a blanket no-acquisition guarantee for missing targeted files, and generation still needs explicit authority.

**Production acceptance:** round42 freshly verified actual static/API A/B DOM values and native Ground terrain/1m readouts in separate production contexts. Default API Worker/science/terrain startup and actual live Cancel are **reused test39 passes**; server work had already completed in the controlled Cancel experiment. The earlier development-server stall has no established root cause: production success does not diagnose it. No remaining task42 FAIL/BLOCKED criterion; no universal startup, upstream or performance guarantee follows.

**Retained limits:** finite mesh/horizon approximations can disagree near centre-visibility thresholds, including Ridge cursor 533; V1 closure is not scientific validation. The final first terrain-bearing render of **616.3 ms** is one local production observation at **1600×1000**, on a shared host, not universal latency/FPS or an inter-engine speedup. Other sites/dates, global skyline equality, repeated cold startup, mobile/no-WebGL and full unmount/heap retention remain unverified; see [the handoff](handoffs/current.md).

**Round-24 remote evidence:** a fresh anonymous context received HTTP 200 at the stable alias and exercised actual Three.js relief, a running bundled Worker with JavaScript MIME, fonts, Surface, timeline play/scrub, Ridge→Rim→Ridge, the **10 m preset + Apply**, and mock v1.1.0 provenance. No page/console errors or unexpected external application calls were observed in the recorded smoke segments. **Exact remote cache/job/transfer counters remain unverified**; detailed counter/ownership evidence above is local. Health applies to the public stable alias, not every protected unique/preview URL or every device. No credential-repair claim follows.

## Decisions not yet made

- Primary audience, demo/MVP priorities, and performance targets.
- Final pilot coordinates/sites, product versions and footprints, resolution mix, time cadence, total data volume, and storage budget. [ADR 0002 (data)](decisions/0002-data-mining-feature-scope.md) selects a bounded south-polar site-screening workflow, not a final geographic coverage or dataset product.
- Local Three.js and the old static mock Vercel demo remain accepted. Existing backend/data correctness repairs and bounded A/B UX are now authorized, while hosted backend/real-data deployment, independent scientific acceptance, persistence/authentication product scope and provider spending remain open.
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

Review the accepted two-site experience and settle the next explicit product, science and hosting decisions in [open decisions](open-decisions.md), using the [decision packet](open-decisions.md#terrain-horizon-comparison-decision-packet) and [candidate-site notebook](../notebooks/candidate-site-visual-review.ipynb) where relevant. Completed acceptance is not the next task to replay merely because raw logs were lost. Boss retains Git/PR freshness and merge ownership. The [public mock demo](https://lunarsight.vercel.app) remains the older snapshot; any authorized later upload follows [operations](operations.md#vercel-static-mock-deployment), not a dirty-worktree upload or assumed Git hook.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
