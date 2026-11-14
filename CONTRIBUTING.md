# Contributing to LunarSight

Current phase: documentation plus a mock-data 3D web prototype in `web/` ([ADR 0002](docs/decisions/0002-mock-first-3d-web.md)). Read [project state](docs/project-state.md) before starting; [AGENTS.md](AGENTS.md) also applies when using an agent.

## A useful change

Connect the change to a user need, requirement, open decision, or documented finding. Define the files in scope and what would demonstrate completion. For larger work, use the [task brief](docs/templates/task-brief.md).

Describe unapproved data, technology, costs, and priorities as proposals. An accepted decision needs its rationale, authority, and date in the [decision register](docs/decisions/README.md). Do not treat an agent suggestion as a team vote.

## Working together

Use a focused branch such as `docs/scenario-contract` or `research/terrain-options` for collaborative work. Keep unrelated changes out of the same pull request. The requested owner-directed repository setup can be committed directly; ongoing team review conventions can be refined together.

Assign separate file ownership when agents work in parallel, then integrate and review cross-document consistency. Preserve other contributors' work. Explain material corrections rather than silently changing the original proposal or reported evidence.

## Review for this phase

- Relative links lead to real files; the documentation index includes new material.
- Current repository capabilities are separated from prototype observations and future intentions.
- Dataset sizes and source selections remain proposals until decided.
- Diagrams, units, terms, and statuses agree across related documents.
- No data downloads or processing scripts, generated datasets, deployment configuration, CI, credentials, or private transcripts are introduced; mock values stay labelled mock.
- The change includes evidence of the checks actually performed and an updated handoff when needed.

Application checks live in `web/` (pnpm) and are defined by its `package.json`; documentation changes need link and status checks. See the [verification plan](docs/verification-plan.md).

## Test changes in a later implementation phase

Follow the [shared testing policy](docs/testing-policy.md). A contribution explains the protected behavior, existing evidence and remaining gap before adding tests; zero additions is valid when sufficient protection already exists. Audit requests report findings only. Test maintenance must preserve accepted contracts and explain any removed protection. Measure optimization on comparable runs and keep unrun/blocked/skipped evidence distinct from passes.
