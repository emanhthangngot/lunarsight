# Current project state

Updated: **14 November 2026**. This is the concise starting point for the team and agents.

## Established facts

- Project: **LunarSight — Lunar Landing Site Explorer & Mission Planner**.
- Repository: **emanhthangngot/lunarsight**, created as private.
- Instruction history: the initial setup was documentation-only ([ADR 0001](decisions/0001-documentation-first.md)). On 13 November 2026 the user authorized a **3D web app built with mock data first, processed real data connected later** ([ADR 0002](decisions/0002-mock-first-3d-web.md)).
- The team's proposal is preserved as a [historical reference](reference/proposal-v2.md). It informs requirements; it is not proof of a backend or validated science in this repo.
- The [shared testing policy](testing-policy.md) governs agent test creation, selection and maintenance. It does not select a data product.
- The official [challenge statement](reference/challenge-2026.md) (Lunar Landing Site Navigator) was retrieved on 13 November 2026 and is recorded as reference.

## Current scope

**Implemented and independently verified within the exercised mock scope:** the accepted **local Three.js 0.187.0** renderer replaces the Cesium runtime on `feat/3d-mock-viewer` ([ADR 0002](decisions/0002-mock-first-3d-web.md)). The modern React workspace, scenario identity and mock **1.1.0** scientific behavior are preserved. The [provider contract](../web/src/data/contract.ts) supplies actual Worker-generated finite curved meshes with a bounded two-entry cache; [scalar terrain](../web/src/data/mock/terrainField.ts) remains shared with [science](../web/src/data/mock/MockDataProvider.ts). This is not a global globe. Processed real-data integration is pending; no dataset is selected/acquired. See the [web guide](../web/README.md) for existing commands and limits.

**Vercel Production: healthy within the anonymous public-browser smoke scope**, at **[https://lunarsight.vercel.app](https://lunarsight.vercel.app)**. The cloud build passed with Node **26.x**, pinned **pnpm 11.3.0**, `pnpm build` and `dist`; local chunk warnings remain. The upload was a clean archive of committed `web/` plus local [vercel.json](../web/vercel.json), **not Git auto-deploy or an all-files-committed artifact**. Uploaded app contents form project root **`.`**; a future full-repository Git source would instead need root `web`. Exact identity/revision/config hash are in [the handoff](handoffs/current.md); [operations](operations.md#vercel-static-mock-deployment) owns the clean upload/recovery route. The configuration was uncommitted at initial upload time; no automatic push/link was created. Pushing setup/docs does not redeploy it.

Still unauthorized: dataset acquisition/download, processing scripts, backend/CI/DNS/paid services, other hosting/provisioning and any claim of real or validated data. This hosting exception does not change the mock scientific limits.

## Current verification and remaining limits

**Independent production acceptance: PASS; V1 CLOSED for default Ridge/Rim views.** Round 18 passed the engine/Worker/science integration but found insufficient default relief clarity. Final round 20 closed that visual finding at Ridge **1600×1000** and Rim **1280×900**, and passed typecheck, production build and **7 files / 57 tests** (all exit 0). The production app was exercised; the existing large-chunk warning remains. No runtime gates were rerun for this documentation reconciliation.

Actual production evidence covers native off-main Worker generation and detached-buffer transfer, usable bounded-cache return after GPU disposal, stale-build cancellation, curved geometry/normals, requested **0 / 0.25 / 2.5 m** eye heights, Sun/Earth directions, timeline/comparison/state behavior and explicit unknown/coverage recovery. Round 20 reused unchanged round-18 paths after source-hash comparison and freshly checked the visual repair. **Fill is labelled view-relative inspection lighting, not physical sunlight**; its toggle does not change science, the Sun or mesh generation.

**Retained limits:** finite mesh/horizon approximations can disagree near centre-visibility thresholds, including Ridge cursor 533; V1 closure is not scientific validation. The final first terrain-bearing render of **616.3 ms** is one local production observation at **1600×1000**, on a shared host, not universal latency/FPS or an inter-engine speedup. Other sites/dates, global skyline equality, repeated cold startup, mobile/no-WebGL and full unmount/heap retention remain unverified; see [the handoff](handoffs/current.md).

**Round-24 remote evidence:** a fresh anonymous context received HTTP 200 at the stable alias and exercised actual Three.js relief, a running bundled Worker with JavaScript MIME, fonts, Surface, timeline play/scrub, Ridge→Rim→Ridge, the **10 m preset + Apply**, and mock v1.1.0 provenance. No page/console errors or unexpected external application calls were observed in the recorded smoke segments. **Exact remote cache/job/transfer counters remain unverified**; detailed counter/ownership evidence above is local. Health applies to the public stable alias, not every protected unique/preview URL or every device. No credential-repair claim follows.

## Decisions not yet made

- Initial audience, demo/MVP priorities, and performance targets.
- Geographic region, exact products, resolution, temporal coverage, total data volume, and storage budget.
- Map/terrain engine and Vercel static Production hosting are accepted for this mock demo. Backend, real-data hosting/delivery, persistence/authentication and AI provider remain open; see [OD-11](open-decisions.md).
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

Use the [public mock demo](https://lunarsight.vercel.app) within the recorded limitations. Any later release follows the explicit project/scope **clean archive + reviewed config** route in [operations](operations.md#vercel-static-mock-deployment), not direct dirty-worktree upload or an assumed Git hook. Preserve the current known-good deployment record; no earlier rollback target exists. No app checks, build, auth or deployment action was rerun for this documentation update. Real-data work, backend/CI/DNS/paid services remain outside scope.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
