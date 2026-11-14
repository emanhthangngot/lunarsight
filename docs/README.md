# Documentation index

Read [project state](project-state.md) first. Documents labeled **proposed** describe options or intended behavior; they do not establish team approval or implementation. The repository is currently a documentation foundation.

## Product and requirements

| Document | Role |
| --- | --- |
| [Product direction](product.md) | Problem, user assumptions, feature direction, and proposed priorities. |
| [Requirements register](requirements.md) | Stable functional/nonfunctional IDs, proposal traceability, and future acceptance criteria. |
| [Original proposal reference](reference/proposal-v2.md) | Historical transcription of the team's proposal; observations and demo values remain unverified reference content. |

## Proposed system

| Document | Role |
| --- | --- |
| [Architecture](architecture.md) | Logical responsibilities, shared scenario/result flow, boundaries, and alternatives. |
| [Domain model](domain-model.md) | Conceptual entities, relationships, units, identities, and statuses. |
| [API design](api-design.md) | Candidate contracts, asynchronous work, errors, and compatibility questions. |
| [Operations](operations.md) | Future environment, storage, secrets, cost, monitoring, and deployment considerations. |
| [Verification plan](verification-plan.md) | What can be checked now and what future behavior needs evidence. |
| [Shared testing policy](testing-policy.md) | Rules for every agent: justify tests, preserve scientific evidence, select checks by impact, and avoid redundant suites. |

## Data proposals

| Document | Role |
| --- | --- |
| [Candidate data sources](data-sources.md) | Official sources, coverage options, illustrative quantities, and selection questions; feature priorities are recorded in ADR 0002. |
| [Pilot data-mining inventory](data-mining-plan.md) | Candidate site comparison, source-to-feature inventory, known conventions, volume comparison, and open review items. |
| [Candidate-site visual review notebook](../notebooks/candidate-site-visual-review.ipynb) | Rendered overview of reference centers, available ROI outlines, five-layer file sizes, and the original four-site p95 scale comparison. |
| [Terrain pre-decision notebook](../notebooks/terrain-predecision-review.ipynb) | Bounded real DEM previews, synthetic hillshade, slope proxy, mask and source evidence. |
| [Team decision worksheet](predecision-review.md) | Comparison table, unresolved evidence, meeting agenda, decision fields and DE handoff responsibilities. |
| [Data quality proposal](data-quality.md) | Scientific interpretation, provenance, missing data, and acceptance evidence. |
| [Data boundary](../data/README.md) | Explains why this repository currently contains no acquired data. |

## Team and agent workflow

| Document | Role |
| --- | --- |
| [Current project state](project-state.md) | Short durable facts, scope, and next step. |
| [Open decisions](open-decisions.md) | Questions to resolve, options, consequences, and required evidence. |
| [Decision register](decisions/README.md) | Accepted decisions and an ADR template. |
| [Agent workflow](agent-workflow.md) | Context loading, task boundaries, parallel work, verification, and handoff. |
| [Task brief template](templates/task-brief.md) | Objective, authority, owned paths, inputs, and completion criteria. |
| [Handoff template](templates/handoff.md) | Concise continuation notes with evidence and remaining questions. |
| [Current handoff](handoffs/current.md) | Current continuation point; update instead of relying on hidden chat history. |
| [Contributing](../CONTRIBUTING.md) | Review and contribution conventions for this phase. |
| [Team context intake](../context/README.md) | Where to supply project constraints and decisions. |
| [Visual reference intake](../assets/README.md) | Where to supply screenshots, sketches, and UI references. |
| [Setup references](references.md) | Official documentation used to design agent configuration. |

Keep root instructions short. Read a detailed document when the task needs it, rather than loading this entire directory into every agent session.
