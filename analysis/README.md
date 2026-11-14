# Diagnostic reproduction scripts

These scripts reproduce the conditional cases described in the diagnostics. They are research tools, not production pipelines or validated landing-site results. Python with NumPy and Rasterio was used; internet access is required for remote reads. Run from repository root:

```sh
# Site01 ROI diagnostic and offline contract checks:
python analysis/site01_roi_diagnostic.py
python analysis/check_site01_roi.py

# Site04 observer and horizon diagnostics:
python analysis/site04_horizons_probe.py
python analysis/site04_horizon_diagnostic.py
python analysis/check_site04_case.py
python analysis/site04_nearfield_diagnostic.py
python analysis/check_site04_nearfield.py
python analysis/site04_overlap_diagnostic.py
```

Both write new outputs under Git-ignored `artifacts/site04-case/`; the checked-in evidence is not overwritten. The horizon script reads HTTP Range blocks with a 24 MiB per-file cap, validates HTTP 206 and byte-range lengths and refuses unbounded reads. A rerun may observe a changed source: compare source metadata and hashes with the retained evidence before comparing profiles. The 80 m crop itself is not committed. The Horizons API includes both endpoints; use `[start,end)` (744 of 745 rows) for the pilot interval.

The observer and Z-to-ellipsoid conversion are provisional. This case leaves terrain under 1 km out of the horizon, uses 80 m alone and grid-north azimuth, and is not suitable to claim mission visibility. The nested-radius check is not an independent scientific reference.

The offline checker validates retained time grids, nested-bin monotonicity, per-bin distances/counts, and an ideal-sphere curvature approximation. It does not independently validate the DEM, projection, observer datum, or physical horizon.

The near-field script writes to ignored `artifacts/site04-nearfield/`; it checks frozen source-window and far-evidence hashes when available. Its bin-wise maximum omits the inner 5 m, has an unvalidated 1 km seam and is not a verified ray horizon or mission visibility.

The 5 m and 80 m diagnostic scripts save bounded raw windows only inside ignored `artifacts/`; the overlap script compares 80 m pixel centers against nearest 5 m cells in the 800–975 m annulus. This is not matched-resolution resampling and cannot verify the vertical datum.
