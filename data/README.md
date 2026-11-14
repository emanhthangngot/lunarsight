# Data planning boundary

**No production dataset or full raster collection has been selected or acquired for this repository.** Geographic extent, products, resolution, temporal coverage, total size, and storage budget are still team decisions.

Read [candidate sources](../docs/data-sources.md), [quality proposals](../docs/data-quality.md), and [open decisions](../docs/open-decisions.md). Numeric sizes in those documents are illustrative source estimates, not an instruction to download or a commitment by the team.

The current phase does not create download scripts, processing pipelines, fixtures presented as observations, or data manifests that imply selection. A later authorized implementation can define its file-level manifest and storage layout after the relevant choices are made.

This folder currently contains only this explanation. Large original products and generated outputs should remain outside ordinary Git history when future acquisition is authorized. The eventual storage backend and release method remain open.

The authorized candidate-review notebook at [`notebooks/candidate-site-visual-review.ipynb`](../notebooks/candidate-site-visual-review.ipynb) embeds only small reference metadata and simplified outlines from four tiny ROI archives for plotting. It contains no raster pixels or full source datasets and does not imply that any candidate has been selected.

The user subsequently authorized small native DEM crops for the pre-decision terrain notebook. These are cached at ignored `data/preview/` and can be fetched again through the notebook with per-site range-read limits. Only rendered figures and window/source metadata are versioned; raw preview arrays are not committed. These samples are not an acquisition decision or an application data release.
