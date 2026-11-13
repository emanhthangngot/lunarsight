# ADR 0002 — Initial data-mining feature scope

- Status: Accepted
- Date: 13 November 2026
- Authority / decision-maker: Explicit user instruction in this task
- Related requirements and open decisions: FR-002–FR-013, NFR-001–NFR-002; OD-01–OD-05, OD-10

## Context and problem

The challenge objectives, its official resources, the team's feature-planning document, and a shared ChatGPT analysis describe more possible layers and models than are useful for a first data-mining pass. The repository also contains earlier source and product proposals that have not been selected. This decision fixes the features and evidence categories to prioritize. It does not approve downloads, exact footprints, data versions, or the illustrative 56.2 GB collection.

## Options considered

1. Mine every suggested layer and build a broad lunar data collection. This maximizes possible overlays but adds substantial volume and risks presenting weakly supported resource or engineering values.
2. Build only a simple map and ephemeris display. This is smaller but misses terrain obstruction and the proposed scientific contribution around confidence in site screening.
3. Prioritize a bounded south-polar site-screening workflow, then measure how terrain uncertainty changes its illumination and visibility results. Defer large contextual layers and a hardware-level power model.

## Accepted choice

Use option 3 as the initial data-mining and feature scope.

### P0 — Minimum useful site-screening workflow

- A small, source-traceable catalog of candidate south-polar locations plus custom coordinates. Preserve names, coordinates, elevation, coordinate frame, mission/site status, source, and coverage; do not treat an intended target as a confirmed landing site.
- Multi-scale terrain for selected site footprints: a suitable local elevation product plus coarser surrounding terrain, with slope, elevation uncertainty, slope uncertainty, and LOLA observation-count/quality evidence where available. Terrain coverage must extend far enough to calculate the horizon; a small local cutout alone is insufficient.
- Sun and Earth ephemeris over a user-selected mission interval, with UTC/time-scale and lunar-frame provenance, and an explicit observer height.
- Terrain horizon profiles and derived time series for solar elevation/illumination and geometric Earth line of sight. Summaries include illuminated time, longest dark interval, Earth-visible windows, simultaneous visibility, and documented constraint checks.
- Compare a small number of site/date scenarios on the same interval and sampling basis. Export the scenario assumptions, results, source versions, coverage, missing values, and limitations.

### P1 — Primary scientific contribution

- Propagate available DEM alternatives/clones and uncertainty through horizon and illumination calculations. Report the spread or stability of derived screening results, alongside the nominal result, rather than treating one DEM as exact.
- Use slope and terrain evidence at a stated spatial scale. Report uncertainty or unavailable evidence explicitly.

### P2 — Optional context, after P0 and P1

- PSR boundaries as a separate geographic context layer; hydrogen/neutron evidence only with instrument and quantity labels. Do not derive local water-ice abundance from PSR membership or hydrogen alone.
- Diviner thermal products as historical/model context with their variable definitions and time basis; they are not mission-window temperature forecasts.
- Selected LROC imagery for visual context only; do not mirror a full imagery archive.
- Educational and bilingual presentation can reuse the same identified scenario and evidence.

### Deferred

- A battery/power-sufficiency or communications-link model. Solar illumination is not power sufficiency; geometric Earth visibility is not a working radio link. Any later energy model needs explicit, sourced or clearly labeled assumptions for panel, battery, load, and efficiency.
- Offline SPICE processing unless API availability, reproducibility, or offline operation makes it necessary. Horizons is the preferred initial ephemeris access path for investigation, subject to a time/frame/observer contract.
- Broad hemisphere/global acquisition, full 5 m regional mosaics, all DEM clones, full-resolution LROC mosaics, and thermal/resource layers before their use is justified.

## Rationale and evidence

The challenge identifies candidate-site comparison, flexible mission timing, Sun/Earth geometry, terrain-aware horizon interpretation, energy/communications screening, maps, timelines, and mixed technical/educational audiences. Its resource page names Quickmap, Moon Trek, and JPL Horizons as discovery/visualization/ephemeris resources. The team's shared feature analysis identifies LOLA elevation, slope, uncertainty, count maps, DEM alternatives, ephemeris, and a site catalog as useful core evidence, and recommends deferring PSR, thermal, and imagery layers. This ADR adopts the bounded scope, not every proposed source, coordinate, numerical example, or estimate in those materials.

- [NASA Space Apps challenge and resources](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources)
- [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/)
- [NASA PGDA product 78](https://pgda.gsfc.nasa.gov/products/78)
- [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90)
- Team-provided [feature and resource planning document](https://docs.google.com/document/d/1aNnEIbrAzsKJm3FffKX9eGWTH9oUM-_W7JUQlNdLkc8/edit)
- Team-provided [shared feature analysis](https://chatgpt.com/s/t_6af6d2f5d4b081918114c02c80ea2421)

## Consequences and follow-up

The team can organize data research around a traceable site catalog, bounded terrain/uncertainty coverage, and reproducible ephemeris time series. Exact sites and coordinates, product versions, spatial footprints, resolution mix, time cadence, storage budget, reference cases, and numerical acceptance tolerances remain open. No acquisition or processing implementation is authorized by this feature-scope record.

## Revisit trigger

Revisit if the chosen demonstration, source coverage, or validation evidence cannot support the selected sites or terrain-uncertainty analysis, or if the team explicitly changes the target user workflow.
