# Pilot data-mining inventory

Status: **research proposal, checked 14 November 2026**. This inventory narrows the accepted feature scope in [ADR 0002](decisions/0002-data-mining-feature-scope.md). It is not approval for bulk raster acquisition. Four small ROI shapefile bundles were downloaded temporarily to inspect their geometry. Six reference centers have bounded 9×9 reads at local 5 m and PGDA 90 80 m/20 m; Site20v2 also had a local 5 m point read. A broader alternative screen checked metadata and HTTP HEAD sizes for Site06, Site42 and Haworth, without reading raster pixels. The original four centers were profiled to 25 km at both scales and 131.8 km at 80 m for an illustrative 5 km-relief case. All completed profile-circle reads were valid, and no full raster was saved. The profile runs transferred about 414.4 MB in total, including overlapping/repeated tile ranges and an interrupted read. The temporary ROI bundles and Rasterio reader are outside the repository.

## Recommended pilot sites for coverage review

The original comparison cohort is **Site01 (Connecting Ridge), Site04 (Shackleton rim), Site11 (de Gerlache rim 1), and Site23 (Malapert massif)**. Site04/11/23 came from the initial PGDA 78 shortlist; the team-provided `Resource.docx` also named Site01. Bounded point checks added **Site07 (Peak near Shackleton)** and **Site20 (Leibnitz Beta Plateau)**. A further metadata-only screen covered **Site06 (Nobile Rim 1), Site42 (de Gerlache-Kocher Massif), and Haworth**. The official PGDA page lists 27 product entries, including Site20v2 as an alternate version and many named regional products. These nine geographic candidates are still only a subset; the earlier four-site comparison reflected team references and bounded initial scope, not an exhaustive technical shortlist. These are data-coverage candidates, not validated landing coordinates.

The Site07 and Site20 screen confirms point-window coverage, but does not promote them into the analysis cohort. Site07 has a small ROI bundle, although its Data Book reference center falls outside both ROI polygons. Site20 and its larger Site20v2 raster set have no ROI link on the PGDA page. The PGDA page lists a Site06 ROI link, but that link currently returns a not-found page; no ROI link is listed for Site42 or Haworth. The alternative screen checked only file availability and size for Site06/Site42/Haworth; it did not read raster pixels. Check each selected analysis point against a verified ROI and raster coverage before assigning a site to the pilot.

NASA's 2025 Lunar Surface Data Book provides reference centers generated from the PGDA DEM polygons (the source reports 5–10 m center-point accuracy). Use these only as reproducible metadata/test points until the team chooses analysis points; a polygon center is not a landing authorization or a selected landing coordinate.

| Candidate | Reference center (latitude, longitude; degrees) |
| --- | --- |
| Site01 — Connecting Ridge | −89.4632, −137.49 |
| Site04 — Shackleton Rim | −89.7668, −171.87 |
| Site06 — Nobile Rim 1 | −85.4381, 37.36667 |
| Site07 — Peak near Shackleton | −88.811, 123.6901 |
| Site11 — de Gerlache Rim 1 | −88.6834, −67.9321 |
| Site20 — Leibnitz Beta Plateau | −85.4266, 31.74276 |
| Site23 — Malapert Massif | −85.9948, −0.23578 |
| Site42 — de Gerlache-Kocher Massif | −85.8296, −116.322 |
| Haworth | −86.7639, −22.777 |

If schedule or local-product volume is restrictive, compare Site04 and Site11 as the initial pair, with Site01 as the resource-document alternative; Site23 remains a candidate after locating a verified ROI and checking its shorter margin to the 80S regional-data edge. Site07 and Site20 are newly screened coverage candidates only; ROI verification and team relevance remain open. This is a review order, not an approved site selection. Mission associations remain proposals until reviewed against authoritative coordinates and nomenclature.

## Source-to-feature inventory

| Feature / priority | Candidate product or service | Required contents | Known conventions / coverage | Planning volume | Decision still needed |
| --- | --- | --- | --- | --- | --- |
| Site catalog — P0 | NASA PGDA 78 site/ROI metadata; NASA mission records and USGS/IAU nomenclature for independent identity checks | Site ID, name, point/ROI geometry, elevation source, mission status, citations | The current comparison covers six point-screened sites plus metadata-only Site06/Site42/Haworth; PGDA 78 lists 27 product entries including Site20v2, not a complete mission landing-site catalog | Tiny metadata table (KB-scale, estimate) | Confirm the pilot sites, representative analysis points, and naming policy |
| Local high-resolution terrain — P0/P1 | NASA PGDA 78 | Nominal LDEM, slope, LDEC, elevation and slope RMS uncertainty; a small clone subset for P1 | 5 m/pixel GeoTIFFs in south polar stereographic X/Y metres, MOON_ME frame with DE421; PGDA reports about 90% interpolated 5 m pixels. Base products exist for all six screened references; Site20v2 is a larger alternate product set. | HTTP HEAD sizes for five core TIFFs per screened center are shown below. 9×9 LDEM point reads passed for Site01/04/07/11/20/23 and Site20v2; no full raster was saved. All 100 clones and XYZI point clouds are excluded. | Choose locations/layers/clones; check actual selected analysis points and verified ROI polygons before selecting |
| Surrounding terrain — P0 | NASA PGDA 90; compare 80S 80MPP and 80S 20MPP | LDEM, LDEC, elevation error, slope and slope error for horizon context | COG GeoTIFFs in south polar stereographic X/Y metres, MOON_ME / DE421. Nominal pixel scale is not effective resolution; evaluate the published effective-resolution layer separately if useful. | HTTP HEAD totals for the five full rasters are **1,051,288,835 bytes** at 80 m and **15,617,598,506 bytes** at 20 m. Four 9×9 point windows and 20 km/25 km profiles were read at both scales; all four centers were then profiled to 131.8 km at 80 m in a provisional relief scenario. | Determine full horizon extent and compare profiles against an accepted angular tolerance before selecting a scale |
| Sun/Earth ephemeris — P0 | JPL Horizons API; Astroquery is a possible client library, not a selected dependency | Time-tagged Sun and Earth geometry for each selected lunar observer/site; preserve query settings and returned metadata | `Resource.docx` suggests Sun target 10, Earth target 399, and a lunar-centered observer (301) with site coordinates. Treat these as candidate query settings to validate. Horizons geometry does not include terrain obstruction. | Small per site/date response; estimate after choosing cadence and scenario count | Validate CENTER/observer coordinates, coordinate convention, UTC/time scale, reference frame, aberration/refraction settings and cadence with a saved sample response |
| Horizon and mission-window summaries — P0 | Derived from selected terrain + ephemeris | Azimuth/elevation, local terrain horizon, visibility state, interval durations, longest dark interval and simultaneous Sun/Earth visibility | Horizons altitude is relative to the local horizontal. The terrain horizon must be calculated separately from DEM. Model the Moon without atmospheric refraction and account for lunar curvature and observer height. | Small tables/arrays compared with raster inputs; size depends on cadence and retained trials | Choose cadence and transition refinement; establish reference cases before calling results verified |
| DEM uncertainty analysis — P1 | PGDA 78 uncertainty layers and limited DEM clone sample | Recompute terrain horizons/illumination against nominal DEM and selected alternatives | Clones represent modeled DEM alternatives, not independent observations or different landing coordinates | Unquantified until clone count and local file sizes are checked | Select clone sample and summary statistic; compare with published method and independent reference evidence |
| Visual/context layers — P2 | Quickmap/Moon Trek for discovery; selected LROC images only if needed | Optional image context; no full archive mirror | Visual imagery is not elevation or a science measurement of thermal/resource quantities | No estimate until selected tiles/zoom are known | Defer unless the demo needs imagery after P0/P1 are supported |

### Planning-volume conclusion

The current full-file comparison is **1,051,288,835 bytes (~1.051 GB)** at 80 m versus **15,617,598,506 bytes (~15.618 GB)** at 20 m for five PGDA 90 terrain layers. These totals exclude effective-resolution rasters, local PGDA 78 files, derived outputs, and storage overhead. Point reads and bounded `/vsicurl` horizon windows succeeded at both resolutions; the profile comparison is summarized below. `Resource.docx` also gives illustrative uncompressed float32 sizes per layer: 20 × 20 km at 20 m/pixel ≈4 MB; 20 × 20 km at 5 m/pixel ≈64 MB; 100 × 100 km at 5 m/pixel ≈1.6 GB. These are arithmetic examples, not archive sizes or selected footprints. A cutout must capture the terrain that controls the horizon. Do not add these figures to the earlier 56.2 GB example, which remains unapproved and differently scoped.

### PGDA 78 exact sizes for five core rasters

Sizes are the NASA endpoint `Content-Length` values read with HTTP HEAD on 13 November 2026. Columns are LDEM surface, LDEC count, slope, total-Z RMS error, and slope RMS error. The totals exclude ROI archives, clones, and XYZI point clouds.

| Site | LDEM (bytes) | LDEC (bytes) | Slope (bytes) | Z error (bytes) | Slope error (bytes) | Five-layer total (bytes) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Site01 — Connecting ridge | 40,980,810 | 40,980,744 | 40,980,776 | 40,980,810 | 40,980,810 | 204,903,950 |
| Site04 — Shackleton rim | 40,980,806 | 40,980,740 | 40,980,772 | 40,980,808 | 40,980,806 | 204,903,932 |
| Site07 — Peak near Shackleton | 40,980,808 | 40,980,742 | 40,980,774 | 40,980,810 | 40,980,808 | 204,903,942 |
| Site11 — de Gerlache rim | 40,980,806 | 40,980,742 | 40,980,774 | 40,980,810 | 40,980,808 | 204,903,940 |
| Site20 — Leibnitz Beta Plateau | 40,980,802 | 40,980,740 | 40,980,772 | 40,980,809 | 40,980,807 | 204,903,930 |
| Site23 — Malapert massif | 70,586,804 | 70,586,742 | 70,586,810 | 70,586,811 | 70,586,809 | 352,933,976 |
| **Six screened base site sets** |  |  |  |  |  | **1,377,453,670** |
| Site20v2 — alternate Site20 set (not included above) | 108,192,905 | 108,192,845 | 108,192,875 | 108,192,913 | 108,192,911 | 540,964,449 |

Site20v2's five-layer total is about 2.64× the original Site20 set. It is listed as an alternate product version, not a seventh site or an approved replacement.

### Additional PGDA alternatives: metadata-only screen

The official page also lists Site06, Site42 and Haworth products. Their NASA Data Book centers are included in the candidate table above, but none received a point-window read in this screen. HEAD requests returned HTTP 200 for each of the five core GeoTIFF layers; totals are exact `Content-Length` sums checked 14 November 2026. Site06's listed ROI link returns a PGDA not-found page. The product page does not list an ROI link for Site42 or Haworth.

| Candidate | Five-layer total (bytes) | Available ROI evidence | Screen status |
| --- | ---: | --- | --- |
| Site06 — Nobile Rim 1 | 320,127,929 | PGDA page lists ROI link; link currently returns not-found HTML | Metadata/size only; no pixel window |
| Site42 — de Gerlache-Kocher Massif | 320,127,973 | No ROI link listed on PGDA page | Metadata/size only; no pixel window |
| Haworth | 710,618,745 | No ROI link listed on PGDA page | Metadata/size only; no pixel window |

This suggests Site06 as the next candidate to check if the team wants another named site near the already screened Leibnitz/Nobile area, but its ROI link must be repaired or replaced with a verified analysis footprint. Site42 or Haworth are geographically distinct alternatives with larger five-layer transfer totals. This is a screening order based on available metadata, not a site recommendation or an approved cohort.

These are file-transfer totals, not evidence that the site footprints are spatially comparable or sufficient for horizon work. The six screened centers each had a 9×9 LDEM window with 81/81 valid pixels; this does not include Site06, Site42 or Haworth. The exact team-selected analysis points and ROI geometries still need inspection against each raster's coverage; no full raster was retained.

### ROI geometry inspection

Four compressed ROI bundles were retrieved temporarily from the PGDA 78 site paths and parsed for vector geometry. Bounding boxes below are in projected X/Y metres from the bundled shapefile; they describe the union envelope of the ROI polygons, not the full raster extent or a landing-point coordinate. The `.prj` files specify south polar stereographic projection on a 1,737,400 m lunar sphere, while the shapefile CRS identifiers are labeled `unknown`; reconcile them with each raster's GeoTIFF CRS/frame before combining coordinates.

| Site | ROI bundle status/size | Polygon count | Union bbox X/Y (m) | Approx. envelope |
| --- | --- | ---: | --- | --- |
| Site01 — Connecting ridge | Valid TGZ, 2,934 bytes | 7 | X −11,657.5 to −10,167.5; Y −12,637.5 to −11,492.5 | 1,490 × 1,145 m |
| Site04 — Shackleton rim | Valid TGZ, 1,712 bytes | 4 | X −2,842.5 to −2,627.5; Y −6,802.5 to −5,902.5 | 215 × 900 m |
| Site06 — Nobile Rim 1 | PGDA page lists ROI link, but link currently returns not-found HTML | Unknown | Not available | Needs a verified ROI or analysis area |
| Site07 — Peak near Shackleton | Valid TGZ, 1,312 bytes | 2 | X 29,962.5 to 30,202.5; Y −20,167.5 to −19,962.5 | 240 × 205 m |
| Site11 — de Gerlache rim | Valid TGZ, 1,719 bytes | 4 | X −37,672.5 to −36,477.5; Y 14,312.5 to 14,927.5 | 1,195 × 615 m |
| Site20 — Leibnitz Beta Plateau | No ROI link; expected `Site20/Site20_ROIs.tgz` path returns PGDA not-found HTML | Unknown | Not available | Needs a verified ROI or raster-derived analysis area |
| Site20v2 — alternate Site20 product | No ROI link; expected `Site20v2/Site20v2_ROIs.tgz` path returns PGDA not-found HTML | Unknown | Not available | No verified ROI found |
| Site23 — Malapert massif | No valid TGZ at the expected `Site23/Site23_ROIs.tgz` path; request returned an HTML not-found page | Unknown | Not available from that bundle | Needs a verified ROI definition or raster-derived coverage check |
| Site42 — de Gerlache-Kocher Massif | No ROI link listed on PGDA page | Unknown | Not checked | Needs a verified ROI or analysis area |
| Haworth | No ROI link listed on PGDA page | Unknown | Not checked | Needs a verified ROI or analysis area |

The Site01/04/07/11 archive DBF records expose projected X/Y attributes, but their semantic role is not sufficiently documented to call them approved analysis points. The Site07 Data Book reference center projects inside the union envelope but outside both Site07 polygons. Site20 and Site23 therefore cannot be compared against verified ROI polygons. Their Data Book reference centers do have valid pixels in the small LDEM window checks below; coverage for a team-selected point or polygon remains to be checked. The temporary ROI bundles remain outside the repository and are not part of the project data store.

### Reference-center to ROI coordinate check

The six screened NASA Data Book reference centers were transformed from longitude/latitude into the shapefile `.prj` projection using spherical south-polar stereographic parameters: central meridian 0°, standard parallel −90°, false easting/northing 0 m, and lunar radius 1,737,400 m. The `.prj` files label their CRS identifiers `unknown`, so this is a reproducible interpretation of their projection parameters, not an authoritative raster-CRS comparison.

| Site | Projected reference center X/Y (m) | Relation to available ROI polygons |
| --- | --- | --- |
| Site01 | −10,999.145 / −11,999.255 | Inside the union bounding box, outside all seven polygons |
| Site04 | −1,000.037 / −7,000.346 | Outside the union bounding box and all four polygons |
| Site07 | 30,000.192 / −20,000.153 | Inside union envelope, outside both polygons |
| Site11 | −37,000.510 / 15,000.207 | Outside the union bounding box and all four polygons |
| Site20 | 72,999.635 / 117,999.415 | No verified ROI archive to compare |
| Site23 | −499.990 / 121,499.535 | No usable ROI archive to compare |

This result means the Data Book reference centers are not interchangeable with the PGDA ROI polygons. ROI polygons are analysis areas within the product, not verified raster bounds or authoritative landing points. The polygon comparison alone did not establish raster coverage; the small reference-center pixel reads below subsequently verified center coverage in the inspected local and regional LDEMs. Coverage for any different, team-selected point or ROI still needs its own check.

### Raster point-coverage and COG window reads

Rasterio 1.5.2 was installed temporarily outside the repository and used through GDAL `/vsicurl`. Each read requested a 9×9 pixel window centered on the projected NASA reference point. All 81 pixels were valid at Site01/04/07/11/20/23 in the applicable local PGDA 78 5 m LDEM and in the PGDA 90 80 m and 20 m LDEMs. Site20v2 also had 81/81 valid pixels in its local 5 m LDEM. These checks verify coverage at reference centers only; they do not select those centers as landing/analysis points or verify ROI polygons. Site20's regional windows were read on the base Site20 point, not on Site20v2.

| Site | PGDA 78 5 m bounds (Xmin, Ymin, Xmax, Ymax; m) | 5 m row/col; window elevation range (m) | 80 m row/col; range (m) | 20 m row/col; range (m) |
| --- | --- | --- | --- | --- |
| Site01 | −19,000, −20,000, −3,000, −4,000 | 1599 / 1600; 1941.240–1946.973 | 3949 / 3662; 1881–1956 | 15799 / 14650; 1933–1950 |
| Site04 | −9,000, −15,000, 7,000, 1,000 | 1600 / 1599; 758.054–785.745 | 3887 / 3787; 558–982 | 15550 / 15149; 723–832 |
| Site07 | Bounds not recorded in this screen | 1600 / 1600; 1643.553–1647.301 | 4050 / 4175; 1603.037–1647.657 | 16200 / 16700; 1640.688–1648.611 |
| Site11 | −45,000, 7,000, −29,000, 23,000 | 1599 / 1599; 1792.609–1794.521 | 3612 / 3337; 1729–1807 | 14449 / 13349; 1782–1800 |
| Site20 | Bounds not recorded in this screen | 1600 / 1599; 6393.463–6401.779 | 2325 / 4712; 6335.624–6450.165 | 9300 / 18849; 6381.691–6411.994 |
| Site23 | −11,000, 111,000, 10,000, 132,000 | 2100 / 2100; 4782.270–4785.751 | 2281 / 3793; 4743–4820 | 9125 / 15175; 4776–4792 |

Raster row/column indices are zero-based. Every listed window contained 81/81 valid cells. The range values are surface elevation in metres; the 9×9 windows cover different ground areas at 5 m, 20 m, and 80 m, so their min/max values are not a direct resolution comparison. Local bounds were not recorded for the newly screened Site07 and Site20 rasters; retain that as a metadata follow-up if either is selected. The previously inspected local rasters use 3,200×3,200 pixels for Site01/04/11 and 4,200×4,200 for Site23, with bounds shown above. The PGDA 90 80 m raster is 7,600×7,600 pixels; the 20 m raster is 30,400×30,400; both report bounds X/Y ±304,000 m.

| PGDA 90 product | Full LDEM size | Range data transferred for four windows | Window result |
| --- | ---: | ---: | --- |
| `LDEM_80S_80MPP_ADJ.TIF` | 189,158,392 bytes | 2,048,000 bytes (about 1.08%) | Four 9×9 windows, all valid |
| `LDEM_80S_20MPP_ADJ.TIF` | 2,696,082,051 bytes | 3,112,960 bytes (about 0.12%) | Four 9×9 windows, all valid |

Transferred-byte counts sum the successful HTTP 206 `Content-Range` responses for the metadata and required raster blocks; failed/empty requests and HTTP headers are not counted. No full raster was retained. The PGDA 90 GeoTIFF WKT identifies the 1,737,400 m lunar sphere and south-polar stereographic IAU 30135 map CRS; the PGDA product description separately declares the surface-reference frame as `MOON_ME` / DE421. Preserve both map-CRS metadata and the product's frame provenance in any later asset manifest.

### Horizon-extent planning estimate

The 80S regional COGs have projected bounds X/Y ±304,000 m. With the 1,737,400 m lunar sphere, this is approximately the 80°S boundary radius. The minimum outward distance from each reference center to that boundary is therefore about 182.5 km for Site23, 264.1 km for Site11, 287.7 km for Site01, and 296.9 km for Site04.

For a spherical body and an observer near the surface, an isolated obstacle `Δh` above the observer has a geometric horizon distance of approximately `d ≈ sqrt(2 R Δh)`. This is an idealized planning bound; real horizon profiles depend on the terrain along every azimuth, observer height, and valid-data edges.

| Relative obstacle height `Δh` | Approximate horizon distance |
| ---: | ---: |
| 1 km | 58.9 km |
| 5 km | 131.8 km |
| 10 km | 186.4 km |

The Site23 80S outward margin corresponds to about 9.6 km of relative relief under this approximation; the other three margins correspond to about 20–25 km. Thus, a 5 km relief scenario fits within the 80S coverage for all four centers, while a 10 km scenario marginally exceeds the Site23 margin. This does not establish that 80 m is sufficient or that the actual terrain reaches those reliefs. **Planning recommendation:** use 80 m as the first far-field candidate, compare its horizon profile with 20 m over the same footprint, and extend to the PGDA 90 60S 240MPP context only if a horizon ray approaches the valid-data edge or the profile remains terrain-limited there. The five-layer 20 m stack is about 14.9 times the 80 m stack, so keep it as a comparison option until that profile check demonstrates value. This recommendation does not select a product or footprint.

### Bounded 80 m / 20 m horizon-profile comparison

An exploratory profile comparison was computed at the four NASA reference centers using the PGDA 90 80 m and 20 m LDEMs. Each profile covers a 20 km radius (40×40 km raster window) with 360 one-degree azimuth bins, measured clockwise from north. For each bin, the reported horizon is the maximum apparent terrain elevation after an idealized lunar-curvature correction `z_relative − d²/(2R)`, with `R = 1,737,400 m`. All cells in these windows were valid. This method and radius are exploratory; no scientific acceptance tolerance or final observer point has been selected.

| Site | 80 m profile range (°) | 20 m profile range (°) | Mean / 95th percentile / max absolute difference (°) | Bins differing >0.1° (of 360) | Max in outer 10% of 20 km window (80 m / 20 m) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Site01 | −8.579 to 1.796 | −7.792 to 3.320 | 2.406 / 7.401 / 9.860 | 344 | 58 / 3 |
| Site04 | 0.142 to 31.841 | 0.132 to 31.700 | 0.324 / 1.076 / 21.280 | 104 | 47 / 48 |
| Site11 | −10.823 to 2.995 | −7.283 to 4.228 | 2.835 / 6.944 / 12.884 | 340 | 60 / 6 |
| Site23 | −10.253 to 5.206 | −9.754 to 6.737 | 2.246 / 6.774 / 10.772 | 319 | 2 / 0 |

All four sites were then profiled to a 25 km radius at both resolutions. Every cell inside each 25 km profile circle was valid. The extension results are:

| Site | 80 m profile range (°) | 20 m profile range (°) | Mean / 95th percentile / max absolute difference (°) | Bins differing >0.1° (of 360) | Max in outer 10% of 25 km window (80 m / 20 m) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Site01 | −7.264 to 1.796 | −5.639 to 3.320 | 2.208 / 6.609 / 8.553 | 329 | 50 / 13 |
| Site04 | 0.142 to 31.841 | 0.132 to 31.700 | 0.324 / 1.076 / 21.280 | 104 | 0 / 0 |
| Site11 | −9.653 to 3.349 | −7.302 to 4.227 | 2.636 / 7.065 / 10.946 | 337 | 88 / 5 |
| Site23 | −10.399 to 5.206 | −8.365 to 8.064 | 2.331 / 6.524 / 13.930 | 317 | 2 / 0 |

At Site04 both resolutions still peak near 19.4 km, so no maximum falls in the outer 10% of the 25 km window. Site01 and Site11 remain window-limited at 80 m, with profile maxima in the outer 2.5 km for 50 and 88 azimuths; their 20 m profiles have fewer such bins (13 and 5). Site23's maxima are mostly inside the window, but the 80S data boundary remains about 182.5 km from its center. The 25 km window confirms local coverage only and does not validate terrain or the raster edge along the remaining far-field rays.

The 80 m profiles at Site01, Site11, and Site23 were further extended to 50 km. All cells inside the profile circles were valid, but each profile still has maxima in the outer 5 km:

| Site | 80 m horizon range (°) | Peak distance min / median / max (km) | Maxima in outer 10% (of 360 bins) |
| --- | ---: | ---: | ---: |
| Site01 | −5.167 to 1.796 | 0.039 / 22.171 / 49.998 | 93 |
| Site11 | −4.872 to 3.349 | 0.001 / 33.685 / 50.000 | 94 |
| Site23 | −10.227 to 5.206 | 0.028 / 0.971 / 49.999 | 35 |

This 50 km extension used only the 80 m LDEM; the 20 m comparison remains bounded to 25 km. The 80 m profiles are still window-limited and do not establish the far-field horizon or whether Site23's 80S edge truncates it.

#### Relief-to-horizon scenario check

For a spherical Moon and an idealized isolated obstacle, `d ≈ sqrt(2 R h)` with `R = 1,737.4 km` gives these candidate distances. They are planning scenarios, not claims about observed terrain or selected team requirements.

| Relative obstacle height (km) | Approximate horizon distance (km) |
| ---: | ---: |
| 0.5 | 41.7 |
| 1 | 58.9 |
| 2 | 83.4 |
| 5 | 131.8 |
| 10 | 186.4 |
| 20 | 263.6 |

The estimated outward 80S margin is about 182.5 km at Site23, versus 264–297 km at the other reference centers. A 5 km-relief horizon is about 50.7 km inside the Site23 margin. A 10 km-relief horizon is about 3.9 km beyond it; a 20 km-relief horizon approaches the margin at Site11 and exceeds it at Site23. This geometric comparison flags where coverage could matter but does not demonstrate an actual obstructing ridge or horizon ray.

#### 80 m profiles at the 5 km-relief distance

As an explicitly provisional sensitivity case, the 80 m profiles were extended to 131.8 km at all four reference centers. Every cell inside each circle was valid. The profiles were computed in one-degree azimuth bins with the same lunar-curvature correction as the shorter profiles.

| Site | 80 m horizon range (°) | Peak distance min / median / max (km) | Maxima in outer 10% (of 360 bins) |
| --- | ---: | ---: | ---: |
| Site01 | −3.806 to 1.796 | 0.039 / 36.991 / 131.799 | 32 |
| Site04 | 0.131 to 32.103 | 0.080 / 4.849 / 19.384 | 0 |
| Site11 | −4.211 to 3.349 | 0.001 / 55.305 / 131.797 | 52 |
| Site23 | −4.746 to 5.206 | 0.028 / 2.371 / 131.796 | 56 |

The circle windows were valid through 131.8 km, so these reads did not reach the 80S edge. Site04's profile maximum stayed at 19.384 km. Site01, Site11, and Site23 still have maxima in the outer ~13.2 km for 32, 52, and 56 azimuths, respectively. Their profiles therefore remain radius-limited even under the provisional 5 km-relief case; this does not prove that real terrain has those distant obstructions. A broader attempt timed out during the Site04 read; targeted chunked reads completed for Site04, Site11 and Site23. Successful HTTP 206 ranges across the broad attempt and retries transferred 165,216,982 bytes for this 131.8 km step, including repeated ranges. Across all profile experiments the transferred total is about 414,404,475 bytes. No raster was retained.

#### Illustrative angular-threshold sensitivity

The 25 km comparison's 95th-percentile absolute differences are Site01 6.609°, Site04 1.076°, Site11 7.065° and Site23 6.524°. To make the pending tolerance choice concrete, the table shows which profiles would meet hypothetical 95th-percentile screening thresholds. These are examples only; a 20 m DEM is not ground truth, and a percentile threshold does not constrain the worst-case tail.

| Hypothetical 95th-percentile threshold | Profiles at or below threshold |
| ---: | --- |
| 1° | None |
| 2° | Site04 |
| 5° | Site04 |
| 7° | Site01, Site04, Site23 |
| 8° | All four |

**Interpretation:** 80 m and 20 m produce materially different near/mid-field profiles, especially at Site01, Site11, and Site23. The common comparison is bounded to 25 km; 80 m-only profiles to 131.8 km remain window-limited at three centers. These results do not justify calling 80 m sufficient or selecting 20 m for the full region. No observer point, acceptable angular tolerance, relief scenario, or horizon radius has been accepted. Across the profile experiments the range transfers include repeated/overlapping reads and an interrupted attempt; no full raster was retained.

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

### Horizons feasibility query run

A small observer-ephemeris query was run against the JPL API for both targets using the Site04 reference center and an assumed observer height of 1 m. The UTC interval was 2026-11-14 00:00–02:00 at one-hour steps, with airless apparent azimuth/elevation requested. Both targets returned three rows. This confirms the candidate API shape works; it is not a chosen mission interval or a scientific validation case.

| Setting | Value used |
| --- | --- |
| Target | Sun `10`, then Earth `399` |
| Center | user coordinates on Moon `301`, `coord@301` |
| Geodetic site coordinates | Site04 reference center: east longitude equivalent `188.13°`, latitude `−89.7668°`, height `0.001 km`; submitted longitude `−171.87°` was normalized by Horizons |
| Time | 2026-11-14 00:00–02:00 `UT`; `STEP_SIZE=1h`; output labeled UTC |
| Output | Observer table quantity `4` (airless apparent azimuth/elevation) |
| Returned lunar center frame/source | `MEAN_ME (high precision)`, DE441 |
| Terrain source frame/source | PGDA 78/90 identify `MOON_ME`, DE421 |

**Frame review:** the earlier note treated the Horizons header's DE441 provenance as a possible mismatch with PGDA's `MOON_ME` / DE421 label. JPL's Horizons manual distinguishes the major-body ephemeris (DE441) from the high-precision lunar surface orientation: within 1550–2650, Horizons uses the lunar mean-Earth frame of DE421 (`MOON_ME`). PGDA 78 and 90 also label their raster frame `MOON_ME` / DE421. This resolves the apparent DE441-versus-DE421 naming conflict for the 2026 sample interval; do not apply a frame transform solely because Horizons uses DE441 for body trajectories. Preserve the returned Horizons header and confirm the lunar `Target pole/equ` model for each saved query, especially for intervals outside 1550–2650 where Horizons switches to its lower-precision IAU lunar model.

Keep metadata tables and file-level manifests separate from raster pixels. Do not populate illustrative coordinates, mission assumptions, or missing science fields with demo values.

## Recommended next sequence

1. Compare Site01, Site04, Site11 and Site23 against the team use case. Reference-center coverage is verified at all three tested terrain scales. Resolve Site23's missing ROI and repeat coverage checks for any team-selected analysis points and ROI polygons.
2. The 80 m/20 m comparison reaches 25 km and the provisional 5 km-relief 80 m profiles reach 131.8 km; Site01, Site11 and Site23 remain radius-limited. Agree an angular tolerance, observer points and relief/horizon distance before any larger regional read. Then extend profiles within the accepted coverage scenario and determine whether the 80S edge limits Site23. Consider a 60S layer only if a relevant ray reaches the 80S valid-data edge.
3. Keep the Horizons response header with each ephemeris sample and confirm its lunar `Target pole/equ` model. The official manual resolves the apparent DE441 trajectory / DE421 lunar-frame discrepancy for current dates; revisit only if the model, interval, or observer definition changes.
4. Submit the proposed sites, selected layers, exact footprint, total bytes and open validation questions for team decision.
5. Only after that decision and a separate explicit acquisition/processing request, create the asset manifest and begin raster data handling.

## Sources checked

- [NASA PGDA product 78 — High-Resolution LOLA Topography for Lunar South Pole Sites](https://pgda.gsfc.nasa.gov/products/78)
- [NASA PGDA product 90 — A New View of the Lunar South Pole from LOLA](https://pgda.gsfc.nasa.gov/products/90)
- [NASA Lunar Surface Data Book Baseline (2025)](https://ntrs.nasa.gov/api/citations/20250002845/downloads/M2M-30044%20Lunar%20Surface%20Data%20Book%20Baseline_Final.pdf)
- [JPL Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
- [JPL Horizons manual — Lunar Mean-Earth Frame of DE421](https://ssd.jpl.nasa.gov/horizons/manual.html)
- [NAIF Lunar Frames Kernel tutorial](https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/Tutorials/pdf/individual_docs/23_lunar-earth_pck-fk.pdf)
- [Park et al. (2021), The JPL Planetary and Lunar Ephemerides DE440 and DE441](https://ssd.jpl.nasa.gov/doc/Park.2021.AJ.DE440.pdf)
- [NASA Space Apps Lunar Landing Site Navigator resources](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources)
- Team-provided [Resource.docx planning document](https://docs.google.com/document/d/1aNnEIbrAzsKJm3FffKX9eGWTH9oUM-_W7JUQlNdLkc8/edit?tab=t.unv6tu6eviha) (reviewed 13 November 2026; estimates remain proposals)
- [NASA CLPS deliveries](https://www.nasa.gov/commercial-lunar-payload-services/clps-landing-sites/)
- [USGS/IAU Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/)
