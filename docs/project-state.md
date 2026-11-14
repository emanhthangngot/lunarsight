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

Still unauthorized: dataset acquisition/download, processing scripts, deployment, CI, and any claim of real or validated data. The earlier exploratory processing material remains superseded; Git history does not establish approval or current capabilities.

## Current verification and remaining limits

**Independent production acceptance: PASS; V1 CLOSED for default Ridge/Rim views.** Round 18 passed the engine/Worker/science integration but found insufficient default relief clarity. Final round 20 closed that visual finding at Ridge **1600×1000** and Rim **1280×900**, and passed typecheck, production build and **7 files / 57 tests** (all exit 0). The production app was exercised; the existing large-chunk warning remains. No runtime gates were rerun for this documentation reconciliation.

Actual production evidence covers native off-main Worker generation and detached-buffer transfer, usable bounded-cache return after GPU disposal, stale-build cancellation, curved geometry/normals, requested **0 / 0.25 / 2.5 m** eye heights, Sun/Earth directions, timeline/comparison/state behavior and explicit unknown/coverage recovery. Round 20 reused unchanged round-18 paths after source-hash comparison and freshly checked the visual repair. **Fill is labelled view-relative inspection lighting, not physical sunlight**; its toggle does not change science, the Sun or mesh generation.

**Retained limits:** finite mesh/horizon approximations can disagree near centre-visibility thresholds, including Ridge cursor 533; V1 closure is not scientific validation. The final first terrain-bearing render of **616.3 ms** is one local production observation at **1600×1000**, on a shared host, not universal latency/FPS or an inter-engine speedup. Other sites/dates, global skyline equality, repeated cold startup, mobile/no-WebGL and full unmount/heap retention remain unverified; see [the handoff](handoffs/current.md).

The old sonnet-only/authentication-dependent restriction no longer blocks user-approved work; **credentials were not tested or repaired**. Independent verification is complete for the stated paths, not a grant for further code, tuning, real-data work or deployment.

## Decisions not yet made

- Initial audience, demo/MVP priorities, and performance targets.
- Geographic region, exact products, resolution, temporal coverage, total data volume, and storage budget.
- Map/terrain engine for the mock prototype is accepted (ADR 0002). Still open: persistence/authentication, backend, hosting, real terrain delivery format, and AI provider.
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

Use the verified mock prototype through the existing [web commands](../web/README.md); [the handoff](handoffs/current.md) records current acceptance and limits. No pending V1 repair, fixture migration or old authentication wait remains. Any next implementation or acceptance expansion needs a bounded authorized task; do not turn limited local timing into a tuning/certification loop. Real-data acquisition/integration, processing, CI and deployment remain deferred.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
