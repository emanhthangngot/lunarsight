# Ephemeris and celestial geometry

This folder contains calculated Sun/Earth geometry from NASA/JPL NAIF SPICE data. The supplied site coordinates reproduce the proposal and are identifiers for investigation, not independently verified geological feature locations. Demo elevations and illumination percentages in the proposal are not input data.

## Contents

- `data/ephemeris/{A,B,C,D,E,SHIV}_hourly.parquet`: primary per-site time series, Zstandard compression, float64 angles and distances, timezone-aware UTC timestamps.
- Matching `*_hourly.csv.gz`: portable full exports. Decompress before CSV parsing.
- `*_frontend_week.csv`: directly loadable 168-row sample for 1–7 January 2026, hourly.
- `*_sample.json`: 28 six-hour samples of the same example week, for inspecting schema/UI wiring. Sample files are real calculated data, not complete mission windows.
- `lunar_context_hourly.parquet` and `.csv.gz`: Moon-center geometric Sun/Earth direction latitudes/longitudes for context labels. These use `NONE`, and must not be substituted for topocentric apparent az/el.
- `kernels/`: the five original NAIF kernels, retained for offline reproducibility.
- `metadata/ephemeris/kernel_manifest.json`: original source URLs, byte sizes, SHA-256 hashes.
- `metadata/ephemeris/horizons_raw/`: original unedited NASA/JPL Horizons reference outputs and request metadata, cached for reuse.
- `metadata/ephemeris/horizons_validation.csv`, `validation_summary.json`: reference/computed values, signed residuals, tolerances and results.
- `metadata/ephemeris/ephemeris_manifest.json`: exact coverage, counts, height assumptions, schema and software versions. This manifest is authoritative for the files generated in this delivery.

## Time and mission windows

Requested coverage is 2025-12-01 00:00 UTC through 2030-02-01 00:00 UTC inclusive, sampled every UTC hour. This encompasses all five proposal landing presets, date shifts of ±30 days, and durations up to 36 calendar months. Integrate scenarios over half-open `[start,end)` intervals; the final sample is an interpolation boundary, not an additional one-hour mission interval. Use calendar-month addition to define mission end, not a fixed 30-day multiplier. UTC samples are converted separately to SPICE ET/TDB using the supplied leap-second kernel. Future leap seconds remain unknown.

Hourly samples support preliminary screening. Transition timestamps and longest darkness/blackout runs have cadence uncertainty; rerun near crossings at finer cadence before reporting precise event times. Do not use linear interpolation through an azimuth wrap without circular handling.

## Coordinates, observer height and apparent geometry

Longitudes are east-positive, latitudes north-positive, in the lunar Mean Earth/Polar Axis system. The retained DE440 frame kernel defines `MOON_ME` as `MOON_ME_DE440_ME421`, a DE440-based realization closely aligned with DE421 ME. The reference sphere has radius 1737.4 km, matching the radii in the supplied PCK. It is not Earth WGS84, a geoid, or an arbitrary DEM vertical datum.

Every row carries `observer_ground_height_m` and `observer_mast_height_m`. This delivery uses regional native DEM ground heights recorded in `metadata/ephemeris/observer_ground_heights.json`, with zero additional mast. A/B/C/D/E use the 80 m regional terrain model; SHIV uses 240 m. Site C uses 866.3905639648438 m for consistency with the 80 m terrain horizon, while its finer 5 m local catalog height, 865.1942749023438 m, is retained separately in the terrain dossier. Read the manifest for the exact height source used. An explicit zero ground height means a point on the reference sphere, not a claim that the real terrain is at zero elevation. Input height is radius offset above that sphere, converted from metres to kilometres. Mast height is radial above ground. A mission mast change must be reflected both in the geometry and the local terrain horizon, using the same observer position and datum. The script accepts `--heights-json` with all six site IDs mapped to numerical heights in metres above this sphere and `--mast-height-m` for a shared additional height.

`azlcpo(ELLIPSOID, target, ET, CN+S, azccw=False, elplsz=True, obspos, MOON, MOON_ME)` produces apparent target-center directions with converged reception light time and stellar aberration. There is no atmospheric refraction or gravitational light bending in this SPICE calculation. Azimuth is clockwise from local north: north 0°, east 90°, south 180°, west 270°. Elevation is positive above the plane normal to the local reference-surface zenith. It is not elevation relative to a sloping DEM cell normal.

The Sun and Earth distance columns are observer-to-apparent-target-center ranges in km. Solar angular radius is `asin(695700 km / sun_range_km)`. Earth angular radius is `asin(6378.137 km / earth_range_km)`: an equatorial spherical bound, not a resolved apparent oblate-Earth limb. Units of all azimuth/elevation/angular-radius columns are decimal degrees. There are no terrain visibility flags in these tables.

## Validation

Twelve cached Horizons az/el requests cover six sites, two targets and three UTC epochs: 2026-01-01, 2026-07-01, and 2027-01-01 at midnight. Each uses the same latitude/longitude, explicit datum height zero, `CENTER=coord@301`, `QUANTITIES=4,13,20`, airless apparent coordinates, range in km. Raw outputs include Horizons' source/frame and correction descriptions. The cross-check deliberately compares a zero-height SPICE observer to a zero-height Horizons observer, even if the production series uses sampled ground height. It validates the geometry engine independently of DEM sampling.

Azimuth residuals are wrapped into [-180°,180°). Pass thresholds are 0.0001° azimuth, 0.0001° elevation, 0.1 km range and 0.01 arcsecond angular diameter. These are cross-model screening tolerances, not claimed physical error bounds; inspect actual residuals in the CSV and summary. Horizons uses its reported DE ephemeris and additional apparent-coordinate corrections, so exact identity is not expected. Angular diameter comparison checks the explicitly documented equatorial spherical convention; it is not a test of a resolved apparent Earth limb. All-pass status is calculated from the actual residuals and thresholds, and script execution fails when a required check exceeds its threshold.

A thirteenth cached Horizons request retains quantities 14/15 for Moon target 301 observed from Earth center (`CENTER=500@399`) at the same epochs. `subpoint_benchmarks.csv` compares subsolar latitude/longitude and sub-Earth latitude/longitude using `subslr(Intercept: ellipsoid, CN+S)` and `subpnt(Intercept: ellipsoid, CN)`, respectively; longitude residuals wrap at 360°. The stated numerical fixture gate is 0.0001°. These subpoints include observer-time light travel conventions and are a separate product from the hourly geometric `NONE` context. Their successful comparison does not validate the differently defined `NONE` columns. `subpoint_validation_summary.json` records the actual residual maximum.

A check at three epochs is not evidence of uniformly bounded error at all dates, a test of terrain shadows, or mission certification.

## Reproduction

Install `numpy pandas pyarrow spiceypy` in a suitable Python environment, then run:

```bash
python scripts/prepare_ephemeris.py
```

The default height input is the delivered `metadata/ephemeris/observer_ground_heights.json`; pass another valid height file explicitly to change it. Existing kernels and raw Horizons responses are reused. Missing kernels can be fetched from the exact official NAIF URLs. The calculation itself runs offline after kernels and fixtures have been collected. Use `--skip-validation` to regenerate offline without requesting missing fixtures; cached validation output should still be reviewed. For an application, supply a truthful application-specific `--user-agent` including product, version and contact details.

Horizons API fair use requires one request at a time, cache/reuse where practical, error/backoff handling and an application-specific User-Agent. NASA's stated CORS policy prohibits embedding these APIs in a website. Backend preprocessing and caching is an implementation choice suitable for these restrictions; the API must not be called separately by every UI animation frame.

## Scope limits

A positive Sun-center elevation does not establish unobstructed sunlight. Ray/DEM or terrain-horizon comparison is required, with an explicit disk-center or disk-limb rule. Earth-center elevation does not establish visibility to a specific terrestrial station or an operational radio link. No power balance, antenna pointing, radio link budget, relay schedule, thermal model or terrain occlusion is calculated here. Latitude/longitude sensitivity outside these six sites requires recomputation; the six stored series must not be treated as a spatial interpolation grid.

## Primary sources

- API endpoint: https://ssd.jpl.nasa.gov/api/horizons.api
- Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
- Horizons definitions and coordinate conventions: https://ssd.jpl.nasa.gov/horizons/manual.html
- API fair use: https://ssd-api.jpl.nasa.gov/doc/
- SPICE az/el method: https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/azlcpo_c.html
- Lunar FK and its frame explanation: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf
- Kernel provenance: see exact original URLs and SHA-256 hashes in `metadata/ephemeris/kernel_manifest.json`.

## Mast-height translation for cached timeline integration

The primary time series is at measured regional ground plus a zero-metre mast. The script's public `translate_radial_height(azimuth_deg, elevation_deg, range_km, delta_height_m)` helper translates a cached ray to the same latitude/longitude at a different radial height. It keeps azimuth, subtracts `delta_height_m/1000` from the local vertical target-vector component, and recomputes elevation/range. Recompute angular radii from the new ranges. This is exact for a frozen target state and local frame; it approximates the tiny change in apparent light-time and aberration caused by a height change. For authoritative full recomputation use `geometry_for_site` at the desired mast height.

An actual comparison against full SPICE was performed for all six sites, both targets, all three reference epochs and masts 1, 1.2, 2, 2.2, 2.5, 3.5, 10 and 15 m: 288 comparisons. The retained `radial_height_translation_validation.csv` and `.json` record residuals and numerical gates. Observed maxima were approximately 4.56e-10° azimuth, 2.32e-10° elevation and 3.57e-6 km range. This comparison supports the cached-ray approximation for preliminary screening within the tested height range, and does not replace terrain-horizon recomputation or certify error outside the tested cases. Applying a mast horizon to zero-height rays without the height translation would mix observer assumptions; callers should translate the rays or recompute SPICE geometry first.
