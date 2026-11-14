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

**Implemented, mock-only:** a modern immersive web prototype exists in `web/` on branch `feat/3d-mock-viewer` (Vite + React + TypeScript + CesiumJS 1.147.x + pnpm + Vitest). The web workspace and repaired Cesium Orbital/Surface flows are independently verified within the exercised scope, not scientifically validated. Start with the [web guide and package commands](../web/README.md) and [App integration](../web/src/App.tsx); the data boundary is [LunarDataProvider](../web/src/data/contract.ts). The [terrain generator](../web/src/data/mock/terrain.ts) and [analytic mock provider](../web/src/data/mock/MockDataProvider.ts) remain **1.1.0**, with fictional data rather than JPL/LOLA measurements.

Still unauthorized: dataset acquisition/download, processing scripts, deployment, CI, and any claim of real or validated data. The earlier exploratory processing material remains superseded; Git history does not establish approval or current capabilities.

## Current verification and remaining limits

**Latest independent repair retest: F1 and F2 CLOSED; required gates PASS.** `pnpm typecheck`, `pnpm test` and `pnpm build` each exited **0**; **6 files / 54 tests passed**. The former undefined-`bodyBillboards` Surface crash and hidden 0.5 m eye-height clamp are closed by compiler/build evidence and real Ridge A/Rim D mode, cursor, FOV and height checks. Production bundling passed; separate production-browser execution remains untested. Earlier failure/success reports are superseded by this current-tree retest; see the [handoff](handoffs/current.md).

**Known limit L1 remains:** at Ridge cursor 533, the provider labels the Sun centre hidden while the rendered centre ray is clear by about **0.000133°**. The measured view maximum skyline residual was **0.056673453°**, below the proposed 0.1° sampled diagnostic, not proof of exact/global centre agreement or lunar accuracy. The independent Surface movement observation (**27.0689 rendered frames/s**, one shared-host trial) is not universal ≥24 fps certification. Mock provenance, missing/unknown distinctions and scientific wording remain required.

The user-authorized transfer to **coder-sol** superseded sonnet-only ownership and the earlier agent-authentication delivery blocker **for this repair**; **tester remains read-only**. Continuation of this repaired work does not need to wait for sonnet authorization or authentication. **Credentials were not tested or repaired.** Any new coding scope still requires a bounded authorized task.

## Decisions not yet made

- Initial audience, demo/MVP priorities, and performance targets.
- Geographic region, exact products, resolution, temporal coverage, total data volume, and storage budget.
- Map/terrain engine for the mock prototype is accepted (ADR 0002). Still open: persistence/authentication, backend, hosting, real terrain delivery format, and AI provider.
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

Use the mock prototype through the existing [web guide and package commands](../web/README.md); the [handoff](handoffs/current.md) records the verified scope and remaining limits. F1/F2 need no further pending repair dispatch on the current retested tree. Retain L1 and shared-host performance uncertainty rather than starting an unapproved tuning/certification loop. Real-data acquisition/integration, processing, CI and deployment remain deferred and require separate authorization; see [open decisions](open-decisions.md).

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
