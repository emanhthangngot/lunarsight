# Terrain and long-term polar visibility

This package contains real downloaded NASA/LOLA terrain and modeled polar environmental rasters, cropped and normalized for the six **exact proposal coordinates**. Coordinates were not moved to match a geographic feature name. A proposal name must not be treated as independently verified by these files.

## What is included

- Six source-aligned, approximately **40 km square DEM tiles**, using the native **80 m** grid at A/B/C/D/E and **240 m** at SHIV. No artificial detail was added.
- Matching terrain-scale slope tiles, calculated from the native DEM by central finite differences with local spherical stereographic scale correction. These describe relief over tens/hundreds of metres; they are **not metre-scale lander hazard assessments**.
- At exact point C, an additional **6 km square, native 5 m** Site04 surface, published slope, and RMS height-error tile. The other five proposal coordinates are outside the published Site01 and Site04 5 m footprints. The source grid is heavily interpolated: 5 m spacing does not mean independent measurements every 5 m.
- A regional, approximately 960 m DEM context raster derived from the 240 m source, for display and regional orientation.
- At A/B/C/D/E, approximately 40 km square **60 m** mean solar visibility, mean Earth visibility, and permanent-shadow mask tiles, plus approximately 240 m polar context rasters. SHIV has explicit null environmental values because it is outside these polar products.
- Numeric site ground heights, long-term layer samples, nearest mapped PSR pixel-centre distances, and six 360-degree terrain-horizon tables.

Raw full regional files are cached outside this compact distribution. Their direct URLs, byte lengths, download timestamps and SHA256 checksums are preserved in `metadata/terrain/sources.json`; the original PDS labels are included alongside the metadata.

## Coordinates, datum, and units

All output rasters use a **lunar sphere of radius 1,737,400 m**, south polar stereographic projection, central longitude 0 degrees, latitude of true scale -90 degrees, and X/Y in metres. Longitude is positive east; latitude is planetocentric. Source frame is **MOON_ME / Mean Earth–Polar Axis of DE421**. An Earth CRS must not be assigned to these rasters. The geometric spherical projection is stored in the GeoTIFF CRS, and the dynamical frame is recorded separately in metadata/tags.

Elevation is height in metres above the reference sphere, not radius from the Moon's centre. Raster affine transforms locate pixel corners; samples and distances use pixel centres. Pixel registration was preserved from the source. `site_ground_heights.json` uses bilinear interpolation of **full-resolution native source pixels** and supplies the nearest-pixel value separately. Neither value should be interpreted as a surveyed landing-point elevation.

| Site ID | Preserved latitude | Preserved east longitude | Best available sampled ground, m | Native source spacing |
|---|---:|---:|---:|---:|
| A | -89.24 | 32.40 | -755.947815 | 80 m |
| B | -88.82 | 12.10 | -367.324646 | 80 m |
| C | -89.62 | 178.30 | 865.194275 | 5 m |
| D | -85.91 | 12.92 | 83.955917 | 80 m |
| E | -85.22 | 36.12 | 6712.295898 | 80 m |
| SHIV | -69.37 | 32.32 | 528.497742 | 240 m |

The sampled source RMS height error at C is **0.359690 m**. Other sites' per-pixel uncertainty is null because their error layers are not included. Grid spacing is not a vertical-accuracy estimate. Proposal elevation and illumination figures were not reused as scientific data.

The original 5 m file footprints, verified by reading their GeoTIFF headers, are:

| Source | X bounds, m | Y bounds, m |
|---|---|---|
| Site01 Connecting ridge | -19000 to -3000 | -20000 to -4000 |
| Site04 Shackleton rim | -9000 to 7000 | -15000 to 1000 |

Exact per-site projected coordinates and inclusion tests are in `metadata/terrain/site_5m_coverage.json`. C falls in Site04; its proposal label “Faustini Crater Floor” does not establish its actual geographic identity.

## Long-term visibility and PSR semantics

Source products are `AVGVISIB_85S_060M_201608`, `AVGVISIB_85S_060M_201608_EARTH`, and `LPSR_85S_060M_201608`, distributed as PDS IMG plus detached labels. The full grids are 5058 by 5058, with 60 m native spacing and upper-left corner (-151740,151740) m. The nominal product band is 85–90 degrees south; square-grid corners extend farther north. Point summaries conservatively require the nominal band as well as valid raster coverage.

These are **approximately 18.6-year means modeled at hourly timesteps**, not time-specific lighting or communications windows. Source-label START_TIME/STOP_TIME describe input observations and must not be substituted for the modeled averaging period. Mean solar visibility describes the fraction of timesteps with **some part of the solar disc** visible; mean Earth visibility similarly uses any Earth-disc visibility. These products do not provide solar electrical power, DSN-station availability, or a radio link budget.

The code applies the labels' raw integer scaling explicitly:

- Solar and Earth: `fraction = raw_DN * 0.00004`. Store as a 0–1 fraction; multiply by 100 only for display as percent.
- PSR: `flag = raw_DN * 0.000025 + 0.5`. Raw +20000 means PSR (1); raw -20000 means non-PSR (0).
- The actual downloaded PSR file also contains **five raw-zero cells**, which would scale to 0.5 despite the label's binary description. They are conservatively treated as **undefined**, rather than silently converted into PSR or non-PSR. The same five cell locations are excluded in the solar/Earth derivatives. GDAL reports raw nodata -32768; the derived numeric GeoTIFFs use -9999 for float rasters and 255 for byte PSR rasters.
- The Earth PDS label contains an inconsistent `MINIMUM_LATITUDE=90` field. The verified southern projection, transform, dimensions and nominal catalog coverage are used, rather than this one inconsistent field.

Full-resolution samples are nearest pixel; the binary mask is never bilinearly interpolated. Context solar/Earth layers are average-resampled for display; context PSR uses nearest-neighbour sampling, which can omit small PSRs. Use full-resolution source-derived tiles and summaries for numeric work.

| Site | Solar mean fraction | Earth mean fraction | At PSR pixel? | Nearest PSR pixel-centre distance |
|---|---:|---:|---|---:|
| A | 0.16608 | 0.32824 | No | 453.27 m |
| B | 0.05472 | 0.25940 | No | 392.40 m |
| C | 0.12568 | 0.41524 | No | 1023.09 m |
| D | 0.21248 | 0.75300 | No | 759.31 m |
| E | 0.14160 | 0.51536 | No | 995.99 m |
| SHIV | null | null | null | null: outside coverage |

PSR distance is great-circle distance on the reference sphere to the **nearest native 60 m pixel centre flagged PSR** in the complete supplied mask. It is not distance to a vector boundary, a safe traverse length, or evidence of water ice. All five supported sites' nearest matches are closer than the conservative raster-edge search margin; edge distances and nearest-cell coordinates are included in `site_long_term_visibility.json`. No polar distance was extrapolated to SHIV.

## Preliminary terrain horizons

`data/terrain/{site_id}_horizon_360deg.csv` contains **2160 rows per site**: one-degree true azimuth samples at each observer height **1.2, 2.0, 2.2, 2.5, 3.5 and 10.0 m above ground**.

Columns are `site_id`, `observer_height_above_ground_m`, `azimuth_deg`, `terrain_horizon_elevation_deg`, `obstruction_distance_m`, `obstruction_lat_deg`, `obstruction_lon_deg_east`, `valid_ray_fraction`, and `horizon_is_finite_radius_lower_bound`.

Azimuth 0 is **true local north**, 90 east, 180 south, 270 west; angles increase clockwise. Rays follow spherical great circles computed with pyproj.Geod. Terrain is sampled bilinearly from native source DEMs: 80 m grid within 20 km where latitude is south of 80 degrees, and 240 m grid elsewhere, through 200 km. Ray sample spacing is 80 m below 20 km and 240 m from approximately 20 to 200 km. The first 80 m of terrain, sub-grid obstacles, and terrain beyond 200 km are not resolved. Sampling a 240 m source more frequently does not create finer terrain information.

For each target sample at angular separation theta, with elevation z above the reference sphere and observer radius `R + ground + mast`, the code computes the target direction from the observer as:

`elevation = atan2((R + z) * cos(theta) - (R + ground + mast), (R + z) * sin(theta))`

and takes the maximum sampled direction along the bearing. This includes lunar curvature and does not apply atmospheric refraction. Negative horizon elevations are valid and must be preserved.

For internal consistency, horizon observer ground is sampled from the **same regional 80/240 m DEM field** as the rays. At C this is **866.390564 m**, differing by 1.196289 m from the separate best-available 5 m dossier height. C scenario ephemerides must use the regional horizon observer-ground value when combined with this horizon. Every table's exact observer ground and processing settings are in its adjacent metadata JSON. The horizon calculation does not claim to use the additional C 5 m terrain.

These are **sampled finite-radius lower bounds** on terrain obstruction. One-degree ray spacing, source interpolation, source-grid resolution, near-observer omissions and the finite search radius can miss obstacles. In particular the tables cannot establish metre-scale mast benefits or certify landing slopes. They support preliminary scenario exploration, with these limits retained in every exported assessment.

## Sources and reproducibility

Primary catalogs:

- NASA PGDA product 90, regional adjusted LOLA terrain: https://pgda.gsfc.nasa.gov/products/90
- NASA PGDA product 78, 5 m south-pole site DEMs and errors: https://pgda.gsfc.nasa.gov/products/78
- NASA PGDA product 69, solar/Earth visibility and PSR interpretation: https://pgda.gsfc.nasa.gov/products/69
- MIT LOLA PDS IMG archive: https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/

Suggested scientific citations are Barker et al. (2023), Planetary Science Journal 4,183, doi:10.3847/PSJ/acf3e1 for regional terrain; Barker et al. (2021), Planetary and Space Science 203,105119, doi:10.1016/j.pss.2020.105119 for site terrain/error; Mazarico et al. (2011), Icarus 211,1066–1081, doi:10.1016/j.icarus.2010.10.030 for the illumination products.

Rebuild from the package root with Python 3.12 and numpy/scipy/rasterio/pyproj installed:

```bash
python scripts/prepare_terrain.py --output . --cache /path/to/raw_cache
```

The script downloads approximately **685 MB** of source files on first use, caches them, validates lunar radius and native metadata, applies scaling/masks, records SHA256 hashes, and reconstructs tiles, site samples and horizon tables. These raw rasters are not required to read the prepared data.

A bounded HTTP-range attempt to read the 2.6 GB 20 m regional COG successfully opened metadata, but the first numeric window failed with GDAL `_TIFFPartialReadStripArray` / `IReadBlock` errors. No 20 m raster is claimed in this package. The working 80/240 m and C 5 m inputs are explicitly identified; the proposal's 20 m declaration was not imitated by upsampling.

Validation results are in `metadata/terrain/validation.json`. All prepared numeric rasters are non-empty and have the lunar reference radius. All 12,960 horizon rows are finite, have complete sampled rays within the 200 km calculation, and show non-increasing terrain-horizon elevation as observer height increases. This is implementation QA, not independent flight-quality validation.
