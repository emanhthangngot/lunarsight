# Pilot data-mining inventory

Status: **research proposal, checked 13 November 2026**. This inventory narrows the accepted feature scope in [ADR 0002](decisions/0002-data-mining-feature-scope.md). It is not approval to acquire data. No files have been downloaded for this plan.

## Recommended pilot sites for coverage review

The current research shortlist is **Site04 (Shackleton rim), Site11 (de Gerlache rim), and Site23 (Malapert massif)**. NASA PGDA product 78 lists 5 m/pixel products for these site regions, including LDEM, slope, LDEC count, elevation/slope uncertainty and DEM clones. The team-provided `Resource.docx` also names **Site01 (Connecting ridge)** as a candidate example. Compare Site01 with the current three before fixing the pilot list; its inclusion here does not select it. These are data-coverage candidates, not validated landing coordinates: inspect each archive ROI and coordinate record, verify naming and frame, and do not substitute a feature center for a proposed landing point.

If schedule or local-product volume is restrictive, compare Site04 and Site11 as the initial pair, with Site01 as the resource-document alternative; add Site23 only after checking its exact ROI overlap and file sizes. This is a review order, not an approved site selection. Mission associations remain proposals until reviewed against authoritative coordinates and nomenclature.

## Source-to-feature inventory

| Feature / priority | Candidate product or service | Required contents | Known conventions / coverage | Planning volume | Decision still needed |
| --- | --- | --- | --- | --- | --- |
| Site catalog — P0 | NASA PGDA 78 site/ROI metadata; NASA mission records and USGS/IAU nomenclature for independent identity checks | Site ID, name, point/ROI geometry, elevation source, mission status, citations | PGDA 78 includes Site04, Site11, Site23 and additional site regions; a named feature is not itself a landing coordinate | Tiny metadata table (KB-scale, estimate) | Confirm the 2–3 sites, representative analysis points, and naming policy |
| Local high-resolution terrain — P0/P1 | NASA PGDA 78 | Nominal LDEM, slope, LDEC, elevation and slope RMS uncertainty; a small clone subset for P1 | 5 m/pixel GeoTIFFs in south polar stereographic X/Y metres, MOON_ME frame with DE421; PGDA reports about 90% interpolated 5 m pixels. Site01, Site04, Site11 and Site23 are listed in the archive. | Per-file sizes for the selected site/ROI bundles remain to be recorded. All 100 clones are out of the first pilot; select a small subset only if P1 uncertainty propagation is approved. | Which locations/layers/clones; confirm effective resolution, ROI and exact archive byte sizes |
| Surrounding terrain — P0 | NASA PGDA 90; compare 80S 80MPP and 80S 20MPP | LDEM, LDEC, elevation error, slope and slope error for horizon context | COG GeoTIFFs in south polar stereographic X/Y metres, MOON_ME / DE421. Nominal pixel scale is not effective resolution; evaluate the published effective-resolution layer separately if useful. | Five full 80 m rasters total about **1,006 MB** (181 + 111 + 244 + 231 + 239 MB). The corresponding five full 20 m rasters total about **14.9 GB** (1.3 + 2.6 + 3.7 + 3.6 + 3.7 GB). Effective-resolution rasters are excluded. These are source-file totals, not clipped pilot sizes or range-request bytes. | Compare full-file and COG window/cutout access; determine needed horizon extent and whether 80 m terrain is sufficient before choosing a scale |
| Sun/Earth ephemeris — P0 | JPL Horizons API; Astroquery is a possible client library, not a selected dependency | Time-tagged Sun and Earth geometry for each selected lunar observer/site; preserve query settings and returned metadata | `Resource.docx` suggests Sun target 10, Earth target 399, and a lunar-centered observer (301) with site coordinates. Treat these as candidate query settings to validate. Horizons geometry does not include terrain obstruction. | Small per site/date response; estimate after choosing cadence and scenario count | Validate CENTER/observer coordinates, coordinate convention, UTC/time scale, reference frame, aberration/refraction settings and cadence with a saved sample response |
| Horizon and mission-window summaries — P0 | Derived from selected terrain + ephemeris | Azimuth/elevation, local terrain horizon, visibility state, interval durations, longest dark interval and simultaneous Sun/Earth visibility | Horizons altitude is relative to the local horizontal. The terrain horizon must be calculated separately from DEM. Model the Moon without atmospheric refraction and account for lunar curvature and observer height. | Small tables/arrays compared with raster inputs; size depends on cadence and retained trials | Choose cadence and transition refinement; establish reference cases before calling results verified |
| DEM uncertainty analysis — P1 | PGDA 78 uncertainty layers and limited DEM clone sample | Recompute terrain horizons/illumination against nominal DEM and selected alternatives | Clones represent modeled DEM alternatives, not independent observations or different landing coordinates | Unquantified until clone count and local file sizes are checked | Select clone sample and summary statistic; compare with published method and independent reference evidence |
| Visual/context layers — P2 | Quickmap/Moon Trek for discovery; selected LROC images only if needed | Optional image context; no full archive mirror | Visual imagery is not elevation or a science measurement of thermal/resource quantities | No estimate until selected tiles/zoom are known | Defer unless the demo needs imagery after P0/P1 are supported |

### Planning-volume conclusion

The current full-file comparison is about **1,006 MB at 80 m** versus **14.9 GB at 20 m** for the five listed PGDA 90 terrain layers. These totals do not include local PGDA 78 files, derived outputs, or storage overhead; range/window access may reduce bytes transferred but must be demonstrated against the actual archive. `Resource.docx` also gives illustrative uncompressed float32 sizes per layer: 20 × 20 km at 20 m/pixel ≈4 MB; 20 × 20 km at 5 m/pixel ≈64 MB; 100 × 100 km at 5 m/pixel ≈1.6 GB. They are arithmetic planning examples, not source-file sizes or footprints. A cutout must be large enough to capture terrain controlling the horizon. Do not add these figures to the earlier 56.2 GB example, which remains unapproved and differently scoped.

### Other resources and physical interpretation limits

- `Resource.docx` lists a South Pole PSR shapefile package (~1.07 MB) as optional context and a full LROC South Pole PSR mosaic (~13.77 GB) as an imagery example. Keep both out of P0; verify the exact archive/version and use a regional tile or downsampled image only if visual context is needed. A PSR overlay is not a time-specific shadow simulation.
- SPICE/SpiceyPy is an optional offline path if reproducibility, API availability or offline operation requires it. Kernel selection depends on bodies and time span; no kernel set or size is selected. Astroquery, Rasterio, NumPy, Astropy, SciPy and Plotly are possible implementation tools named in `Resource.docx`, not approved stack/dependencies.
- Earth visibility is a geometric line-of-sight result, not proof of a link to a particular ground station. Sunlight duration is not electrical energy or battery sufficiency. Keep link and power models deferred until antenna/station and hardware/operations inputs are defined.

## Data contract to prepare before acquisition

| Entity | Required fields before importing observations |
| --- | --- |
| Site | `site_id`, source name, approved display name, latitude/longitude convention if applicable, projected coordinates when used, elevation/datum, mission/site status, source URI, coordinate source and review status |
| Raster asset | Product/version, instrument, variable, units, native pixel scale, effective resolution if supplied, CRS/frame, map projection, footprint, valid-data mask, nodata rule, scale/offset, uncertainty layer, archive size/checksum, source URI and retrieval date |
| Ephemeris series | `site_id`, target body, observer definition/height, UTC timestamp, Horizons query/settings, time scale, reference frame, coordinate convention, angular units, sampling step, source/version and retrieval timestamp |
| Derived horizon/result | Input asset IDs, method/version, azimuth convention, observer height, time window, cadence/refinement, visibility definition, missing-data treatment, output units and validation state |

For Horizons, preserve the target identifier (candidate Sun `10` or Earth `399`), observer center/coordinates (candidate lunar center `301` plus site coordinates), and whether reported altitude is geometric/apparent. Keep terrain-horizon altitude as a distinct derived field. For any later power/link calculation, record the device, station, and mission assumptions separately from geometric visibility/illumination.

Keep metadata tables and file-level manifests separate from raster pixels. Do not populate illustrative coordinates, mission assumptions, or missing science fields with demo values.

## Recommended next sequence

1. Compare Site01 (Connecting ridge), Site04, Site11 and Site23 against the team-proposed use case. Inspect the exact PGDA 78 ROI files, coordinates, availability and byte sizes before selecting pilot locations.
2. Compare PGDA 90 80S 80MPP and 20MPP coverage, file sizes and COG window/cutout access. Determine the surrounding extent needed for terrain horizons; do not equate the landing-site ROI to a sufficient horizon footprint.
3. Perform one documented Horizons feasibility query for Sun and Earth using a reviewed lunar observer location; validate target/center settings, angle conventions, time/frame fields, no-atmosphere treatment and response size.
4. Submit the proposed sites, selected layers, exact footprint, total bytes and open validation questions for team decision.
5. Only after that decision and a separate explicit acquisition/processing request, create the asset manifest and begin data handling.

## Sources checked

- [NASA PGDA product 78 — High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78)
- [NASA PGDA product 90 — A New View of the Lunar South Pole from LOLA](https://pgda.gsfc.nasa.gov/products/90)
- [JPL Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [NASA Space Apps Lunar Landing Site Navigator resources](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources)
- Team-provided [Resource.docx planning document](https://docs.google.com/document/d/1aNnEIbrAzsKJm3FffKX9eGWTH9oUM-_W7JUQlNdLkc8/edit?tab=t.unv6tu6eviha) (reviewed 13 November 2026; estimates remain proposals)
- [NASA CLPS deliveries](https://www.nasa.gov/commercial-lunar-payload-services/clps-landing-sites/)
- [USGS/IAU Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/)
