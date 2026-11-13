# LunarSight

### Lunar Landing Site Explorer & Mission Planner

LunarSight helps a team explore lunar terrain, inspect environmental evidence, and compare preliminary landing-site scenarios. It connects a location and mission profile to terrain, illumination, Earth visibility, thermal observations, and traceable source metadata.

**Current stage: data foundation and research prototype.** A real six-site data pack has been prepared separately. This repository starts the project with its reference processing scripts, small catalog examples, scientific interpretation rules, and a roadmap for southern-hemisphere coverage. The integrated web application and full-hemisphere data pipeline are planned work.

[Tiếng Việt](README.vi.md) · [Data sources](docs/data-sources.md) · [Roadmap](docs/roadmap.md) · [Data contract](docs/integration-contract.md)

## Project direction

| Area | Intended capability |
| --- | --- |
| Explore | Browse lunar maps and inspect a prepared site or supported custom coordinate. |
| Assess | Inspect terrain slope, horizon obstruction, shadow, thermal evidence, and data quality. |
| Simulate | Combine a location, mast height, mission dates, and profile with versioned geometry calculations. |
| Compare | Explain sunlight, Earth line of sight, darkness/blackout intervals, and explicit profile constraints. |
| Report | Export inputs, results, sources, uncertainties, and missing-data reasons together. |

The application scope preserves the team's LunarSight proposal. The implementation will use the same scenario result across the map, horizon view, timeline, comparisons, sensitivity tools, and reports.

## Geographic plan

- **0–90°S:** southern-hemisphere terrain, imagery, and broad thermal context.
- **60–90°S:** regional screening and quality-aware polar terrain products.
- **80–90°S:** more detailed polar terrain and seasonal thermal analysis.

Coverage, measurement resolution, and uncertainty remain specific to each layer. The selected expanded source collection is estimated at **about 56.2 GB before imagery and processing outputs**. This is a source-acquisition plan, not an already downloaded collection. Details and primary archive links are in [data-sources.md](docs/data-sources.md).

## Existing data baseline

The separately prepared **LunarSight Data Pack v1** contains:

| Item | Prepared amount |
| --- | ---: |
| Proposal coordinates | 6 |
| Mission-profile presets | 5 |
| Raster files, including imagery/context | 41 |
| Site-time ephemeris rows | 219,318 |
| Terrain-horizon rows | 12,960 |
| Preset scenarios | 150 |
| Seasonal samples | 72, of which 38 have valid values |

The v1 ZIP is 153,677,354 bytes and contains 355 files. Large rasters, complete time-series caches, and the ZIP are distributed separately from Git. See [the release descriptor](manifests/six-site-release.json) and [the original readiness report](docs/data-pack-v1-readiness.md). Paths in that report refer to the extracted data pack.

This repository includes small catalog and summary examples plus the scripts used to prepare the release. These examples do not imply that the corresponding large assets are present in a fresh clone.

## Repository map

| Path | Contents |
| --- | --- |
| `docs/data-sources.md` | Source register, coverage, definitions, and expanded acquisition budget. |
| `docs/roadmap.md` | Implementation stages with acceptance criteria. |
| `docs/integration-contract.md` | Lunar coordinates, units, missing-data rules, and result semantics. |
| `docs/methods/` | Terrain, ephemeris, and environment methods from the six-site release. |
| `examples/six-sites/` | Small input catalogs, name audit, and measured/derived site summary. |
| `manifests/six-site-release.json` | Descriptor and checksum of the separately prepared v1 archive. |
| `pipelines/site_pack_v1/` | Reference Python scripts and dependencies for the existing six-site workflow. |
| `AGENTS.md` | Project context and rules for future coding agents and contributors. |

## Start locally

```bash
git clone https://github.com/emanhthangngot/lunarsight.git
cd lunarsight
python3 pipelines/site_pack_v1/scripts/prepare_catalog.py --inputs-only
```

The last command uses Python's standard library and creates the six-site input catalogs under `pipelines/site_pack_v1/data/catalog/`. It does not download the expanded collection. Generated data is ignored by Git.

For scientific processing, use Python 3.12 and a virtual environment:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r pipelines/site_pack_v1/requirements.txt
```

Read [the reference pipeline guide](pipelines/site_pack_v1/README.md) before running downloads or calculations. Its full clean-room rebuild is a separate validation task; the launch check exercises catalog generation and checks source syntax and metadata consistency.

## Scientific interpretation

- Keep measured observations, published models, project-derived results, and application presets identifiable.
- Retain `null` with a reason for unsupported quantities. The current baseline has no supported local `water_ice_wt_pct` or `thermal_annual_surface_min_K` value.
- Lunar Prospector hydrogen is not a LEND measurement or a local water-ice percentage. Permanent shadow alone does not establish water ice.
- Long-term illumination maps differ from results for a selected mission window. Earth visibility does not establish radio-link performance; sunlight does not establish a power budget.
- Pixel spacing does not establish measurement accuracy or lander-scale hazard safety.
- Preserve the coordinate audit: site C's proposal label, “Faustini,” does not match its coordinates. Coordinates were retained rather than silently moved.

LunarSight supports preliminary research, education, and screening. The project's calculations are not NASA/JPL-certified mission decisions.

## Next development milestone

Build a file-level acquisition manifest, fetch a bounded real region, normalize its metadata, and expose values together with coverage and provenance. Expand the same tested path to the selected geographic tiers before adding arbitrary-coordinate scenario analysis. See [the roadmap](docs/roadmap.md) for completion criteria.

## Attribution

Primary sources include NASA LRO LOLA, Diviner and LROC; NASA JPL NAIF and Horizons; NASA PDS Geosciences; Lunar Prospector; and USGS/IAU planetary nomenclature. Source URLs and interpretation notes are retained in the documentation. Third-party data keeps its source-specific terms and acknowledgements. A redistribution license for the team's original code has not yet been selected.
