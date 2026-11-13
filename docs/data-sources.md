# Data sources and acquisition scope

Status: **13 November 2026**. Core source discovery is sufficient to begin wider acquisition. A real six-site data pack has been prepared separately; the full southern-hemisphere collection is **not yet downloaded, harmonized, or validated**.

LunarSight combines observations, published derived products, and calculations performed by the project. Preserve those distinctions in storage, exports, and the interface.

## Geographic scope

| Tier | Area | Intended use |
| --- | --- | --- |
| Hemisphere | 0–90°S | Basemap, terrain context, broad thermal context, arbitrary-location discovery |
| Regional | 60–90°S | Screening with polar terrain and quality layers; covers the proposal's custom-coordinate domain |
| Polar detail | 80–90°S | Finer terrain, slope, uncertainty, shadow, and seasonal thermal analysis |

Spatial coverage does not guarantee valid observations in every cell. Each layer retains its native resolution, validity mask, time definition, and uncertainty. A 20 m analysis grid does not turn coarse thermal or hydrogen observations into 20 m measurements.

## Core source register

| Source | Product and scope | Planned role | Acquisition notes |
| --- | --- | --- | --- |
| [LOLA GDR, PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/jp2/) | Global gridded laser altimetry; select southern tiles | Hemisphere elevation baseline | Two southern 256 pixel/degree JP2 tiles total approximately 1.002 GB. Grid spacing is about 118 m in the north–south direction; longitude spacing varies with latitude. Binning and interpolation affect effective resolution. |
| [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90) | Adjusted south-polar topography and related products | DEM, slope, height/slope uncertainty, effective resolution, shot density, roughness, PSR | Selected six-layer bundles: approximately 1.40 GB at 240 m for 60–90°S and 19.59 GB at 20 m for 80–90°S. Preserve each product's frame, projection, scale, and quality metadata. |
| [NASA PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) | Selected local high-resolution south-polar terrain | Detailed follow-up where the product footprint supports it | The v1 pack includes a local 5 m crop at site C. This is not continuous 5 m coverage of the pole or hemisphere. |
| [LOLA/MIT illumination archive](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/) and [PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) | Long-term polar solar visibility, Earth visibility, and permanent-shadow products | Context layers and comparisons with derived visibility | The v1 extracts cover A–E; SHIV is outside these polar products. Long-term fractions are not predictions for the user's mission dates. |
| [Diviner Global Cumulative Products](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/) | Nine southern tables; 0.5° spatial bins and 0.25-hour local-solar-time bins | Broad thermal context across 0–90°S | Approximately 1.406 GB. Derived from radiance observations accumulated over 2009–2015. Missing bins remain missing; this is not a UTC forecast. |
| [Diviner south-polar seasonal products](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/seasonal/slon/pols/) | Polar seasonal observations, approximately 240 m grid | Compare thermal conditions by seasonal and subsolar-longitude bin | Complete selected collection: 144 tables, approximately 30.738 GB. The v1 pack sampled only 12 products. See the [instrument team's product description](https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds). |
| [Diviner Polar Resource Products](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/) | Southern thermal-model facets | Annual thermal indicators and modeled ice-stability depth | Southern table approximately 0.605 GB. Read the labels for each variable: annual mean temperature at 2 cm depth differs from annual maximum surface temperature. [PRP V2 record](https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=LRO-L-DLRE-5-PRP-V2.0). |
| [LROC WAC global mosaic](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_GLOBAL) | Global imagery; regional 100 m/pixel tiles available | Basemap and visual interpretation | Imagery is not elevation or a quantitative temperature layer. The v1 release uses a smaller 16 pixel/degree global basemap. |
| [LROC NAC south-pole mosaic](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_POLE_SOUTH) | Approximately 85.5–90°S, 1 m/pixel imagery | Local visual inspection of selected candidates | Download selected tiles as needed. The archive describes this as an uncontrolled mosaic; account for image registration limitations. Fine imagery does not imply equally fine DEM coverage. |
| [Lunar Prospector special products](https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html) | Regional elemental hydrogen abundance | Resource context with explicit resolution and caveats | The v1 release contains all 11,306 hydrogen bins, nominally about 60 × 60 km. The source identifies these special products as outside the peer-reviewed PDS archive. This is Lunar Prospector, not LEND. |
| [LEND archive overview](https://pds-geosciences.wustl.edu/missions/lro/lend.htm) | LRO neutron-detector products | Optional additional resource evidence | Product selection, ingestion, and scientific interpretation remain to be completed before the app can label a layer as LEND. Do not equate neutron or hydrogen values with local water-ice mass percentage. |
| [JPL NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) and [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Solar-system ephemerides and reference calculations | Sun/Earth geometry at a specified location and UTC | Record kernel versions, loaded frames, aberration conventions, observer elevation, and mast height. The v1 calculation uses compatible DE440/MOON_ME kernels and retained Horizons responses. |
| [USGS/IAU planetary nomenclature](https://planetarynames.wr.usgs.gov/) | Named lunar features | Audit display names against coordinates | A feature's center or name does not establish a mission landing location. Preserve the coordinate audit. |

Use the [ODE REST API documentation](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Additional_Resources/ODE_REST_API.htm) where applicable for product discovery and download metadata. Source discovery and successful metadata lookup must not be recorded as a completed file download.

## Selected source budget

This is a planning estimate from the selected source files, **not the size of an already assembled collection**. GB below is approximately decimal GB.

| Component | Approximate GB |
| --- | ---: |
| Hemisphere LOLA baseline | 1.00 |
| Six regional terrain/quality layers | 1.40 |
| Six polar terrain/quality layers | 19.59 |
| Roughness, PSR, and selected polar context | 1.46 |
| Southern Diviner global products | 1.41 |
| Complete selected polar seasonal collection | 30.74 |
| Southern PRP model table | 0.60 |
| **Selected total** | **56.2** |

Imagery, additional resource products, alternative resolutions, temporary processing files, and generated tiles are additional. A working-storage allowance of roughly 150–250 GB is an engineering estimate for this configuration, not an archive requirement. This scope does not mirror every raw observation from every lunar instrument.

## Existing six-site release

The separately prepared v1 release contains 355 files, a 153,677,354-byte ZIP, 41 rasters, 219,318 site-time ephemeris rows, 12,960 horizon rows, and 150 preset scenarios. Most local terrain crops use 80 m grids; SHIV uses 240 m; C also has a local 5 m product. The pack does not contain the full 20 m polar DEM.

Its 72 seasonal site samples contain 38 valid values and 34 explicitly missing values. Availability is therefore part of the data contract, not an afterthought. The prepared data pack and source-reproduction scripts are not a deployed web application.

## Required interpretation rules

- Keep `water_ice_wt_pct` and `thermal_annual_surface_min_K` null until a suitable source or explicitly documented model supports those exact quantities. Never fill missing data with zero or proposal demo values.
- Do not infer water ice from PSR membership alone. Hydrogen abundance, modeled ice-stability depth, and measured water-ice mass percentage are different quantities.
- Retain the proposal coordinates until a deliberate catalog revision is made. Site C at −89.62°, 178.30°E is approximately 87 km from the USGS Faustini center; its proposal label needs correction. Site A's rim label also needs review.
- Resolve lunar cartographic frames and height datums explicitly, including compatibility between source terrain and ephemeris frames. Do not relabel lunar data with terrestrial EPSG:4326 or EPSG:3857.
- Keep source products, project-derived results, mission-profile assumptions, and unavailable values distinguishable. Each result needs source/product version, units, processing method, coverage status, resolution or cadence, and limitations.
- Earth line of sight does not establish a working radio link. Illumination fraction does not establish a power budget. Hourly samples do not support minute-level transition precision.
- Numerical benchmarks validate their documented cases and tolerances. LunarSight is a preliminary screening and education project; its results are not NASA/JPL certification or mission-safety approval.
