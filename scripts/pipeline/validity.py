"""Offline, NumPy-only pilot input policy; no raster/network imports or side effects."""
from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np

POLICY_VERSION = "pilot-validity-v1"
MOON_RADIUS_M = 1_737_400.0
TERRAIN_HASH_POLICY = "pilot-terrain-f64be-sha256-v1"
HORIZON_METHOD = "spherical-raymarch-25m-4percent-v1"


def json_hash(value: object) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def terrain_content_hash(coverage: Mapping, layers: Sequence[Mapping],
                         actual_hashes: Sequence[str]) -> str:
    """Canonical dependency wire identity, using hashes of the actual served bytes.

    Producer metadata, names and URLs deliberately do not affect this identity.
    Declared hashes must still match the actual bytes before a generated pack can
    claim it. Float64 big-endian hex avoids cross-language JSON number spelling.
    """
    def number(value: object) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Terrain dependency geometry must be numeric")
        result = float(value)
        if not math.isfinite(result):
            raise ValueError("Terrain dependency geometry must be finite")
        return result

    def hex_number(value: object) -> str:
        return struct.pack(">d", number(value)).hex()

    def valid_sha(value: object) -> bool:
        return isinstance(value, str) and len(value) == 64 and all(
            char in "0123456789abcdef" for char in value
        )

    if not layers or len(layers) != len(actual_hashes):
        raise ValueError("Terrain dependency requires each priority-ordered layer")
    bounds = [number(coverage[key]) for key in ("southDeg", "northDeg", "westDegE", "eastDegE")]
    if not (-90 <= bounds[0] <= bounds[1] <= 90 and 0 <= bounds[2] <= bounds[3] <= 360):
        raise ValueError("Invalid generated terrain coverage")
    encoded_layers = []
    for layer, actual in zip(layers, actual_hashes):
        if not valid_sha(actual) or layer.get("sha256") != actual:
            raise ValueError("Terrain dependency requires matching actual layer SHA256")
        if number(layer["spacingM"]) <= 0:
            raise ValueError("Terrain dependency spacing must be positive")
        for key in ("rows", "cols"):
            count = number(layer[key])
            if count < 2 or not count.is_integer():
                raise ValueError("Terrain dependency rows/cols must be integers >= 2")
        encoded_layers.append([
            *[hex_number(layer[key]) for key in ("xMinM", "yMaxM", "spacingM", "rows", "cols")],
            actual,
        ])
    wire = [
        TERRAIN_HASH_POLICY, POLICY_VERSION, "R=1737400m",
        [hex_number(value) for value in bounds],
        encoded_layers,
    ]
    return json_hash(wire)


def require_terrain_dependency(record: Mapping, expected_hash: str) -> None:
    """A new generated pack cannot silently promote an unqualified legacy asset."""
    if not isinstance(record, Mapping) or record.get("terrainContentHashPolicy") != TERRAIN_HASH_POLICY:
        raise ValueError("Generated record requires supported terrainContentHashPolicy; legacy is not promoted")
    if record.get("terrainContentHash") != expected_hash:
        raise ValueError("Generated record terrain dependency does not match current DEM")


def array_hash(array: np.ndarray) -> str:
    """Hash canonical little-endian values, shape and dtype, including validity."""
    data = np.array(array, dtype=array.dtype.newbyteorder("<"), order="C", copy=True)
    if np.issubdtype(data.dtype, np.floating):
        data[np.isnan(data)] = np.nan  # Normalize NaN payloads, not missingness.
    digest = hashlib.sha256()
    digest.update(json.dumps([list(data.shape), data.dtype.str]).encode("ascii"))
    digest.update(data.tobytes())
    return digest.hexdigest()


def decode_heights(raw: np.ndarray, valid_mask: np.ndarray, *, nodata: float | None,
                   scale: float, offset: float) -> np.ndarray:
    """Mask raw-domain nodata before applying band scale and offset, in meters."""
    if raw.ndim != 2 or valid_mask.shape != raw.shape or not raw.size:
        raise ValueError("Expected nonempty 2D band and matching validity mask")
    if not math.isfinite(scale) or scale == 0 or not math.isfinite(offset):
        raise ValueError("Band scale/offset must be finite and scale nonzero")
    valid = (valid_mask != 0) & np.isfinite(raw)
    if nodata is not None:
        valid &= ~np.isnan(raw) if math.isnan(nodata) else raw != nodata
    with np.errstate(over="ignore", invalid="ignore"):
        physical = raw.astype(np.float64) * scale + offset
        physical = np.where(valid & np.isfinite(physical), physical, np.nan).astype("<f4")
    physical[~np.isfinite(physical)] = np.nan
    return physical


def downsample_block_mean(array: np.ndarray, factor: int) -> np.ndarray:
    """A mean is available only when every contributing source pixel is valid.

    Incomplete edge blocks are omitted (never padded), retaining the input origin.
    """
    if array.ndim != 2 or not isinstance(factor, int) or isinstance(factor, bool) or factor < 1:
        raise ValueError("Expected 2D grid and positive integer aggregation factor")
    h, w = array.shape
    ht, wt = (h // factor) * factor, (w // factor) * factor
    if ht == 0 or wt == 0:
        raise ValueError("Aggregation has no complete blocks")
    blocks = array[:ht, :wt].reshape(ht // factor, factor, wt // factor, factor)
    valid = np.all(np.isfinite(blocks), axis=(1, 3))
    totals = np.where(np.isfinite(blocks), blocks, 0.0).sum(axis=(1, 3), dtype=np.float64)
    return np.where(valid, totals / (factor * factor), np.nan).astype("<f4")


def validate_raster_policy(crs: Mapping[str, object], transform: Sequence[float], *,
                           expected_spacing_m: float, height_unit: str | None,
                           documented_height_unit: str = "m") -> dict:
    """Accept only the explicit PGDA lunar spherical south-polar grid policy.

    A matching projection is NOT evidence of a confirmed MOON_ME frame or vertical
    datum. Missing band units may use the declared PGDA product meter policy;
    conflicting metadata is rejected. No reprojection or datum inference occurs.
    """
    def number(key: str, default: float | None = None) -> float:
        value = crs.get(key, default)
        try:
            result = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Missing/invalid CRS parameter {key}") from exc
        if not math.isfinite(result):
            raise ValueError(f"Nonfinite CRS parameter {key}")
        return result

    if crs.get("proj") != "stere" or crs.get("units") != "m" or crs.get("axis", "enu") != "enu":
        raise ValueError("Only east/north meter-unit lunar south polar stereographic input is supported")
    if number("lat_0") != -90 or number("lon_0", 0) % 360 != 0:
        raise ValueError("Unsupported projection pole or central meridian")
    if number("x_0", 0) != 0 or number("y_0", 0) != 0:
        raise ValueError("False easting/northing must be zero")
    if number("k", number("k_0", 1)) != 1 or number("lat_ts", -90) != -90:
        raise ValueError("Unsupported stereographic scale/standard parallel")
    if "R" in crs:
        a = b = number("R")
    else:
        a, b = number("a"), number("b")
    if a != MOON_RADIUS_M or b != MOON_RADIUS_M:
        raise ValueError("Input must explicitly use the 1737400 m lunar sphere")
    if crs.get("pm", "greenwich") not in ("greenwich", 0, 0.0, "0"):
        raise ValueError("Unsupported prime meridian")
    if any(key in crs for key in ("towgs84", "nadgrids", "geoidgrids")):
        raise ValueError("Datum transformations are unsupported")
    if len(transform) != 6 or not all(math.isfinite(v) for v in transform):
        raise ValueError("Expected finite six-coefficient affine transform")
    a_px, b_px, _, d_px, e_px, _ = transform
    if not math.isfinite(expected_spacing_m) or expected_spacing_m <= 0:
        raise ValueError("Expected spacing must be positive")
    if b_px != 0 or d_px != 0 or a_px != expected_spacing_m or e_px != -expected_spacing_m:
        raise ValueError("Expected unrotated north-up square grid at the declared spacing")
    if documented_height_unit != "m" or height_unit not in (None, "", "m", "metre", "meter", "metres", "meters"):
        raise ValueError("Unsupported height units; PGDA height policy requires meters")
    return {
        "policyVersion": POLICY_VERSION,
        "crsParameters": dict(crs),
        "transform": list(transform),
        "heightUnit": "m",
        "heightUnitOrigin": "band-metadata" if height_unit else "documented-pgda-product-policy",
        "datumStatus": "conditional",
        "frameStatus": "conditional-no-frame-transformation",
        "aggregation": "complete-valid-blocks-only; incomplete-edge-blocks-trimmed",
        "invalidEncoding": "float32-NaN",
    }


def validity_summary(array: np.ndarray) -> dict:
    finite = np.isfinite(array)
    count = int(finite.sum())
    return {
        "validCellCount": count,
        "totalCellCount": int(array.size),
        "minHeightM": float(array[finite].min()) if count else None,
        "maxHeightM": float(array[finite].max()) if count else None,
    }


def observer_metadata(lat_deg: float, lon_deg_e: float, ground_m: float | None = None,
                      *, generated: bool = False) -> dict:
    if not math.isfinite(lat_deg) or not -90 < lat_deg < 90 or not math.isfinite(lon_deg_e):
        raise ValueError("Observer coordinates must be finite and non-polar")
    if generated and (ground_m is None or not math.isfinite(ground_m)):
        raise ValueError("Actual generation requires finite sampled ground")
    return {
        "latDeg": lat_deg,
        "lonDegE": lon_deg_e,
        "observerHeightM": 1,
        "groundHeightM": ground_m if generated else None,
        # Store exactly the altitude sent by the five-decimal Horizons query.
        "ellipsoidAltitudeKm": float(f"{(ground_m + 1.0) / 1000.0:.5f}") if generated else None,
        "datumStatus": "conditional",
        "metadataOrigin": "pipeline-record" if generated else "legacy-pipeline-height",
    }
