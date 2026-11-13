# Current handoff

Updated: **13 November 2026**.

## Current state

The documentation and shared agent-guidance foundation is complete. ADR 0002 records the accepted initial data-mining feature priorities; [the pilot inventory](../data-mining-plan.md) now compares Site01, Site04, Site11 and Site23 as coverage candidates, based on the team Resource.docx and NASA PGDA listings. No site or product is selected for acquisition. Application implementation, bulk dataset acquisition, scientific validation and deployment have not started in this repository. Exact sites/products/footprints, cadence, validation targets, stack, and deployment remain open.

## Start the next task

1. Read [AGENTS.md](../../AGENTS.md), [project state](../project-state.md) and the [documentation index](../README.md).
2. Select only the requirements, decisions and references relevant to the task.
3. Define the outcome, owned paths and observable completion criteria using the [task brief](../templates/task-brief.md) when useful.
4. Follow the [agent workflow](../agent-workflow.md) and [shared testing policy](../testing-policy.md). Documentation work needs content checks; future implementation needs justified checks for its accepted behavior.
5. Record actual evidence and remaining decisions. Update this handoff when the continuation point changes.

## Next useful decision

The NASA Data Book reference centers were projected into the ROI `.prj` south-polar stereographic CRS and compared with the available Site01/04/11 polygons. None lies inside an ROI polygon; Site01 lies only inside the union bounding box. Site23 raster products are listed by PGDA, but its ROI archive is unavailable at the expected path. Rasterio 1.5.2, installed temporarily outside the repository, read one 9×9 window at each reference center from PGDA 78 5 m and PGDA 90 80 m/20 m LDEMs. All 12 windows had 81/81 valid pixels. HTTP byte ranges transferred 770,048 bytes for local 5 m windows, 2,048,000 bytes for 80 m windows, and 3,112,960 bytes for 20 m windows; no full raster was retained.

The apparent Horizons DE441 versus PGDA DE421 frame conflict is resolved at the model level: JPL documents Horizons' high-precision lunar surface frame as the DE421 mean-Earth frame for 1550–2650, while DE441 supplies major-body trajectories. Keep the response header and confirm its lunar `Target pole/equ` label on each saved query. A geometric estimate places the outward 80S edge 182.5 km from Site23 and 264–297 km from the other three centers. An idealized 10 km obstacle gives a ~186 km horizon distance, so Site23 is the limiting candidate.

The 20 km profile comparison found mean absolute 80 m/20 m horizon differences of 2.2–2.8° at Site01/11/23 (95th percentiles 6.8–7.4°) and 0.32° at Site04 (95th percentile 1.08°, with one 21.28° outlier). All four centers were extended to 25 km at both scales; every cell inside each profile circle was valid. The 25 km mean absolute differences were 2.21° at Site01, 0.32° at Site04, 2.64° at Site11, and 2.33° at Site23. Site04's maximum remained near 19.4 km. Site01/11 still have 80 m maxima in the outer 2.5 km for 50/88 azimuths, while Site23 has 2 such bins at 80 m and none at 20 m. A 50 km extension of 80 m profiles at Site01, Site11 and Site23 had 100% valid coverage, but maxima remained in the outer 5 km for 93, 94 and 35 azimuths. Under a provisional 5 km-relief scenario, all four 80 m profiles were extended to 131.8 km, with 100% valid circles. Site04's max remained at 19.384 km; Site01/11/23 still have edge maxima in 32/52/56 azimuths. The 131.8 km windows do not reach the 80S boundary, so those three profiles remain radius-limited. The Site23 edge is about 182.5 km from its center; a 10 km-relief geometric horizon is about 186.4 km and would exceed that margin by ~3.9 km. The 131.8 km step transferred 165.2 MB including a timed-out attempt and repeated ranges; all profile reads total about 414.4 MB. No full raster was retained. Next agree the observer points, 95th-percentile angular tolerance and relief/horizon scenario before larger regional reads or scale selection. Exact sites, footprints, cadence and validation references remain undecided.

## Verification and limits

The setup has been checked for internal file links, status consistency, instruction/template references and clean diffs. The temporary setup-review report has been removed; enduring rules remain in the workflow and testing policy. No executable tests, CI jobs, dataset files or package dependencies were added to the repository; the temporary Rasterio reader and pixel windows were outside it. Agent-client loading and application/scientific behavior remain unverified.
