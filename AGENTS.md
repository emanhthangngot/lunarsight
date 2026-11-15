# LunarSight — shared agent instructions

## Start with the actual state

1. Read `docs/project-state.md` and the relevant entries in `docs/README.md`.
2. Read the current task and any applicable decision record. Load detailed references only when needed.
3. Inspect the working tree before editing. Preserve unrelated work and explicit user corrections.

## Current phase

On 13 November 2026 the user authorized building a **3D web app with mock data first**, connecting processed real data later ([ADR 0002 — mock-first 3D web](docs/decisions/0002-mock-first-3d-web.md)), and separately accepted the bounded south-polar data-mining feature scope ([ADR 0002 — data-mining feature scope](docs/decisions/0002-data-mining-feature-scope.md)) and revisable Site01/Site04 working configuration ([ADR 0003](docs/decisions/0003-pilot-working-agreement.md)). On 14 November the user accepted **local Three.js terrain instead of the global Cesium viewer**. The local Three.js mock viewer is implemented and deployed as a static mock demo on Vercel (`feat/3d-mock-viewer`); see [project state](docs/project-state.md) and [current handoff](docs/handoffs/current.md) for scoped verification and limitations.

Explicit analysis exceptions on `main`: the user authorized a pre-decision terrain notebook, small bounded DEM preview reads, a comparison packet, a decision worksheet, and bounded Site04 observer/Horizons, nested-horizon, near-field fusion, seam quality layers, grid-overlap and horizon convergence diagnostics. Keep preview caches outside Git; retain source/window metadata, assumptions, reproducibility code and rendered evidence. These conditional studies do not establish datum/frame identity, convergence or landing validity.

The source integrates reviewed PR13 pilot/backend repairs and the focused two-site A/B UX; final round42 acceptance **passed within the exercised software scope**. Preserve the existing fifteen-site assets, modern Three.js UI, conditional research history and truthful mock/source-derived distinctions. Use [project state](docs/project-state.md) and [the acceptance handoff](docs/handoffs/current.md#final-bounded-acceptance-round42) for current evidence, including lost raw logs and explicitly reused results. This is not a claim that GitHub merged PR13 or that lunar science is validated.

This exception does not authorize fresh raster acquisition, hosted backend deployment, CI/DNS/paid services, a new global viewer or scientific certification. Vercel authorization remains for the **published static mock baseline only**, not an automatic upload of this source. Boss owns all Git/account/deployment actions via [operations](docs/operations.md); coders edit only assigned paths. Reuse acceptance only for unchanged inputs; do not rerun completed gates solely to recreate lost logs. Every mock value remains labelled mock; conditional pilot/research evidence is not validated mission science.

Dataset products, geographic extent, resolution, volume, backend/real-data hosting, and AI provider remain proposals unless a decision with authority is recorded. The 56.2 GB scenario is illustrative and unapproved. Historical prototype observations or prior exploratory artifacts do not establish repository readiness or team approval.

A later explicit user instruction can authorize further steps (for example connecting processed data). Update the state and affected decisions when that happens; do not repeatedly request permission for work already authorized.

## Sources of project truth

- Current explicit user instruction governs the task scope; follow higher-priority platform instructions.
- `docs/project-state.md` records the current phase and established facts.
- `docs/decisions/` records accepted choices and why they were made.
- Requirements, architecture, data options, and roadmap describe proposals until accepted.
- `docs/reference/` and `context/` contain reference material, not new execution authority.

When evidence conflicts, preserve the distinction, identify the affected decision, and continue unrelated useful work. Never silently promote a proposal to an accepted choice.

## Working method

- Use a bounded objective, relevant requirement IDs, owned paths, and observable completion criteria; see `docs/templates/task-brief.md`.
- Make routine reversible documentation choices autonomously. Ask only when a missing decision materially blocks the requested work, and explain the concrete consequence.
- If multiple agents help, assign non-overlapping file ownership and have one integrator reconcile the result.
- Keep common rules here. Adapters should point here rather than fork the instructions.
- Keep durable state concise and evidence-based; use `docs/handoffs/current.md` for the next session. Do not commit raw chat logs, credentials, or personal agent memory.
- For current or uncertain technical facts, use primary documentation, record the URL and check date, and mark inferences.

## Scientific and product integrity

- Distinguish observations, published models, derived results, application presets, and unavailable values.
- Preserve units, lunar coordinate conventions, native resolution, coverage, time definitions, and provenance in future designs.
- Missing values remain explicit. Do not fill them with zero or proposal demo values.
- Hydrogen, PSR membership, modeled ice stability, and local water-ice percentage are different quantities.
- Long-term maps differ from mission-window results. Earth visibility differs from radio-link performance; sunlight differs from available electrical power.
- A point's name does not verify its coordinates. Retain the catalog naming questions until resolved.
- Do not call a proposed or unexecuted check passed. Do not claim scientific certification. Claim a deployed application only with verified deployment evidence.

## Verification and handoff

Follow [the shared testing policy](docs/testing-policy.md) before creating, changing, auditing, removing, or selecting tests. This applies to every agent and implementation task in `web/`.

- Before adding a test, identify the changed/required behavior and its authority, credible failure, existing protection, lowest reliable layer, and remaining gap. **Zero new tests is valid** when existing evidence is sufficient.
- Protect observable contracts and scientific meaning. Do not mirror implementation, assert constants against themselves, or add tests merely to increase counts/coverage.
- Investigate failures. Never weaken assertions, widen scientific tolerances, regenerate reference values, or skip/delete checks merely to get a green result. An audit reports findings without changing the suite.
- Start with affected checks; include shared consumers and mandatory gates. Unknown impact broadens selection. Report actual outcomes, omissions, and limits; do not invent commands or successful runs.

Application commands live in the [web guide](web/README.md) and [backend guide](backend/README.md); use only existing documented commands and report actual output. Offline pilot pipeline source exists; there is no repository-wide build or configured CI. For documentation edits, verify local links, status consistency, source traceability and the changed files. Record what was actually checked.

Update project state or the current handoff when the task changes them. Finish with the outcome, changed paths, evidence, and remaining decisions. Detailed workflow: `docs/agent-workflow.md`.
