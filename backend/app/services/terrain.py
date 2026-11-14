"""PGDA LOLA DEM mosaic loader, bilinear sampler, and patch extractor."""

from __future__ import annotations

from dataclasses import dataclass
import json
import math
from pathlib import Path
import numpy as np

from ..geo import south_polar_forward, validate_coordinates
from ..models import CoverageBounds, DemLayerMeta, DemManifest, ElevationResponse, Provenance


@dataclass(frozen=True)
class LoadedDemLayer:
    meta: DemLayerMeta
    raw_bytes: bytes
    grid: np.ndarray  # shape (rows, cols), dtype float32


def sample_layer_bilinear_scalar(layer: LoadedDemLayer, x_m: float, y_m: float) -> float | None:
    """Bilinearly sample one Float32 DEM grid at South Polar Stereographic (x_m, y_m)."""
    meta = layer.meta
    if meta.rows < 2 or meta.cols < 2 or meta.spacingM <= 0:
        return None
    fx = (x_m - meta.xMinM) / meta.spacingM - 0.5
    fy = (meta.yMaxM - y_m) / meta.spacingM - 0.5
    if fx < 0.0 or fy < 0.0 or fx > meta.cols - 1 or fy > meta.rows - 1:
        return None

    c0 = min(meta.cols - 2, int(math.floor(fx)))
    r0 = min(meta.rows - 2, int(math.floor(fy)))
    tx = fx - c0
    ty = fy - r0

    grid = layer.grid
    v00 = float(grid[r0, c0])
    v01 = float(grid[r0, c0 + 1])
    v10 = float(grid[r0 + 1, c0])
    v11 = float(grid[r0 + 1, c0 + 1])
    if not (math.isfinite(v00) and math.isfinite(v01) and math.isfinite(v10) and math.isfinite(v11)):
        return None

    return (1.0 - ty) * ((1.0 - tx) * v00 + tx * v01) + ty * ((1.0 - tx) * v10 + tx * v11)


def sample_layer_bilinear_array(
    layer: LoadedDemLayer, x_m: np.ndarray, y_m: np.ndarray
) -> np.ndarray:
    """Vectorized bilinear sampling; out-of-bounds or non-finite cells yield NaN."""
    meta = layer.meta
    rows, cols = meta.rows, meta.cols
    if rows < 2 or cols < 2 or meta.spacingM <= 0:
        return np.full(x_m.shape, np.nan, dtype=np.float64)

    fx = (x_m - meta.xMinM) / meta.spacingM - 0.5
    fy = (meta.yMaxM - y_m) / meta.spacingM - 0.5
    in_bounds = (fx >= 0.0) & (fy >= 0.0) & (fx <= cols - 1) & (fy <= rows - 1)

    c0 = np.clip(np.floor(fx).astype(np.int64), 0, cols - 2)
    r0 = np.clip(np.floor(fy).astype(np.int64), 0, rows - 2)
    tx = fx - c0
    ty = fy - r0

    grid = layer.grid
    v00 = grid[r0, c0].astype(np.float64)
    v01 = grid[r0, c0 + 1].astype(np.float64)
    v10 = grid[r0 + 1, c0].astype(np.float64)
    v11 = grid[r0 + 1, c0 + 1].astype(np.float64)

    finite = np.isfinite(v00) & np.isfinite(v01) & np.isfinite(v10) & np.isfinite(v11)
    val = (1.0 - ty) * ((1.0 - tx) * v00 + tx * v01) + ty * ((1.0 - tx) * v10 + tx * v11)
    return np.where(in_bounds & finite, val, np.nan)


class TerrainService:
    """Serves PGDA DEM mosaic metadata, layer binaries, point elevation, and cropped patches."""

    def __init__(self, pilot_public_dir: Path) -> None:
        self._public_dir = pilot_public_dir
        self._manifest: DemManifest | None = None
        self._layers: list[LoadedDemLayer] | None = None
        self._layers_by_id: dict[str, LoadedDemLayer] = {}

    def _ensure_loaded(self) -> tuple[DemManifest, list[LoadedDemLayer]]:
        if self._manifest is not None and self._layers is not None:
            return self._manifest, self._layers

        manifest_path = self._public_dir / "terrain_manifest.json"
        raw_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest = DemManifest.model_validate(raw_manifest)

        loaded: list[LoadedDemLayer] = []
        by_id: dict[str, LoadedDemLayer] = {}
        for meta in manifest.layers:
            filename = Path(meta.url).name
            bin_path = self._public_dir / filename
            raw_bytes = bin_path.read_bytes()
            arr = np.frombuffer(raw_bytes, dtype=np.float32)
            expected = meta.rows * meta.cols
            if arr.size != expected:
                raise ValueError(
                    f"DEM layer {meta.id} size mismatch: expected {expected}, got {arr.size}"
                )
            layer = LoadedDemLayer(
                meta=meta,
                raw_bytes=raw_bytes,
                grid=arr.reshape((meta.rows, meta.cols)),
            )
            loaded.append(layer)
            by_id[meta.id] = layer

        self._manifest = manifest
        self._layers = loaded
        self._layers_by_id = by_id
        return manifest, loaded

    @property
    def coverage(self) -> CoverageBounds:
        manifest, _ = self._ensure_loaded()
        return manifest.coverage

    @property
    def provenance(self) -> Provenance:
        manifest, _ = self._ensure_loaded()
        return manifest.provenance

    @property
    def layers(self) -> list[LoadedDemLayer]:
        _, layers = self._ensure_loaded()
        return layers

    def get_manifest(self, layer_url_prefix: str = "/api/terrain/layers") -> DemManifest:
        manifest, _ = self._ensure_loaded()
        prefix = layer_url_prefix.rstrip("/")
        rewritten_layers = [
            layer.model_copy(update={"url": f"{prefix}/{layer.id}.bin"})
            for layer in manifest.layers
        ]
        return manifest.model_copy(update={"layers": rewritten_layers})

    def get_layer(self, layer_id: str) -> LoadedDemLayer | None:
        self._ensure_loaded()
        return self._layers_by_id.get(layer_id)

    def height_at(self, lat_deg: float, lon_deg_e: float) -> tuple[float | None, str | None]:
        """Hierarchical height lookup across priority-ordered layers. Returns (heightM, layerId)."""
        lat_v, lon_v = validate_coordinates(lat_deg, lon_deg_e)
        manifest, layers = self._ensure_loaded()
        if lat_v < manifest.coverage.southDeg or lat_v > manifest.coverage.northDeg:
            return None, None

        x_m, y_m = south_polar_forward(lat_v, lon_v)
        for layer in layers:
            value = sample_layer_bilinear_scalar(layer, float(x_m), float(y_m))
            if value is not None:
                return value, layer.meta.id
        return None, None

    def height_array(self, lat_deg: np.ndarray, lon_deg_e: np.ndarray) -> np.ndarray:
        """Vectorized hierarchical height lookup across all layers."""
        manifest, layers = self._ensure_loaded()
        x_m, y_m = south_polar_forward(lat_deg, lon_deg_e)
        result = np.full(np.asarray(lat_deg).shape, np.nan, dtype=np.float64)
        in_lat = (lat_deg >= manifest.coverage.southDeg) & (lat_deg <= manifest.coverage.northDeg)

        for layer in layers:
            need = in_lat & np.isnan(result)
            if not np.any(need):
                break
            sampled = sample_layer_bilinear_array(layer, x_m[need], y_m[need])
            result[need] = sampled
        return result

    def query_elevation(self, lat_deg: float, lon_deg_e: float) -> ElevationResponse:
        lat_v, lon_v = validate_coordinates(lat_deg, lon_deg_e)
        height_m, layer_id = self.height_at(lat_v, lon_v)
        return ElevationResponse(
            latDeg=lat_v,
            lonDegE=lon_v,
            heightM=height_m,
            outsideCoverage=height_m is None,
            layerId=layer_id,
            provenance=self.provenance.model_copy(deep=True),
        )

    def extract_patch(
        self, lat_deg: float, lon_deg_e: float, radius_m: float = 2000.0
    ) -> tuple[DemLayerMeta, bytes] | None:
        """Crop a sub-grid around (lat, lon) from the finest covering DEM layer."""
        if not math.isfinite(radius_m) or radius_m <= 0.0 or radius_m > 100_000.0:
            raise ValueError("radiusM must be finite and between 0 and 100,000 m")

        lat_v, lon_v = validate_coordinates(lat_deg, lon_deg_e)
        manifest, layers = self._ensure_loaded()
        if lat_v < manifest.coverage.southDeg or lat_v > manifest.coverage.northDeg:
            return None

        x_m, y_m = south_polar_forward(lat_v, lon_v)
        x_f, y_f = float(x_m), float(y_m)

        selected: LoadedDemLayer | None = None
        for layer in layers:
            if sample_layer_bilinear_scalar(layer, x_f, y_f) is not None:
                selected = layer
                break
        if selected is None:
            return None

        meta = selected.meta
        c0 = max(0, int(math.floor((x_f - radius_m - meta.xMinM) / meta.spacingM)))
        r0 = max(0, int(math.floor((meta.yMaxM - (y_f + radius_m)) / meta.spacingM)))
        c1 = min(meta.cols, int(math.ceil((x_f + radius_m - meta.xMinM) / meta.spacingM)) + 1)
        r1 = min(meta.rows, int(math.ceil((meta.yMaxM - (y_f - radius_m)) / meta.spacingM)) + 1)
        if c1 - c0 < 2 or r1 - r0 < 2:
            return None

        sub = np.ascontiguousarray(selected.grid[r0:r1, c0:c1], dtype=np.float32)
        finite_vals = sub[np.isfinite(sub)]
        if finite_vals.size == 0:
            return None

        patch_meta = DemLayerMeta(
            id=f"{meta.id}-patch",
            siteId=meta.siteId,
            url="/api/terrain/patch",
            xMinM=meta.xMinM + c0 * meta.spacingM,
            yMaxM=meta.yMaxM - r0 * meta.spacingM,
            spacingM=meta.spacingM,
            rows=int(sub.shape[0]),
            cols=int(sub.shape[1]),
            minHeightM=float(np.min(finite_vals)),
            maxHeightM=float(np.max(finite_vals)),
            source=f"{meta.source} (cropped {radius_m:.0f} m patch)",
        )
        return patch_meta, sub.tobytes()
