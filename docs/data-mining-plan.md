# Pilot data-mining inventory

Status: **research proposal, checked 13 November 2026**. This inventory narrows the accepted feature scope in [ADR 0002](decisions/0002-data-mining-feature-scope.md). It is not approval to acquire data. No files have been downloaded for this plan.

## Recommended pilot sites for coverage review

Start with the PGDA site identifiers **Site04 (Shackleton rim), Site11 (de Gerlache rim), and Site23 (Malapert massif)**. NASA's product 78 lists these as site-specific LOLA DEM areas and provides a 5 m/pixel LDEM, slope, LDEC count, elevation/slope uncertainty and 100 DEM clones for site regions. The trio is a research shortlist, not a validated landing-site catalog: use each archive ROI/coordinate record, verify naming and coordinate frame, and do not substitute the feature center for a proposed landing point.

If schedule or local-product volume is restrictive, begin with Site04 and Site11, then add Site23 only after checking exact ROI overlap and file sizes. Site selection and mission associations remain proposals until reviewed against authoritative coordinates and nomenclature.

## Source-to-feature inventory

| Feature / priority | Candidate product or service | Required contents | Known conventions / coverage | Planning volume | Decision still needed |
| --- | --- | --- | --- | --- | --- |
| Site catalog — P0 | NASA PGDA 78 site/ROI metadata; NASA mission records and USGS/IAU nomenclature for independent identity checks | Site ID, name, point/ROI geometry, elevation source, mission status, citations | PGDA 78 includes Site04, Site11, Site23 and additional site regions; a named feature is not itself a landing coordinate | Tiny metadata table (KB-scale, estimate) | Confirm the 2–3 sites, representative analysis points, and naming policy |
| Local high-resolution terrain — P0/P1 | NASA PGDA 78 | Nominal LDEM, slope, LDEC, elevation and slope RMS uncertainty; a small clone subset for P1 | 5 m/pixel GeoTIFFs in south polar stereographic X/Y metres, MOON_ME frame with DE421; interpolation is substantial (PGDA reports about 90% interpolated 5 m pixels) | Per-file sizes for the selected site/ROI bundles were not available in the readable product summary; inventory archive links and byte sizes before selecting. All 100 clones are explicitly out of the first pilot. | Which local layers and how many clones; confirm effective resolution and ROI overlap |
| Surrounding terrain — P0 | NASA PGDA 90, proposed baseline: 80S 80MPP LDEM, LDEC, elevation error, slope and slope error | Coarser elevation and obstruction context surrounding candidate sites | COG GeoTIFF, south polar stereographic X/Y metres, MOON_ME / DE421; nominal pixel scale 80 m, not a claim of 80 m effective resolution | Listed archive sizes sum to about **1,006 MB** for the five full raster files (181 + 111 + 244 + 231 + 239 MB). This is a full product set, not a clipped pilot download. | Verify source units/size convention and whether server-side windowed access or local clipping is available; otherwise budget about 1.0 GB before derived outputs |
| Sun/Earth ephemeris — P0 | JPL Horizons API | Time-tagged Sun and Earth geometry for each selected observer/site; preserve query settings and returned metadata | API supports observer ephemerides, site coordinates, time interval, step size, and selectable time scales. Horizon obstruction from local topography is a separate calculation. | Small per site/date response; estimate only after choosing cadence and number of scenarios | Validate lunar observer definition, coordinate convention, time scale, reference frame, aberration settings and cadence with a sample query |
| Horizon and mission-window summaries — P0 | Derived from selected terrain + ephemeris | Azimuth/elevation, terrain horizon, visibility state, interval durations, longest dark interval and simultaneous Sun/Earth visibility | Derived products must retain the input product IDs, frames, observer height, time interval and sampling/refinement method | Small tables/arrays compared with raster inputs; size depends on cadence and retained trials | Choose cadence, transition refinement and interval rules; establish reference cases before calling results verified |
| DEM uncertainty analysis — P1 | PGDA 78 uncertainty layers and limited DEM clone sample | Recompute terrain horizons/illumination against nominal DEM and selected alternatives | Clones represent modeled DEM alternatives, not independent observations or different landing coordinates | Unquantified until clone count and local file sizes are checked | Select clone sample and summary statistic; compare with published method and independent reference evidence |
| Visual/context layers — P2 | Quickmap/Moon Trek for discovery; selected LROC images only if needed | Optional image context; no full archive mirror | Visual imagery is not elevation or a science measurement of thermal/resource quantities | No estimate until selected tiles/zoom are known | Defer unless the demo needs imagery after P0/P1 are supported |

### Planning-volume conclusion

The only defensible numerical pilot estimate from the current readable product metadata is **about 1,006 MB for the five full PGDA 90 80 m rasters** listed above. Local PGDA 78 file sizes, derived outputs, and storage overhead are not yet counted. Do not add that value to the prior 56.2 GB scenario: the latter is an unapproved, differently scoped example. Before acquisition, resolve whether COG range/window access or clipped derivatives are allowed and record both the downloaded bytes and the retained footprint.

## Data contract to prepare before acquisition

| Entity | Required fields before importing observations |
| --- | --- |
| Site | `site_id`, source name, approved display name, latitude/longitude convention if applicable, projected coordinates when used, elevation/datum, mission/site status, source URI, coordinate source and review status |
| Raster asset | Product/version, instrument, variable, units, native pixel scale, effective resolution if supplied, CRS/frame, map projection, footprint, valid-data mask, nodata rule, scale/offset, uncertainty layer, archive size/checksum, source URI and retrieval date |
| Ephemeris series | `site_id`, target body, observer definition/height, UTC timestamp, Horizons query/settings, time scale, reference frame, coordinate convention, angular units, sampling step, source/version and retrieval timestamp |
| Derived horizon/result | Input asset IDs, method/version, azimuth convention, observer height, time window, cadence/refinement, visibility definition, missing-data treatment, output units and validation state |

Keep metadata tables and file-level manifests separate from raster pixels. Do not populate illustrative coordinates, mission assumptions, or missing science fields with demo values.

## Recommended next sequence

1. Inspect PGDA 78 ROI definitions and exact archive files for Site04, Site11 and Site23; record sizes and coverage before selecting pilot sites.
2. Check overlap of those ROIs with PGDA 90 80S products and determine a sufficient surrounding-terrain radius for horizon calculations.
3. Perform one documented Horizons feasibility query using an archive-supported point and observer height; verify frames/time fields and response size.
4. Submit the proposed sites, selected layers, exact footprint, total bytes and open validation questions for team decision.
5. Only after that decision and a separate explicit acquisition/processing request, create the asset manifest and begin data handling.

## Sources checked

- [NASA PGDA product 78 — High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78)
- [NASA PGDA product 90 — A New View of the Lunar South Pole from LOLA](https://pgda.gsfc.nasa.gov/products/90)
- [JPL Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [NASA Space Apps Lunar Landing Site Navigator resources](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources)
- [NASA CLPS deliveries](https://www.nasa.gov/commercial-lunar-payload-services/clps-landing-sites/)
- [USGS/IAU Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/)
