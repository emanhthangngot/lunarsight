# Current handoff

Updated: **14 November 2026**.

## Pre-decision terrain review

The [terrain notebook](../../notebooks/terrain-predecision-review.ipynb) and [team decision worksheet](../predecision-review.md) provide real PGDA 78 previews for nine reference centers. Each displayed crop is 500×500 native 5 m pixels; all nine had 250,000/250,000 valid center pixels. The read includes one-pixel halo; full source rasters were not retained. Figures, crop metadata and array hashes are retained; raw preview caches are Git-ignored. Hillshade is synthetic, slope is a finite-difference proxy, and these crops do not validate whole ROIs or horizon coverage. Historical horizon/p95 inconsistencies remain unresolved.

Notebook executed with four rendered figures and no cell errors. Independent analytical plane/nodata checks and Range reader checks passed. The next team step is to inspect the visuals and worksheet, decide which sites/ROIs merit further investigation, and assign the unresolved horizon reproduction and mission requirements.

## Pilot working agreement

The user confirmed team acceptance of the provisional Site01/Site04 configuration. See [ADR 0003](../decisions/0003-pilot-working-agreement.md), [configuration](../../config/pilot-v1.json), and [sample evidence](../../notebooks/evidence/pilot-v1-samples.json). Cached preview hashes and valid counts were rechecked; full ROI, datum reconciliation, horizon reproduction and product selection remain open.

## Pilot ROI and datum review

See [pilot ROI/datum review](../pilot-roi-datum-review.md). Site01 ROI is fully inside reference preview bounds, Site04 ROI is entirely outside; both reference points fall outside ROI. Source elevation versus Horizons ellipsoid datum remains unverified; do not convert AGL until confirmed. Geometry uses interpreted shapefile projection, not authoritative CRS reconciliation.

## Site04 ROI coverage

See [Site04 ROI coverage](../site04-roi-coverage.md). The five PGDA 78 layers have 526/526 finite pixels under the ROI pixel-center mask; 468 LDEC pixels are zero. Projection parameters match but semantic CRS equality is false. Vertical datum and observer choice remain open. A point is proposed only for technical review, not landing selection.

## Site04 observer and datum audit

See [observer/datum audit](../site04-observer-datum-audit.md). The inside-ROI point is only a provisional technical observer; LOLA LDEM_64 documentation supports a 1737.4 km reference sphere but is not direct vertical-datum metadata for PGDA 78. Horizons and horizon reproduction were not run for this point because datum confirmation is still missing.

## Current state

The documentation and shared agent-guidance foundation is complete. ADR 0002 records the accepted initial data-mining feature priorities; [the pilot inventory](../data-mining-plan.md) retains the original Site01/04/11/23 cohort, adds bounded point checks for Site07/Site20, and metadata/size checks for Site06/Site42/Haworth. The six point-screened centers passed local 5 m and regional 80 m/20 m 9×9 windows; Site20v2 also passed a local 5 m read. The further alternatives have only product availability/size evidence, no pixel coverage checks. Site07's reference center is outside both polygons in its available ROI; no verified Site06/Site20/Site23 ROI was found at the checked paths. Site42/Haworth have no ROI links on the PGDA page. The candidate screen is not exhaustive. No site or product is selected for acquisition. Application implementation, bulk dataset acquisition, scientific validation and deployment have not started in this repository. Exact sites/products/footprints, cadence, validation targets, stack, and deployment remain open.

## Start the next task

1. Read [AGENTS.md](../../AGENTS.md), [project state](../project-state.md) and the [documentation index](../README.md).
2. Select only the requirements, decisions and references relevant to the task.
3. Define the outcome, owned paths and observable completion criteria using the [task brief](../templates/task-brief.md) when useful.
4. Follow the [agent workflow](../agent-workflow.md) and [shared testing policy](../testing-policy.md). Documentation work needs content checks; future implementation needs justified checks for its accepted behavior.
5. Record actual evidence and remaining decisions. Update this handoff when the continuation point changes.

## Next useful decision

The NASA Data Book reference centers were projected into the ROI `.prj` south-polar stereographic CRS and compared with available polygons. Site01/04/11 centers and the newly checked Site07 center all fall outside the polygons; Site01 and Site07 lie inside their union envelopes. Site06's listed ROI link returned not-found; Site20 and Site23 ROI archives were unavailable at the checked paths. Site42/Haworth have no ROI links on the PGDA page. Bounded reads verified 81/81 valid pixels at the six screened centers in PGDA 78 5 m and PGDA 90 80 m/20 m LDEMs; Site20v2 also had 81/81 valid pixels in its local 5 m LDEM. Site06/Site42/Haworth received HEAD size checks only (five-layer totals 320,127,929 / 320,127,973 / 710,618,745 bytes). No full raster was retained. Exact successful range-byte totals for the additional Site07/Site20 windows were 1,343,488 bytes at 80 m and 1,212,416 bytes at 20 m, in addition to the prior four-center reads. The ROI and point checks do not establish selected landing points or raster-wide coverage.

The Horizons DE441 trajectory / DE421 lunar-frame distinction is resolved at the model level for current dates. With Moon as observer center, confirm `Center pole/equ`, not the Sun/Earth `Target pole/equ`. The feasibility sample's `0.001 km` is altitude above the reference ellipsoid, not height above terrain. The [inventory](../data-mining-plan.md#horizons-feasibility-query-run) records the bounded API recheck and the datum conversion required before a terrain-relative observer is used.

**Horizon evidence correction, 14 November 2026:** retain the historical 20/25/50/131.8 km reports in the [inventory](../data-mining-plan.md#bounded-80-m--20-m-horizon-profile-comparison), but do not treat them as independently reproduced evidence for threshold, scale or radius selection. Three minimum-horizon values decrease across radius extensions, inconsistent with a maximum over nested samples if observer/grid/binning are fixed. The original script and per-bin profiles are absent from the repository, so changed masks/sampling or a calculation/reporting defect cannot yet be distinguished. The notebook faithfully plots supplied p95 numbers; it does not compute them. No raster recomputation or silent correction was performed.

## Remaining DE/data-mining parts

The [decision packet](../open-decisions.md#terrain-horizon-comparison-decision-packet) keeps roster, observer points/ROI, p95 tolerance and horizon scenario open. First recover or reproduce the profile method and per-bin evidence before using the historical p95 values to choose thresholds or products. The team may discuss roster and mission needs independently; Site06/Site42/Haworth remain metadata-only candidates. Then propose bounded coverage/scale analysis and an asset manifest with transfer/storage estimates. Acquisition, processing and validation require their own explicit scope. Merging this research inventory does not select data or authorize those steps.

The rendered [candidate-site visual review notebook](../../notebooks/candidate-site-visual-review.ipynb) provides the roster/ROI map, local ROI panels, data-volume bars and the historical four-site p95 chart. Its opening and p95-section warnings explain that supplied p95 values are not reproduced measurements or selection evidence. The figures visualize metadata and ROI outlines, not full-resolution terrain.

## Verification and limits

The setup has been checked for internal file links, status consistency, instruction/template references and clean diffs. The temporary setup-review report has been removed; enduring rules remain in the workflow and testing policy. No executable tests, CI jobs, dataset files or package dependencies were added to the repository; the temporary Rasterio reader and pixel windows were outside it. Agent-client loading and application/scientific behavior remain unverified.

PR #2 correction check, 14 November 2026: checked 41 Markdown files plus notebook Markdown, 170 local links and 9 heading fragments with no missing targets. Notebook JSON parsed; all six code cells, their outputs and metadata were unchanged, including four embedded PNGs. Scoped whitespace and credential-pattern checks passed. This correction changes documentation only; notebook execution, raster profiles and scientific validation were not rerun.
