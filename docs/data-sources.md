# Candidate data sources

Status: **13 November 2026 — proposals for team review only**.

This repository currently provides a documentation foundation. The team has not selected data products, geographic coverage, resolutions, quantities, or a storage budget. Every candidate below has the status **not selected / not acquired for this repository**. Earlier exploratory work does not establish team approval or an implementation baseline.

Archive descriptions and approximate sizes help compare options. They do not commit the team to downloading, processing, or using those products. Selection would require a recorded team decision and a subsequent implementation request.

## Geographic options to discuss

These are alternatives or possible combinations, not agreed tiers of coverage.

| Proposed option | Possible area | Potential purpose | Decision still open |
| --- | --- | --- | --- |
| Selected locations | Small areas around agreed coordinates | A focused demonstration or scientific comparison | Which coordinates, footprint sizes, and required variables? |
| Southern hemisphere | 0–90°S | Broad discovery and terrain/thermal context | Is hemisphere coverage necessary for the first version? |
| Southern polar region | 60–90°S | Regional screening; matches the earlier proposal's custom-coordinate range | Is this the intended domain, and at what resolution? |
| Polar detail | 80–90°S or smaller areas | More detailed terrain and environmental study | Does the intended question justify the additional data volume? |

The proposed application domain, the footprint of an individual product, and the area containing valid observations must be documented separately. Finer grid spacing does not by itself establish higher measurement accuracy.

## Candidate register

**Status of every row: not selected / not acquired for this repository.** Resolution and volume examples below describe possible choices and source characteristics, not agreed requirements.

| Candidate source | Potential use | Optional product or scope examples | Questions and limitations to review |
| --- | --- | --- | --- |
| [LOLA GDR, PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/cylindrical/jp2/) | Terrain context and elevation | A proposed southern-hemisphere option is two 256 pixel/degree JP2 tiles, approximately 1.002 GB; finer or smaller selections are alternatives | Angular grid spacing varies in ground dimensions with latitude. Binning and interpolation affect effective resolution. Choose a suitable scale for the intended question. |
| [NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90) | Polar DEM, slope, uncertainty, effective resolution, shot density, roughness, and permanent shadow | Optional examples include 240 m products over 60–90°S or 20 m products over 80–90°S; the team may choose fewer layers or smaller areas | Layer sets and resolutions remain undecided. Preserve frame, projection, scale, uncertainty, and validity information. |
| [NASA PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) | Local detailed terrain where available | Selected local 5 m products are an option for specific footprints | Local availability does not imply continuous 5 m coverage of the pole or hemisphere. Confirm footprint and effective resolution before selection. |
| [LOLA/MIT illumination archive](https://imbrium.mit.edu/EXTRAS/ILLUMINATION/IMG/) and [PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) | Long-term solar/Earth visibility and permanent-shadow context | Polar products could support a selected-area study | Long-term fractions are not predictions for a particular mission window. Check coverage for any proposed location, especially those farther from the pole. |
| [Diviner Global Cumulative Products](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_gcp/) | Broad thermal context | One proposed hemisphere option contains nine southern tables, approximately 1.406 GB; source bins are 0.5° and 0.25 hours of local solar time | These are accumulated observations from 2009–2015, not a UTC forecast. Selected latitude bands may be enough. Missing bins remain missing. |
| [Diviner south-polar seasonal products](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_pcp/seasonal/slon/pols/) | Thermal comparison by season and subsolar longitude | Approximately 240 m source grids; the complete directory example contains 144 tables totaling about 30.738 GB | A smaller subset or deferral may fit the first version better. Specify which bins support the intended interpretation. See the [instrument team's description](https://www.diviner.ucla.edu/single-post/new-diviner-south-polar-data-products-released-on-pds). |
| [Diviner Polar Resource Products](https://pds-geosciences.wustl.edu/lro/urn-nasa-pds-lro_diviner_derived1/data_derived_prp/) | Published thermal-model indicators | A southern table of approximately 0.605 GB is one possible source | Mean temperature at 2 cm depth, annual maximum surface temperature, and modeled ice-stability depth are distinct variables. Consult the [PRP V2 record](https://pds.nasa.gov/ds-view/pds/viewDataset.jsp?dsid=LRO-L-DLRE-5-PRP-V2.0) and product labels. |
| [LROC WAC global mosaic](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_GLOBAL) | Visual basemap | Regional 100 m/pixel imagery or lower-resolution global products are alternatives | Decide whether imagery is needed, which footprint to use, and the acceptable display resolution. Imagery is not elevation or temperature. |
| [LROC NAC south-pole mosaic](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_POLE_SOUTH) | Detailed visual inspection | Optional 1 m/pixel imagery over approximately 85.5–90°S; individual tiles may suffice | The archive describes an uncontrolled mosaic. Review image registration and footprint; fine imagery does not imply a comparably fine DEM. |
| [Lunar Prospector special products](https://pds-geosciences.wustl.edu/missions/lunarp/reduced_special.html) | Regional hydrogen context | Coarse elemental-hydrogen products are a possible resource layer | The source identifies these special products as outside the peer-reviewed PDS archive. Hydrogen is not a direct measure of local water-ice mass percentage. Label the instrument correctly. |
| [LEND archive overview](https://pds-geosciences.wustl.edu/missions/lro/lend.htm) | Alternative or additional neutron-based resource evidence | Product choice, resolution, and time span remain open | LEND and Lunar Prospector are different instruments/products. Neutron measurements need documented interpretation; they are not interchangeable with ice abundance. |
| [JPL NAIF generic kernels](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/) and [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Possible Sun/Earth geometry and reference comparisons | Kernel set, reference frames, time span, and time sampling are all undecided | If calculations are later requested, document aberration conventions, observer elevation, mast height, and compatibility with the chosen terrain frame. |
| [USGS/IAU planetary nomenclature](https://planetarynames.wr.usgs.gov/) | Review names and coordinates | Named-feature records may support an agreed site catalog | A feature center or historical mission association does not establish the intended analysis location. Review names and coordinates explicitly. |

The [ODE REST API documentation](https://ode.rsl.wustl.edu/moon/pagehelp/Content/Additional_Resources/ODE_REST_API.htm) is a possible discovery reference. No acquisition mechanism, tool, processing script, or storage technology is selected here.

## Volume is an open decision

An earlier discussion combined several of these alternatives into an **illustrative, unapproved scenario of roughly 56.2 GB of source files**, before imagery, additional resources, or derived outputs. That number is **not a required budget, an agreed download list, a completed collection, or a commitment for this repository**.

Other valid proposals include a small study area, selected layers only, coarser products, or postponing seasonal thermal/resource layers. A meaningful budget requires the team to choose the scientific questions, geographic domain, resolutions, layer set, and retention policy first. No working-disk, memory, runtime, or hosting requirement is committed at this stage.

## Evidence needed before a future selection

For each candidate the team chooses to evaluate further, record the intended question, exact product/version, footprint, native resolution, units, variable meaning, observation/model period, missing-data behavior, uncertainty, attribution, and estimated volume. Record the decision as proposed, accepted, deferred, or rejected with its reason.

Source discovery must remain distinct from selection, acquisition, processing, and validation. Read [data-quality.md](data-quality.md) for the proposed scientific acceptance criteria and [roadmap.md](roadmap.md) for the documentation-first sequence.
