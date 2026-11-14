# Site04 diagnostic reproduction

These scripts reproduce the conditional case described in [the diagnostic](../docs/site04-observer-diagnostic.md). They are research tools, not production pipelines or validated landing-site results. Python with NumPy and Rasterio 1.5.2 was used; internet access is required. Run from repository root:

```sh
python analysis/site04_horizons_probe.py
python analysis/site04_horizon_diagnostic.py
python analysis/check_site04_case.py
```

Both write new outputs under Git-ignored `artifacts/site04-case/`; the checked-in evidence is not overwritten. The horizon script reads HTTP Range blocks with a 24 MiB per-file cap, validates HTTP 206 and byte-range lengths and refuses unbounded reads. A rerun may observe a changed source: compare source metadata and hashes with the retained evidence before comparing profiles. The 80 m crop itself is not committed. The Horizons API includes both endpoints; use `[start,end)` (744 of 745 rows) for the pilot interval.

The observer and Z-to-ellipsoid conversion are provisional. This case leaves terrain under 1 km out of the horizon, uses 80 m alone and grid-north azimuth, and is not suitable to claim mission visibility. The nested-radius check is not an independent scientific reference.

The offline checker validates retained time grids, nested-bin monotonicity, per-bin distances/counts, and an ideal-sphere curvature approximation. It does not independently validate the DEM, projection, observer datum, or physical horizon.
