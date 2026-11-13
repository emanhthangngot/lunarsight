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

The NASA Data Book reference centers were projected into the ROI `.prj` south-polar stereographic CRS and compared with the available Site01/04/11 polygons. None of those centers lies inside an ROI polygon; Site01 lies only inside the union bounding box. This confirms that reference centers and ROIs represent different things, and does not verify each local raster's valid-data coverage. Site23 raster products are listed by PGDA, but its ROI archive is unavailable at the expected path.

The apparent Horizons DE441 versus PGDA DE421 frame conflict is resolved at the model level: JPL documents Horizons' high-precision lunar surface frame as the DE421 mean-Earth frame for 1550–2650, while DE441 supplies major-body trajectories. Keep the response header and confirm its lunar `Target pole/equ` label on each saved query. The major remaining technical check is an actual PGDA 90 COG spatial-window read. The current environment has no GDAL/Rasterio/TIFF reader, and direct shell access to the NASA endpoint failed DNS resolution; prior one-byte Range requests only establish server Range support. Use an available COG-aware reader in a network-enabled environment, then compare local GeoTIFF bounds/masks with the proposed analysis points. Exact sites, footprints, cadence and validation references remain undecided.

## Verification and limits

The setup has been checked for internal file links, status consistency, instruction/template references and clean diffs. The temporary setup-review report has been removed; enduring rules remain in the workflow and testing policy. No executable tests, CI jobs, datasets or dependencies were introduced. Agent-client loading and application/scientific behavior remain unverified.
