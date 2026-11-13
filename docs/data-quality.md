# Data quality specification and acceptance plan

Status: **proposal for team review; no data products or numerical methods have been accepted for this repository**.

This document defines evidence to request if data acquisition or analysis is later approved and explicitly requested. It contains no processing scripts, executable tests, implementation choice, or claim of completed validation. Candidate references are listed in [data-sources.md](data-sources.md).

## 1. Preserve evidence categories

A future result should distinguish these categories clearly:

| Category | Required interpretation |
| --- | --- |
| Observation or archive product | Identify the instrument, exact product/version, measured or published variable, native resolution, and time coverage. |
| Published model product | Identify the model and its observational basis; retain assumptions and variable definitions. |
| Project-derived result | Identify the source inputs, method, parameters, and limitations. Do not present it as a direct measurement. |
| User or proposal assumption | Identify the chosen value, unit, and reason. A mission profile is not an official mission requirement unless supported by its source. |
| Unavailable or out of coverage | Preserve a missing value and a specific reason; distinguish this from a physical zero. |

A future display or export should make these distinctions understandable without requiring the user to inspect implementation details.

## 2. Minimum provenance record

For any selected dataset, the proposed record should include source URL, product identifier/version, instrument or model, footprint, native grid or sampling, coordinate frame, projection, height datum, units, scaling, missing-value rules, time definition, uncertainty, attribution, and processing history where relevant.

A local checksum can establish the identity of retained bytes; it does not establish scientific correctness. An archive checksum, when available, should be distinguished from a locally calculated value. Discovery, selection, acquisition, preparation, and validation should have separate statuses.

## 3. Proposed acceptance criteria

| Area | Evidence required before acceptance | Misinterpretation to prevent |
| --- | --- | --- |
| Coordinates and names | Document latitude/longitude conventions, lunar frames, projection, and elevation datum. Check representative locations and naming references. | Relabeling lunar data with terrestrial EPSG:4326/3857; silently moving a coordinate to match a place name. |
| Coverage | Describe the product footprint separately from cells with valid observations; show missing/uncertain areas. | Treating an available file or a rectangular footprint as valid data everywhere. |
| Terrain | Preserve effective resolution, interpolation and uncertainty information; state the spatial scale of slope and roughness. | Treating grid spacing as accuracy, or a coarse slope threshold as proof of lander-scale safety. |
| Resampling | Document the reason and method; retain native resolution and variable meaning. | Claiming finer measurements by putting coarse thermal or hydrogen values onto a finer grid. |
| Thermal variables | Identify brightness/surface/subsurface temperature, statistic, depth where applicable, units, and time period. | Combining annual mean at depth with annual surface maximum as a surface min–max pair; treating climatology as a UTC forecast. |
| Shadow and resources | Keep permanent shadow, hydrogen, modeled ice-stability depth, and measured ice abundance separate. | Reporting water-ice mass percentage from PSR membership or hydrogen alone. |
| Instrument identity | Associate each layer with its actual instrument and product. | Labeling Lunar Prospector data as LEND or substituting one without a documented decision. |
| Ephemeris geometry | State kernel versions, frames, aberration conventions, observer position and height; specify suitable reference comparisons. | Treating a geometry comparison as validation of terrain occlusion or the whole application. |
| Visibility and time | State mission interval, cadence, center/limb/full-disk convention, horizon method, and limitations. | Showing transition precision finer than supported sampling or using long-term fractions as mission-window results. |
| Operational interpretation | Identify which models are included and the engineering inputs they require. | Equating Earth line of sight with a working radio link, illumination with power sufficiency, or a score with mission-success probability. |

These are proposed review criteria. Actual sampling plans, tolerances, benchmarks, and evaluation methods must be justified after the team chooses the products and intended claims.

## 4. Missing-data policy

Unsupported quantities should remain unavailable with a reason such as out of coverage, missing observation, unsuitable variable, or model not included. They should not be filled with zero, an unrelated site's value, or a prototype's demonstration value.

In particular, `water_ice_wt_pct` and `thermal_annual_surface_min_K` require sources or explicitly labeled models supporting those exact quantities. Neither field is promised at this stage. Any ranking or summary should state how missing evidence affects the result; absence of evidence must not silently improve a score.

## 5. Catalog questions retained for team review

The earlier proposal's C/Faustini label and A/Shackleton rim label require review against the intended coordinates and [USGS/IAU nomenclature](https://planetarynames.wr.usgs.gov/). The team should decide whether a label, coordinate, or both need revision and record the reason. Earlier examples do not define an approved site catalog.

Coordinates, mission associations, and names should be reviewed independently. A named feature, a historical landing location, and a proposed future mission target are different kinds of claims.

## 6. Future acceptance record

If evaluation is later requested, its report should state the agreed question, selected source/version, method, comparison evidence, residual or discrepancy definition, justified tolerance, coverage exceptions, and remaining limitations. A pass/fail statement should follow that evidence rather than a badge or source name.

LunarSight's proposed role is preliminary exploration and screening. Source attribution or successful numerical comparisons would not constitute NASA/JPL endorsement, mission certification, or assurance of landing safety.
