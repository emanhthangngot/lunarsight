# Product brief

**Status: product direction is proposed; initial data-mining feature scope accepted on 13 November 2026.** This document does not state that the repository contains a working application, processing pipeline, selected dataset, or agreed deployment stack. See [ADR 0002](decisions/0002-data-mining-feature-scope.md) for the accepted feature priorities.

The product basis is the team's [LunarSight V2 proposal](reference/proposal-v2.md), dated 5 November 2026. Prototype observations in that document are historical evidence of interaction ideas; they are not independent verification of scientific calculations or a specification of the current repository.

## Vision

LunarSight is a shared workspace for exploring a lunar location, configuring a surface mission, and understanding the evidence behind a preliminary site comparison. Its central question is: **how do location, terrain, mission timing, and operating assumptions affect the scenario?**

The product should make assumptions and missing evidence visible alongside results. A useful assessment explains what was calculated, which inputs and sources support it, which constraints were satisfied, and what remains uncertain.

## Problem and user assumptions

The proposal identifies the following audiences. Their needs and priority remain hypotheses to confirm with the team and representative users.

| Proposed audience | Question the product should help investigate |
| --- | --- |
| Students and educators | Why can a ridge and a crater floor have different illumination, visibility, and thermal conditions? |
| Preliminary mission analysts | How does changing the site, operating interval, or mission profile change the comparison? |
| Power and communications learners or specialists | What terrain and timing explain a darkness interval or direct-to-Earth obstruction? |
| Science and resource teams | How does interest in a location relate to terrain, access, environmental conditions, and evidence quality? |

These are user needs, not implemented account roles. Authentication, collaboration, persistent projects, and permissions remain open design questions.

## Original product scope to preserve

| Experience | Intended purpose | Important boundary |
| --- | --- | --- |
| Explorer and Planner | Provide educational guidance and technical investigation over the same underlying scenario. | The prototype's Explorer mode does not establish a separate simplified application. |
| Site discovery and coordinates | Search/filter candidate locations and investigate a custom coordinate. | Catalog names, mission associations, permitted coordinate ranges, and coverage need review. |
| Mission profiles and constraints | Make dates, duration, equipment height, and operating thresholds explicit. | Profile defaults are application assumptions, not official mission requirements. |
| Terrain and layers | Inspect terrain, contours, illumination, thermal context, resource evidence, shadow, and slope. | A layer may be unavailable if no appropriate source is selected. |
| Local horizon and timeline | Explain terrain obstruction and follow Sun/Earth geometry over time. | Visibility conventions, cadence, and model limitations must be specified. |
| Scenario comparison and sensitivity | Compare alternatives and examine controlled changes around a baseline. | Parameter exploration does not establish optimization or formal uncertainty analysis. |
| Site dossier and provenance | Connect values and narratives to source definitions, coverage, and validation evidence. | “Telemetry” does not imply a live spacecraft feed. |
| AI advisor | Explain identified scenario results and guide further questions. | The advisor must not invent missing measurements or replace deterministic results. |
| Reports and exports | Communicate a reproducible preliminary assessment. | A printed report is not mission certification. |
| English and Vietnamese | Make the same functionality understandable in both languages. | Technical meanings, units, and status labels must stay consistent. |

Detailed requirements and proposal-section mappings are in [requirements.md](requirements.md).

## Proposed first usable release

The following feature ordering follows ADR 0002. It is not a dataset acquisition or implementation authorization.

1. A shared scenario can hold a supported location, explicit time interval, observer height, and mission constraints.
2. Users can inspect candidate south-polar locations, source coverage, and multi-scale terrain evidence, including uncertainty and observation support where available.
3. Sun/Earth ephemeris and terrain horizons support time-indexed illumination and geometric Earth-visibility results for a selected mission interval.
4. Users can compare a small number of site/date scenarios on matching intervals and inspect how terrain uncertainty changes the result.
5. An export preserves assumptions, units, sources, coverage, uncertainty, missing values, and limitations. English/Vietnamese presentation and clear data states use the same identified scenario.

PSR/resource, Diviner thermal, and selected LROC imagery are optional context after the core workflow. A battery/power-sufficiency model, full communications link budget, advisor, formal optimization, and broader geographic coverage remain deferred or open as described in ADR 0002 and [open decisions](open-decisions.md).

No region, grid spacing, source collection, download quantity, processing duration, provider, or storage budget is committed by this document. Candidate data options are listed in [data-sources.md](data-sources.md).

## Proposed user journey

1. Choose a language and an Explorer or Planner presentation.
2. Select a candidate or enter a coordinate, then inspect available evidence and coverage.
3. Configure mission dates, duration, height, and constraints, with assumptions clearly labeled.
4. Request an analysis and receive a distinct pending, completed, partial, or failed state.
5. Inspect the map, horizon, timeline, and constraint explanations for the same result.
6. Compare alternatives or change one assumption, retaining a clear baseline.
7. Review provenance and limitations; optionally ask the advisor to explain the result.
8. Export or print an assessment containing the exact inputs and result identity.

## Capabilities requiring a separate scope decision

The initial concept does not establish flight control, landing authorization, launch trajectory optimization, operational relay scheduling, a full radio-link budget, a complete energy/battery model, rover route optimization, or resource-extraction estimates. Each extension requires its own requirements, input evidence, and validation plan.

Long-term environmental context, geometry, and engineering performance are different forms of evidence. The interface should explain the distinction without forcing users to understand storage or implementation details.

## Proposed measures of usefulness

Before selecting numerical targets, agree on representative users and tasks. Candidate measures are whether users can explain a constraint failure, identify a missing input, compare two scenarios without losing assumptions, and reproduce an exported assessment from its recorded versions.

Performance, model accuracy, accessibility, and reliability targets need explicit definitions and evidence. The documentation phase must not substitute a target for a measured result. See [verification-plan.md](verification-plan.md).

## Decisions needed before implementation

The team should choose the initial audience and workflow, pilot geographic scope, scientific variables, validation expectations, technology stack, persistence requirements, deployment model, and role of the advisor. Record choices and alternatives with their rationale rather than treating this brief or a source catalog as approval.
