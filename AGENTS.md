# LunarSight — shared agent instructions

## Start with the actual state

1. Read `docs/project-state.md` and the relevant entries in `docs/README.md`.
2. Read the current task and any applicable decision record. Load detailed references only when needed.
3. Inspect the working tree before editing. Preserve unrelated work and explicit user corrections.

## Current phase

On 13 November 2026 the user authorized building a **3D web app with mock data first**, connecting processed real data later ([ADR 0002](docs/decisions/0002-mock-first-3d-web.md)). Work is in progress on branch `feat/3d-mock-viewer`; the app lives in `web/` (Vite + React + TypeScript + CesiumJS + pnpm + Vitest). Documentation work continues alongside.

Still not authorized: acquiring or downloading datasets, processing/download scripts, deployment/provisioning, CI jobs, and any claim that displayed values are real, validated, or deployed. Every mock value must be labelled mock in data and in the UI.

Dataset products, geographic extent, resolution, volume, hosting, backend, and AI provider remain proposals unless a decision with authority is recorded. The 56.2 GB scenario is illustrative and unapproved. Historical prototype observations or prior exploratory artifacts do not establish team approval.

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
- Do not call a proposed or unexecuted check passed. Do not claim scientific certification or a deployed application.

## Verification and handoff

Follow [the shared testing policy](docs/testing-policy.md) before creating, changing, auditing, removing, or selecting tests. This applies to every agent and implementation task in `web/`.

- Before adding a test, identify the changed/required behavior and its authority, credible failure, existing protection, lowest reliable layer, and remaining gap. **Zero new tests is valid** when existing evidence is sufficient.
- Protect observable contracts and scientific meaning. Do not mirror implementation, assert constants against themselves, or add tests merely to increase counts/coverage.
- Investigate failures. Never weaken assertions, widen scientific tolerances, regenerate reference values, or skip/delete checks merely to get a green result. An audit reports findings without changing the suite.
- Start with affected checks; include shared consumers and mandatory gates. Unknown impact broadens selection. Report actual outcomes, omissions, and limits; do not invent commands or successful runs.

Application commands live in `web/` (pnpm); use only commands that exist in `web/package.json` and report their actual output. There is no repository-wide build, CI, or data pipeline. For documentation edits, verify local links, consistent status labels, proposal traceability, readable diagrams, template syntax, and a clean diff. Record what was actually checked.

Update project state or the current handoff when the task changes them. Finish with the outcome, changed paths, evidence, and remaining decisions. Detailed workflow: `docs/agent-workflow.md`.
