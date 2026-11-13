# Current project state

Updated: **13 November 2026**. This is the concise starting point for the team and agents.

## Established facts

- Project: **LunarSight — Lunar Landing Site Explorer & Mission Planner**.
- Repository: **emanhthangngot/lunarsight**, created as private.
- Current user instruction: prepare the initial repository, agent context, system design, and complete documentation; keep data proposals uncommitted and prepare no scripts or application implementation.
- The team's proposal is preserved as a [historical reference](reference/proposal-v2.md). It informs requirements; it is not proof of a backend or validated science in this repo.
- The [shared testing policy](testing-policy.md) governs agent test creation, selection and maintenance. It does not select a stack/data product or authorize runtime implementation.

## Current scope

Documentation and declarative contribution/agent guidance only. The current tree has no application source, processing scripts, executable test suite, package dependencies, acquired datasets, or deployment configuration.

An earlier bootstrap imported exploratory processing material. That approach was superseded by the user's documentation-only clarification. The current tree is the source of truth; earlier exploratory work and Git history do not establish approval or current capabilities.

## Decisions not yet made

- Initial audience, demo/MVP priorities, and performance targets.
- Geographic region, exact products, resolution, temporal coverage, total data volume, and storage budget.
- Technology stack, map engine, persistence/authentication, hosting, and AI provider.
- Scientific model fidelity, acceptance tolerances, and validated catalog names/coordinates.
- Code licensing, collaboration rules, and release process.

The approximately **56.2 GB** acquisition scenario is an unapproved example from source research. No selected dataset or committed acquisition budget is recorded. See [open decisions](open-decisions.md).

## Next useful work

Review and resolve the target demonstration and minimum scientific evidence, then record only the choices actually made. Continue improving documentation while decisions are open. A later explicit implementation request may authorize a bounded coding task; update this file and the relevant decision records then.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| Proposed | Candidate design, source, estimate, or requirement awaiting a decision. |
| Accepted | Choice supported by an identified decision-maker or explicit user instruction and date. |
| Historical observation | A report about the earlier prototype; not a claim about the current repo. |
| Implemented | Exists in the current tree and has stated execution evidence where applicable. |
| Verified | A named check was actually performed, with its scope and limitations. |

Keep feature completion and scientific validation separate from documentation completion. The [current handoff](handoffs/current.md) records recent work and checks.
