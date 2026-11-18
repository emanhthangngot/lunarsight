# LunarSight

### Introduction
We were awarded the Best Mission Concept prize for our work on this project. This achievement was made possible by the dedicated contributions of Huỳnh Cung, Tchen Phi Tân, Ngọc Anh, Hoàng Thy, Xuân Trí, and Anh Tuấn.

### Lunar Landing Site Explorer & Mission Planner

LunarSight is a proposed application for exploring lunar landing locations and understanding how terrain, sunlight, Earth visibility, and mission assumptions affect a preliminary assessment.

**Repository stage: reviewed pilot-data/backend repairs and focused two-site Three.js UX, with bounded final acceptance PASS.** The [mock-first decision](docs/decisions/0002-mock-first-3d-web.md) led to retained source-derived pilot assets, a static provider and a local FastAPI path. Broader product/data/hosting decisions remain open; software acceptance is not scientific validation. [Current state](docs/project-state.md) and [the handoff](docs/handoffs/current.md#final-bounded-acceptance-round42) distinguish observed results, lost raw logs and reused evidence. The public Vercel demo remains the older static mock snapshot, not this source.

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
| Current work scope | Reviewed PR13 repairs and focused Site01/Site04 A/B UX accepted within the exercised software scope; GitHub merge freshness remains owner-controlled. |
| Product features | The focused comparison is implemented; broader proposal-derived requirements remain subject to prioritization. |
| Geography, products, data volume, and resolution | [Revisable Site01/Site04 working agreement](docs/decisions/0003-pilot-working-agreement.md) accepted; final acquisition/products/resolution remain open. |
| Backend, storage, hosting, and AI provider | Conditional local FastAPI source exists. Hosted backend, broader storage/provider choices and paid services remain open; no CI is configured. |
| Architecture and API contracts | Executable client/provider/mesh and local backend interfaces exist; broader system designs remain proposals. |
| Data connection and deployment | Retained processed assets are connected and locally accepted; fresh acquisition/regeneration or hosting needs explicit authority. Git push/merge does not redeploy Vercel. |

The roughly 56.2 GB figure previously researched is retained only as **one illustrative, unapproved acquisition scenario**. It is not a project requirement, an agreed download budget, or a statement of data acquired for this repository.

## Work with an agent

Open or clone the repository, then use the [starter prompt](docs/agent-workflow.md#starter-prompt). The shared entry point is `AGENTS.md`. Thin adapters are provided for Claude Code, GitHub Copilot, and Antigravity; detailed rules remain in the shared documents.

```bash
git clone https://github.com/emanhthangngot/lunarsight.git
cd lunarsight
```

Use existing commands from the [web guide](web/README.md#run-locally) and [backend guide](backend/README.md#run-locally). Existing pipeline source is not permission for fresh raster acquisition or regeneration. There is no CI; deployment remains an explicit owner action. The [agent workflow](docs/agent-workflow.md) explains bounded tasks, handoffs and evidence.

## Repository organization

| Location | Purpose |
| --- | --- |
| `docs/` | Product, requirements, system design, source proposals, and verification plans. |
| `web/` | Local Three.js workspace and static/API providers; [bounded acceptance](docs/handoffs/current.md#final-bounded-acceptance-round42), not scientific certification. |
| `backend/` | [Conditional local FastAPI source](backend/README.md); no hosted backend implied. |
| `docs/decisions/` | Decisions with explicit status, rationale, and authority. |
| `docs/templates/` | Task briefs and handoff templates. |
| `docs/handoffs/` | Concise current handoff, not a dump of chat transcripts. |
| `context/` | Team-provided briefs, constraints, and reference intake instructions. |
| `assets/` | Place for future team-supplied visual references with provenance. |
| `data/README.md` | Data-planning boundary; no data selection or acquisition is implied. |
| `.github/` | Copilot guidance, issue templates, and a pull-request template. |

## Review and next step

Review the accepted two-site workflow and agree the next explicit product, hosting and science decisions through the [open decision register](docs/open-decisions.md). Completed acceptance is not a task to replay merely to replace lost logs. Record decisions through an [ADR](docs/decisions/README.md); a source link or agent recommendation alone is not approval.

The [roadmap](docs/roadmap.md) describes later implementation stages. Their existence does not mark them as authorized, started, or complete.

## Attribution and project status

Candidate scientific sources include NASA/PDS, LRO instruments, JPL NAIF/Horizons, Lunar Prospector, and USGS/IAU. See [data sources](docs/data-sources.md). Agent setup references come from [official documentation](docs/references.md). No affiliation or scientific certification is implied. The team has not selected a license for its original project material.
