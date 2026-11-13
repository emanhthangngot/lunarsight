# Development roadmap

LunarSight connects a lunar location, a mission configuration, and the evidence behind a preliminary site comparison. Preserve the prototype's discovery, terrain, horizon, timeline, comparison, sensitivity, dossier, reporting, and bilingual goals while building one consistent calculation path.

**Baseline as of 13 November 2026:** a six-site data pack and source-reproduction scripts have been prepared. Core sources for a wider collection have been identified. Full-hemisphere acquisition, arbitrary-coordinate processing, and a fully integrated application remain future work. See [data sources and scope](data-sources.md).

## Stage 1 — Inventory and reproducible acquisition

Build a file-level manifest for the selected 0–90°S baseline, 60–90°S regional, and 80–90°S detailed products. Start with terrain and quality layers, then thermal products and selected imagery. Keep large rasters, raw tables, kernels, and generated outputs outside ordinary Git history.

**Acceptance criteria**

- Every selected file has a stable product identifier, source URL, archive/version, spatial footprint, variable definitions, units, format, expected size when available, and acquisition status.
- Downloaded bytes are checked against an archive checksum when provided; otherwise a local SHA-256 records integrity and is labeled as locally computed.
- Downloads can resume or retry without accepting an incomplete file as complete. Existing verified files can be reused.
- A summary distinguishes discovered, downloaded, validated, failed, and intentionally deferred files. Planned source size is never reported as downloaded size.
- A small real region exercises the entire path before the complete selected collection is processed.

## Stage 2 — Harmonization and indexed storage

Create consistent metadata and spatial indexing while retaining the source data and its native information content. Process data by windows or tiles so full rasters need not fit into RAM.

**Acceptance criteria**

- Longitude conventions, lunar reference frames, projection, height datum, scale/offset, and nodata interpretation are explicit and checked.
- Categorical masks use an appropriate resampling method; continuous fields have documented interpolation. Effective resolution and uncertainty survive conversion.
- Thermal variables with different physical meanings remain separate. Regridding does not claim improved observation resolution.
- Tiles or indexed tables can answer a location query with values, units, native resolution, coverage, and provenance.
- A few independent samples agree with source values within documented conversion tolerances, including near a boundary and a missing-data region.

## Stage 3 — Coverage, catalog, and scientific quality

Make data availability visible before ranking locations. Correct the catalog's naming problems and keep mission thresholds separate from observations.

**Acceptance criteria**

- Each layer has a coverage/validity representation and exposes missing or uncertain values with reasons.
- Site C's Faustini label is resolved by an explicit catalog change; coordinates are never silently moved to match a name. Other rim, ridge, massif, and mission-association labels are reviewed.
- Demo elevation, illumination, thermal, and resource values cannot become fallback scientific data.
- `water_ice_wt_pct` and annual surface minimum temperature remain unavailable unless a suitable, traceable source or model is added.
- Lunar Prospector data is labeled correctly. A LEND label is enabled only after a selected LEND product is ingested and its variable meaning is documented.
- Terrain screening reports its sampling scale and uncertainty. Passing a slope threshold is not presented as proof of lander-scale safety.

## Stage 4 — Geometry and scenarios at arbitrary coordinates

Generalize the existing six-site calculations. Compute terrain horizons for a selected coordinate and mast height, combine them with versioned ephemerides, and cache results by all relevant inputs. Extend time coverage deliberately when a request falls outside the existing December 2025–February 2030 cache.

**Acceptance criteria**

- A calculation identity includes coordinates, elevation source, mast height, start/end UTC, cadence, terrain/version, kernels/frames, visibility convention, and mission thresholds.
- All scenario intervals use `[start, end)` and explicit calendar-month handling. Unsupported coordinates, dates, and missing terrain produce useful statuses.
- Sun/Earth geometry is checked against documented reference cases; horizon and occlusion accuracy are evaluated separately. A geometry benchmark does not validate terrain shadowing.
- Horizon radius and azimuth sampling are documented and checked for convergence on representative candidates before tighter precision is claimed.
- Sun visibility, Earth visibility, their intersection, darkness runs, and blackout runs come from the same time-indexed result.
- Cases starting in shadow, having no transition, crossing a time boundary, or lying at 0°/360° longitude behave consistently. Near-pole coordinate handling is explicit.
- Transition precision follows the calculation cadence. Any finer event refinement is implemented and verified before finer times are displayed.
- Full-disk occlusion, eclipses, power, batteries, ground stations, and radio link budgets are separate extensions. Results state which models are included.

## Stage 5 — Application integration and reproducible reports

Connect the map, local horizon, timeline, profile assessment, scenario comparison, sensitivity controls, and report to the same scenario/result objects. Retain English and Vietnamese support.

**Acceptance criteria**

- Users can select a prepared site or a covered custom coordinate, inspect source availability, run a scenario, and compare results.
- Changing coordinates, observer height, dates, or thresholds recomputes or retrieves the matching result; a stale six-site cache is never reused for another location.
- Catalog long-term fractions are labeled separately from mission-window availability. Map display thresholds and mission thresholds are distinguishable.
- Scores are explained as constraint checks or explicit ranking criteria, not mission-success probabilities. Missing data does not silently improve a score.
- JSON export and printed reports preserve inputs, outputs, units, provenance, model limitations, and validation status.
- Loading, missing data, request failure, and long-running processing have usable states. Bilingual labels, keyboard access, contrast, and non-color status cues receive focused checks.
- The AI advisor explains the identified deterministic results, cites the evidence it receives, and handles service failure without blocking numerical analysis. Engineering advice requires its relevant inputs.

## Stage 6 — Wider comparison and targeted extensions

After the preceding stages are demonstrated, expand regional screening and candidate ranking. Benchmark tile processing, record storage/runtime costs, and choose where higher resolution materially improves a decision.

Potential extensions include uncertainty-aware ranking, more detailed thermal models, modeled resource evidence, rover routing, energy budgets, and ground-station communication. Each needs a defined input set and acceptance criteria before it becomes a promised capability. Persistent projects and collaboration can be added when needed by the team.

## Release evidence

A release should include its acquisition summary, coverage report, data/model versions, representative validation results, reproducible scenarios, and known limitations. The acceptance criteria above are planned gates; they are not claims that the full application currently passes them.
