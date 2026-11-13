# Current handoff

Updated: **13 November 2026**.

## Current state

The documentation and shared agent-guidance foundation is complete. ADR 0002 records the accepted initial data-mining feature priorities; [the pilot inventory](../data-mining-plan.md) now compares Site01, Site04, Site11 and Site23 as coverage candidates, based on the team Resource.docx and NASA PGDA listings. No site or product is selected for acquisition. Application implementation, dataset acquisition, scientific validation and deployment have not started in this repository. Exact sites/products/footprints, cadence, validation targets, stack, and deployment remain open.

## Start the next task

1. Read [AGENTS.md](../../AGENTS.md), [project state](../project-state.md) and the [documentation index](../README.md).
2. Select only the requirements, decisions and references relevant to the task.
3. Define the outcome, owned paths and observable completion criteria using the [task brief](../templates/task-brief.md) when useful.
4. Follow the [agent workflow](../agent-workflow.md) and [shared testing policy](../testing-policy.md). Documentation work needs content checks; future implementation needs justified checks for its accepted behavior.
5. Record actual evidence and remaining decisions. Update this handoff when the continuation point changes.

## Next useful decision

Compare the four product 78 site candidates and exact ROI sizes; compare PGDA 90 80 m and 20 m coverage/file sizes plus COG window access; and validate a documented Horizons query (targets 10/399, lunar observer center/coordinates, angle and time conventions). Then decide exact footprints, cadence and validation references. Acquisition or processing requires a later explicit request.

## Verification and limits

The setup has been checked for internal file links, status consistency, instruction/template references and clean diffs. The temporary setup-review report has been removed; enduring rules remain in the workflow and testing policy. No executable tests, CI jobs, datasets or dependencies were introduced. Agent-client loading and application/scientific behavior remain unverified.
