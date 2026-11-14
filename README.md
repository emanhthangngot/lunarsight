# LunarSight

### Lunar Landing Site Explorer & Mission Planner

LunarSight is a proposed application for exploring lunar landing locations and understanding how terrain, sunlight, Earth visibility, and mission assumptions affect a preliminary assessment.

**Repository stage: documentation plus a mock-data 3D web prototype in progress (branch `feat/3d-mock-viewer`, app in `web/`).** On 13 November 2026 the user authorized building the 3D app with clearly labelled mock data first and connecting processed real data later ([ADR 0002](docs/decisions/0002-mock-first-3d-web.md)). The team is still choosing the dataset scope, quantities, resolution, hosting, and implementation priorities. Dataset acquisition, processing scripts, CI, and deployed infrastructure are not part of this step, and the prototype presents no real data.

[Tiếng Việt](README.vi.md) · [Documentation index](docs/README.md) · [Current project state](docs/project-state.md) · [Open decisions](docs/open-decisions.md)

## Start here

| Reader | First documents |
| --- | --- |
| Team member | [Product direction](docs/product.md), [requirements](docs/requirements.md), [open decisions](docs/open-decisions.md). |
| System designer | [Proposed architecture](docs/architecture.md), [domain model](docs/domain-model.md), [API design](docs/api-design.md), [operations](docs/operations.md). |
| Data researcher | [Candidate data sources](docs/data-sources.md) and [proposed quality rules](docs/data-quality.md). |
| Coding/research agent | [AGENTS.md](AGENTS.md), [current state](docs/project-state.md), then the documents relevant to the assigned task. |

## Intended product

The team's proposal describes Explorer and Planner experiences, mission profiles, site discovery and custom coordinates, terrain and scientific overlays, horizon and timeline analysis, scenario comparison, sensitivity exploration, site dossiers, provenance, an AI advisor, reports, and English/Vietnamese support. The [requirements register](docs/requirements.md) turns those ideas into traceable proposed behaviors and acceptance criteria.

The [original proposal transcription](docs/reference/proposal-v2.md) is a historical reference. Prototype observations and demo values in that document are not evidence of an implemented feature or validated dataset in this repository.

## What is established, and what remains proposed?

| Item | Current status |
| --- | --- |
| Project name and repository | LunarSight; `emanhthangngot/lunarsight`. |
| Current work scope | Documentation, agent context, system design, and an in-progress mock-data 3D viewer prototype (ADR 0002). |
| Product features | Proposal-derived requirements awaiting prioritization. |
| Geography, products, data volume, and resolution | Candidate options; no team selection recorded. |
| Backend, storage, hosting, and AI provider | Open decisions. The prototype stack (Vite, React, TypeScript, CesiumJS, pnpm, Vitest) is accepted for the mock prototype only. |
| Architecture and API contracts | Proposed designs for review. |
| Real-data connection, acquisition, or deployment | Future work after a subsequent explicit instruction. |

The roughly 56.2 GB figure previously researched is retained only as **one illustrative, unapproved acquisition scenario**. It is not a project requirement, an agreed download budget, or a statement of data acquired for this repository.

## Work with an agent

Open or clone the repository, then use the [starter prompt](docs/agent-workflow.md#starter-prompt). The shared entry point is `AGENTS.md`. Thin adapters are provided for Claude Code, GitHub Copilot, and Antigravity; detailed rules remain in the shared documents.

```bash
git clone https://github.com/emanhthangngot/lunarsight.git
cd lunarsight
```

Prototype commands are defined in `web/` (pnpm) once the scaffold exists; use only what `web/package.json` provides. No data download, CI, or deployment command is defined. The [agent workflow](docs/agent-workflow.md) explains how to keep durable project state, prepare a bounded task, hand work over, and report evidence without inventing completion.

## Repository organization

| Location | Purpose |
| --- | --- |
| `docs/` | Product, requirements, system design, source proposals, and verification plans. |
| `web/` | Mock-data 3D viewer prototype (in progress; not verified here). |
| `docs/decisions/` | Decisions with explicit status, rationale, and authority. |
| `docs/templates/` | Task briefs and handoff templates. |
| `docs/handoffs/` | Concise current handoff, not a dump of chat transcripts. |
| `context/` | Team-provided briefs, constraints, and reference intake instructions. |
| `assets/` | Place for future team-supplied visual references with provenance. |
| `data/README.md` | Data-planning boundary; no data selection or acquisition is implied. |
| `.github/` | Copilot guidance, issue templates, and a pull-request template. |

## Review and next step

Review the [open decision register](docs/open-decisions.md), starting with the target demo, initial geographic area, and minimum evidence needed for its features. Record actual decisions through an [ADR](docs/decisions/README.md); a source link or agent recommendation alone is not approval.

The [roadmap](docs/roadmap.md) describes later implementation stages. Their existence does not mark them as authorized, started, or complete.

## Attribution and project status

Candidate scientific sources include NASA/PDS, LRO instruments, JPL NAIF/Horizons, Lunar Prospector, and USGS/IAU. See [data sources](docs/data-sources.md). Agent setup references come from [official documentation](docs/references.md). No affiliation or scientific certification is implied. The team has not selected a license for its original project material.
