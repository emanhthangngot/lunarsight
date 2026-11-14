# Site04 diagnostic reproduction

These scripts reproduce the conditional case described in [the diagnostic](../docs/site04-observer-diagnostic.md). They are research tools, not production pipelines or validated landing-site results. Python with NumPy and Rasterio 1.5.2 was used; internet access is required. Run from repository root:

```sh
python analysis/site04_horizons_probe.py
python analysis/site04_horizon_diagnostic.py
python analysis/check_site04_case.py
python analysis/site04_nearfield_diagnostic.py
python analysis/check_site04_nearfield.py
python analysis/site04_overlap_diagnostic.py
python analysis/site04_area_overlap.py
python analysis/check_site04_area_overlap.py
python analysis/site04_spherical_crosscheck.py
python analysis/site04_50km_diagnostic.py
python analysis/site04_combine_50km.py
python analysis/site04_100km_diagnostic.py
python analysis/site04_combine_100km.py
python analysis/check_site04_100km.py
python analysis/check_site04_convergence.py
```

The Horizons and 25 km scripts write new outputs under Git-ignored `artifacts/site04-case/`; the checked-in evidence is not overwritten. The horizon script reads HTTP Range blocks with a 24 MiB per-file cap, validates HTTP 206 and byte-range lengths and refuses unbounded reads. A rerun may observe a changed source: compare source metadata and hashes with the retained evidence before comparing profiles. The 80 m crop itself is not committed. The Horizons API includes both endpoints; use `[start,end)` (744 of 745 rows) for the pilot interval.

The observer and Z-to-ellipsoid conversion are provisional. This case leaves terrain under 1 km out of the horizon, uses 80 m alone and grid-north azimuth, and is not suitable to claim mission visibility. The nested-radius check is not an independent scientific reference.

The offline checker validates retained time grids, nested-bin monotonicity, per-bin distances/counts, and an ideal-sphere curvature approximation. It does not independently validate the DEM, projection, observer datum, or physical horizon.

The near-field script writes to ignored `artifacts/site04-nearfield/`; it checks frozen source-window and far-evidence hashes when available. Its bin-wise maximum omits the inner 5 m, has an unvalidated 1 km seam and is not a verified ray horizon or mission visibility.

The 5 m and 80 m diagnostic scripts save bounded raw windows only inside ignored `artifacts/`; the overlap script compares 80 m pixel centers against nearest 5 m cells in the 800–975 m annulus. This is not matched-resolution resampling and cannot verify the vertical datum.

The 50 km window is bounded with the same 24 MiB HTTP cap and must reproduce the frozen inner 25 km profile. Area averaging matches geometric support only; the spherical-vector cross-check reuses the same terrain and is not an external reference.

The 50 km script writes to ignored `artifacts/site04-50km/` and checks its 25 km inner profile against frozen evidence. The GDAL comparison checks area-weighting arithmetic, while the spherical-vector comparison uses the same DEM and is not an independent terrain truth.

For the seam-quality layers, run `SITE04_FETCH_QUALITY=1 python analysis/site04_seam_quality.py` once to obtain bounded windows, then rerun without the variable to use the ignored cache. Source-window fingerprints are compared to frozen evidence. The five layers are counts/errors/resolution evidence, not an uncertainty propagation. After populating the cache, `python analysis/check_site04_seam_quality.py` checks the 111 area-weighted values with GDAL average resampling.

The 100 km diagnostic (`analysis/site04_100km_diagnostic.py`) is a bounded 80 m investigation with a 48 MiB cap; it does not establish convergence by itself.
