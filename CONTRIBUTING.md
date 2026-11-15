# Contributing to LunarSight

Current source integrates reviewed pilot/backend repairs and focused two-site Three.js UX with bounded acceptance PASS. Read [project state](docs/project-state.md) and [the qualified acceptance handoff](docs/handoffs/current.md#final-bounded-acceptance-round42) before starting; [AGENTS.md](AGENTS.md) applies to agents. The older public mock deployment is not this accepted source.

## A useful change

Connect the change to a user need, requirement, open decision, or documented finding. Define the files in scope and what would demonstrate completion. For larger work, use the [task brief](docs/templates/task-brief.md).

Describe unapproved data, technology, costs, and priorities as proposals. An accepted decision needs its rationale, authority, and date in the [decision register](docs/decisions/README.md). Do not treat an agent suggestion as a team vote.

## Working together

Use a focused branch such as `docs/scenario-contract` or `research/terrain-options` under the owner's instructions; keep unrelated work out of the pull request. Boss owns Git/PR freshness, merges, pushes and account/deployment actions in the current workflow; contributors edit assigned files and report evidence.

Assign separate file ownership when agents work in parallel, then integrate and review cross-document consistency. Preserve other contributors' work. Explain material corrections rather than silently changing the original proposal or reported evidence.

## Review for this phase

- Relative links lead to real files; the documentation index includes new material.
- Current repository capabilities are separated from prototype observations and future intentions.
- Dataset sizes and source selections remain proposals until decided.
- Diagrams, units, terms, and statuses agree across related documents.
- Acceptance grants no fresh raster download, regenerated numeric products, hosted backend, CI/deployment changes or credential material. Preserve existing assets/source histories; mock stays labelled and processed science conditional.
- The change includes evidence of the checks actually performed and an updated handoff when needed.

Application commands are owned by the [web guide](web/README.md#run-locally) and [backend guide](backend/README.md#run-locally). Documentation-only changes need narrow link/status checks, not application reruns. Reuse accepted results only for unchanged inputs and retain lost-log/reused-evidence qualifications; do not replay completed gates solely to reconstruct missing stdout. See [testing policy](docs/testing-policy.md) and [verification plan](docs/verification-plan.md).

## Test changes

Follow the [shared testing policy](docs/testing-policy.md). A contribution explains the protected behavior, existing evidence and remaining gap before adding tests; zero additions is valid when sufficient protection already exists. Audit requests report findings only. Test maintenance must preserve accepted contracts and explain any removed protection. Measure optimization on comparable runs and keep unrun/blocked/skipped evidence distinct from passes.
