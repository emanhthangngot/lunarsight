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

Five-layer byte sizes are recorded for Site01/04/11/23; ROI geometry was parsed for Site01/04/11, while the expected Site23 ROI path returned a not-found page. NASA reference centers are documented, and a small Sun/Earth Horizons query returned three hourly rows each. PGDA 90 full-file totals are recorded for 80 m and 20 m, and the server returns HTTP 206 for one-byte Range requests. Next reconcile ROI CRS/analysis points with raster coverage, find a verified Site23 ROI, test a real COG spatial-window read, and resolve the PGDA DE421 versus Horizons DE441 lunar-frame alignment. Exact sites, footprints, cadence and validation references remain undecided.

## Verification and limits

The setup has been checked for internal file links, status consistency, instruction/template references and clean diffs. The temporary setup-review report has been removed; enduring rules remain in the workflow and testing policy. No executable tests, CI jobs, datasets or dependencies were introduced. Agent-client loading and application/scientific behavior remain unverified.
