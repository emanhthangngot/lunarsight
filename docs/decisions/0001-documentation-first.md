# ADR 0001 — Documentation-first bootstrap

- Status: **Accepted; scope limit partly superseded by [ADR 0002](0002-mock-first-3d-web.md)** (the mock-data 3D prototype is authorized from 13 November 2026; dataset acquisition and processing scripts remain unauthorized)
- Date: **13 November 2026**
- Authority: explicit user instruction in the project conversation.

## Context

The repository was created while research had identified candidate lunar datasets. The user clarified that the team has not agreed on data quantities or selection and wants the initial setup to support agents and provide complete system documentation. Processing scripts and implementation should not be prepared at this stage.

## Decision

Keep the current tree focused on product/system documentation, candidate data research, project state, decision tracking, agent guidance, and contribution templates. Remove the prematurely introduced processing scripts and prepared-data examples from the active tree.

Label geographic scope, products, resolution, data volume, stack, hosting, and AI provider as proposals. Do not publish the illustrative 56.2 GB scenario as a selected or acquired project dataset.

## Consequences

There is no install/build/test/run pipeline to document as executable. Verification currently concerns document integrity, traceability, consistency, and the absence of unrequested implementation. Logical architecture and acceptance criteria can still be developed without selecting technologies.

This decision does not erase earlier exploratory history or prohibit future coding. A later explicit implementation task can authorize a bounded step. Record the new scope and actual team decisions without repeatedly asking for already granted permission.

## Revisit trigger

The user or team identifies the next implementation objective and authorizes work beyond this documentation phase. Update project state and add the decision records needed for that objective.
