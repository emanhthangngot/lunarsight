# Environmental temperature and resource evidence

This package replaces the proposal's demonstration temperatures and resource percentages with traceable source data. Coordinates are the six coordinates in the supplied proposal, not a claim that the names match officially selected landing points. Longitudes are east-positive; geographic latitudes are planetocentric on a spherical lunar reference unless a product label says otherwise.

## Thermal annual model

`data/environment/thermal/site_thermal_summary.{csv,json}` contains nearest triangle-centre samples from the real Diviner Polar Resource Product V2 (`LRO-L-DLRE-5-PRP-V2.0`, DOI [10.17189/1520650](https://doi.org/10.17189/1520650)). The preserved product XML is authoritative for field interpretation:

- `thermal_annual_mean_at_2cm_K`: annual average modeled temperature **2 cm below the surface**.
- `thermal_annual_surface_max_K`: annual maximum modeled **surface** temperature.
- `thermal_annual_surface_min_K`: intentionally null. This product supplies no annual minimum field.
- `ice_stability_depth_model_m`: depth at which modeled water ice sublimates at 1 kg m⁻² per billion years. This is a stability condition, not a detection or abundance. Source `-999` means the calculated depth exceeds 2.8738 m; it becomes null with its reason retained.

The PRP is a thermal model fitted to Diviner observations from the first mapping year and uses a Kaguya-derived triangular terrain mesh. This is not a model recomputed for the user's chosen mission dates, mast height or current terrain DEM. Nearby triangle-centre samples do not resolve lander-footprint or hardware thermal conditions. Original three-dimensional triangle vertices, center latitude/longitude, altitude, temperatures, and source values are retained in `{site_id}_diviner_prp_facets_3km.csv` within a 3 km geodesic distance of each covered proposal coordinate. The center-distance field lets clients represent sampling resolution honestly. No values are interpolated to pretend to be measured at the exact site coordinate. SHIV is outside the selected polar mesh and has null thermal fields.

## Seasonal observations

`site_seasonal_temperature_samples.csv` and per-site equivalents hold bounded extracts from real Diviner Polar Cumulative Products. These are bolometric brightness temperatures, compiled from observations acquired 5 July 2009 to 15 March 2020, binned on a 240 m polar stereographic grid. They are a different physical quantity and data lineage from the PRP annual subsurface mean.

The retained subset spans the six 60° seasonal/ecliptic-longitude (`Ls`) bins centered at 30, 90, 150, 210, 270, and 330 degrees, for **two selected** 15° subsolar-longitude bins (0–15° and 180–195°). The source product contains 24 such diurnal bins; this compact pack does not contain them all. `lunar_local_time_hours` is the actual local time in the source row, not a UTC mission timestamp. Do not treat a subsolar-longitude bin as a common local time at every site.

Only a nearest available row within 600 m is accepted. Missing bins, unphysical source temperatures, and out-of-coverage sites remain null with status. SHIV is outside the seasonal product's 80–90°S coverage. Sampled extrema across the retained bins are **not annual minimum/maximum temperatures**, and should not be presented as such. These observations cannot determine a continuous mission thermal history or seasonal survival limits by themselves. `metadata/environment/seasonal_retrieval_failures.json` reports any failed retrieval bins.

Reproducible extraction: PDS4 XML describes fixed 68-byte records with a 68-byte header; records contain normalized stereographic X and Y coordinates as well as centre longitude/latitude. `scripts/prepare_environment.py` caches the selected complete source tables externally, then scans every source row to determine the global nearest available observation bin independently for every covered site. This prevents a coordinate-sorted local search from overlooking spatial gaps. Fixed record offsets are used to retain the exact original nearest source record. Only the small extracted record blocks enter this deliverable. Initial HTTP Range retrieval was replaced because per-request latency made repeated sparse reads impractical; the source table URL, full source SHA-256 and exact extracted byte offsets make the final method reproducible. Original record bytes are preserved under `metadata/environment/seasonal_source_ranges/`, and each product's `*_ranges.json` records the original URL, inclusive byte offsets, byte count and SHA-256. Original XML labels are preserved. Complete ~200 MB seasonal tables are not bundled. Twelve selected tables (approximately 2.4 GB, versus roughly 30 GB for the full seasonal collection) are cached outside the deliverable.

## Hydrogen resource proxy

`data/environment/resources/hydrogenlow_original.txt` is the **complete compact original** Lunar Prospector Hydrogen_low special product. The companion `lunar_prospector_hydrogen_bins.csv` preserves all 11,306 equal-area bins and bounds. Each proposal site has a containment lookup in `site_resource_evidence.{csv,json}` and a separate JSON record. No interpolation or spatial downscaling is applied.

Values are **elemental H ppm by weight**, derived from epithermal neutron data corrected using thermal neutron data; nominal bins are 60 km × 60 km. These are coarse regional evidence, not a 60 m resource map. At the pole a single bin spans a large longitude range, so multiple nearby sites can share exactly the same value. The original table uses signed east longitude, which is retained in bin bounds; site longitude is normalized during containment lookup.

The PDS Geosciences hosting page explicitly identifies this as a **special product that does not represent a PDS peer-reviewed archive**. Per-bin standard deviations are not supplied for hydrogen; uncertainty remains null with an explanation. The source cautions about reliability in regions with high thorium/rare-earth abundances. Data integrate the 1998–1999 Lunar Prospector mission and do not describe current in-situ measurements.

`water_ice_wt_pct` is null for **every** site. Neither hydrogen ppm, a permanently shadowed region, a cold temperature, nor modeled ice-stability depth establishes local water-ice concentration. The proposal's 0.8% and 5.6% demo values are not carried into this real-data pack. No assumption converts hydrogen into water-equivalent hydrogen or water-ice weight percent.

## Primary sources and reproducibility

- [Diviner PRP PDS identification and DOI](https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=LRO-L-DLRE-5-PRP-V2.0)
- [Current PRP PDS4 source directory](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/)
- [Diviner team seasonal product release](https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds)
- [PDS4 seasonal source directory](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/seasonal/slon/pols/)
- [Lunar Prospector special-product descriptions and limitations](https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html)
- [Original hydrogen ASCII source](https://pds-geosciences.wustl.edu/missions/lunarp/reduced/hydrogenlow.txt)

Run `python scripts/prepare_environment.py --pack-root . --cache /path/to/environment_raw` from an environment containing numpy and pandas. An initial run downloads the 604,800,210-byte PRP source table and twelve selected seasonal tables to the external cache; only bounded extracts and compact originals/metadata enter the deliverable. Reusing the cache avoids repeating that large download. Use `--skip-seasonal` only when intentionally excluding seasonal retrieval. Source and output checksums are recorded in `metadata/environment/environment_manifest_fragment.json`; the top-level pack builder incorporates this fragment.
