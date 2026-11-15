"""
Offline pipeline script for LunarSight Real Pilot Assets (Level A: Full Artemis South Pole Catalog).

Fetches and processes official NASA data for the full Artemis III candidate landing sites
plus high-resolution PGDA 78 sites:
  1. JPL Horizons topocentric ephemerides (3 months: 2027-01-01 to 2027-04-01 UTC);
     DEM-to-Horizons datum/MOON_ME reconciliation remains conditional.
  2. PGDA LOLA DEMs:
       - Regional 240 m/px (LDEM_60S_240MPP_ADJ.TIF) over [-384 km, +384 km] (~77.4°S–90°S),
         downsampled 2x to 480 m/px for compact web/backend delivery (coverage south of -78°).
       - Local 5 m/px (PGDA 78) or 10 m/px (PGDA 90 LDEM_83S_10MPP_ADJ.TIF) ->
         inner 2.5 km x 2.5 km high-res crop + 16 km+ x 16 km+ 40 m/px site tile.
  3. 360-degree true-North spherical ray-marched Horizon Masks (0–150 km) at [0, 0.25, 1, 2.5, 10] m AGL
     sampled from the served priority-ordered DEM mosaic (5/10 m -> 40 m -> 480 m).
     Missing ray samples fail explicitly; projection checks do not certify science.

Outputs:
  - Lightweight site catalog JSON -> web/src/data/pilot/sites.json
  - Legacy/generated observer registry -> web/src/data/pilot/observerMetadata.json
  - Per-site horizon & ephemeris JSONs + Float32 DEM grids + terrain_manifest.json -> web/public/data/pilot/
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import time
import numpy as np
if __package__:
    from .validity import (
        HORIZON_METHOD, POLICY_VERSION, TERRAIN_HASH_POLICY, array_hash, decode_heights,
        downsample_block_mean, file_hash, json_hash, observer_metadata,
        require_terrain_dependency, terrain_content_hash, validate_raster_policy, validity_summary,
    )
else:
    from validity import (
        HORIZON_METHOD, POLICY_VERSION, TERRAIN_HASH_POLICY, array_hash, decode_heights,
        downsample_block_mean, file_hash, json_hash, observer_metadata,
        require_terrain_dependency, terrain_content_hash, validate_raster_policy, validity_summary,
    )
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "6")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "3")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "60")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CATALOG_PATH = Path(__file__).resolve().parent / "sites_catalog.json"
CACHE_DIR = Path(__file__).resolve().parent / "cache"
SRC_DIR = REPO_ROOT / "web" / "src" / "data" / "pilot"
PUBLIC_DIR = REPO_ROOT / "web" / "public" / "data" / "pilot"

MOON_RADIUS_M = 1_737_400.0
DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi

PGDA_240M_HTTPS = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_60S_240MPP_ADJ.TIF"
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

REGIONAL_HALF_EXTENT_M = 384_000.0
COVERAGE_NORTH_DEG = -78.0

START_TIME = "2027-01-01 00:00"
STOP_TIME = "2027-04-01 00:00"
STEP_SIZE = "60 m"

OBSERVER_HEIGHTS_M = [0.0, 0.25, 1.0, 2.5, 10.0]
HORIZON_MAX_RANGE_M = 150_000.0


def _http_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=("GET",),
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def south_polar_forward(lat_deg: np.ndarray | float, lon_deg_e: np.ndarray | float):
    rho = 2.0 * MOON_RADIUS_M * np.tan(math.pi / 4.0 + np.asarray(lat_deg) * DEG_TO_RAD / 2.0)
    lon = np.asarray(lon_deg_e) * DEG_TO_RAD
    return rho * np.sin(lon), rho * np.cos(lon)


def sample_grid_bilinear(
    grid: np.ndarray, x_min: float, y_max: float, spacing: float, x: np.ndarray, y: np.ndarray
) -> np.ndarray:
    rows, cols = grid.shape
    fx = (x - x_min) / spacing - 0.5
    fy = (y_max - y) / spacing - 0.5
    in_bounds = (fx >= 0.0) & (fy >= 0.0) & (fx <= cols - 1) & (fy <= rows - 1)

    c0 = np.clip(np.floor(fx).astype(np.int64), 0, cols - 2)
    r0 = np.clip(np.floor(fy).astype(np.int64), 0, rows - 2)
    tx = fx - c0
    ty = fy - r0

    v00 = grid[r0, c0].astype(np.float64)
    v01 = grid[r0, c0 + 1].astype(np.float64)
    v10 = grid[r0 + 1, c0].astype(np.float64)
    v11 = grid[r0 + 1, c0 + 1].astype(np.float64)

    finite = np.isfinite(v00) & np.isfinite(v01) & np.isfinite(v10) & np.isfinite(v11)
    val = (1.0 - ty) * ((1.0 - tx) * v00 + tx * v01) + ty * ((1.0 - tx) * v10 + tx * v11)
    return np.where(in_bounds & finite, val, np.nan)




def fetch_horizons_series(
    session: requests.Session, target_id: str, lon_deg_e: float, lat_deg: float, alt_km: float
):
    params = horizons_query(target_id, lon_deg_e, lat_deg, alt_km)
    resp = session.get(HORIZONS_URL, params=params, timeout=60)
    resp.raise_for_status()
    response = resp.json()
    raw = response.get("result")
    if not isinstance(raw, str) or response.get("error"):
        raise ValueError(f"Horizons returned no usable result for target {target_id}")
    soe = raw.find("$$SOE")
    eoe = raw.find("$$EOE")
    if soe == -1 or eoe <= soe:
        raise ValueError(f"Horizons $$SOE/$$EOE missing for target {target_id}: {raw[:400]}")

    times_ms = []
    az_deg = []
    el_deg = []
    for line in raw[soe + 5 : eoe].strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 5:
            raise ValueError(f"Malformed Horizons row for target {target_id}")
        dt = datetime.strptime(parts[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        az, el = float(parts[3]), float(parts[4])
        if not math.isfinite(az) or not math.isfinite(el) or not 0 <= az <= 360 or not -90 <= el <= 90:
            raise ValueError(f"Invalid Horizons angles for target {target_id}")
        times_ms.append(int(dt.timestamp() * 1000))
        az_deg.append(round(az, 4))
        el_deg.append(round(el, 4))
    expected_start = int(datetime.strptime(START_TIME, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() * 1000)
    expected_stop = int(datetime.strptime(STOP_TIME, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() * 1000)
    if times_ms != list(range(expected_start, expected_stop + 1, 3_600_000)):
        raise ValueError(f"Horizons response does not cover the requested hourly grid for {target_id}")
    identity = {
        "query": params,
        "queryHash": json_hash({"url": HORIZONS_URL, "params": params}),
        "responseHash": json_hash(response),
    }
    return times_ms, az_deg, el_deg, identity


def horizons_query(target_id: str, lon_deg_e: float, lat_deg: float, alt_km: float) -> dict:
    return {
        "format": "json",
        "COMMAND": target_id,
        "OBJ_DATA": "NO",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "CENTER": "coord@301",
        "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"{lon_deg_e:.6f},{lat_deg:.6f},{alt_km:.5f}",
        "START_TIME": START_TIME,
        "STOP_TIME": STOP_TIME,
        "STEP_SIZE": STEP_SIZE,
        "QUANTITIES": "4",
        "CSV_FORMAT": "YES",
    }


def sample_mosaic_bilinear(
    mosaic_layers: list[tuple[dict, np.ndarray]],
    x_m: np.ndarray,
    y_m: np.ndarray,
) -> np.ndarray:
    """Hierarchical bilinear sampling matching TerrainService.height_array layer priority."""
    result = np.full(x_m.shape, np.nan, dtype=np.float64)
    x_min_q = float(np.min(x_m))
    x_max_q = float(np.max(x_m))
    y_min_q = float(np.min(y_m))
    y_max_q = float(np.max(y_m))

    for meta, grid in mosaic_layers:
        missing = np.isnan(result)
        if not np.any(missing):
            break
        lx0 = meta["xMinM"]
        lx1 = lx0 + meta["cols"] * meta["spacingM"]
        ly1 = meta["yMaxM"]
        ly0 = ly1 - meta["rows"] * meta["spacingM"]
        if lx1 < x_min_q or lx0 > x_max_q or ly1 < y_min_q or ly0 > y_max_q:
            continue
        sampled = sample_grid_bilinear(
            grid, meta["xMinM"], meta["yMaxM"], meta["spacingM"], x_m[missing], y_m[missing]
        )
        result[missing] = sampled
    return result


def compute_horizon_masks(
    lat_deg: float,
    lon_deg_e: float,
    ground_m: float,
    mosaic_layers: list[tuple[dict, np.ndarray]],
) -> dict[str, list[float]]:
    """Spherical ray-march over served DEM mosaic (true ENU North, 25 m -> +4% step to 150 km)."""
    edge_distance_m = (COVERAGE_NORTH_DEG - lat_deg) * DEG_TO_RAD * MOON_RADIUS_M
    max_range_m = min(HORIZON_MAX_RANGE_M, edge_distance_m * (1.0 - 1e-10))

    distances = []
    d = 25.0
    while True:
        distances.append(d)
        if d >= max_range_m:
            break
        d = min(max_range_m, d + max(25.0, d * 0.04))
    dist_arr = np.asarray(distances, dtype=np.float64)[None, :]  # (1, D)

    az_arr = np.arange(360, dtype=np.float64)[:, None] * DEG_TO_RAD  # (360, 1)
    lat_rad = lat_deg * DEG_TO_RAD
    lon_rad = lon_deg_e * DEG_TO_RAD
    sin_lat, cos_lat = math.sin(lat_rad), math.cos(lat_rad)

    ang = dist_arr / MOON_RADIUS_M
    sin_ang, cos_ang = np.sin(ang), np.cos(ang)
    cos_b, sin_b = np.cos(az_arr), np.sin(az_arr)

    target_lat = np.arcsin(np.clip(sin_lat * cos_ang + cos_lat * sin_ang * cos_b, -1.0, 1.0))
    target_lon = lon_rad + np.arctan2(sin_b * sin_ang * cos_lat, cos_ang - sin_lat * np.sin(target_lat))

    x_m, y_m = south_polar_forward(target_lat * RAD_TO_DEG, target_lon * RAD_TO_DEG)
    heights = sample_mosaic_bilinear(mosaic_layers, x_m, y_m)

    if np.any(np.isnan(heights)):
        missing = int(np.sum(np.isnan(heights)))
        raise ValueError(f"Horizon ray-marching encountered {missing} NaN cells")

    curvature = (dist_arr * dist_arr) / (2.0 * MOON_RADIUS_M)
    result = {}
    for h_obs in OBSERVER_HEIGHTS_M:
        delta = heights - ground_m - h_obs
        el = np.arctan2(delta - curvature, dist_arr) * RAD_TO_DEG
        max_el = np.max(el, axis=1)
        key = str(int(h_obs)) if float(h_obs).is_integer() else str(h_obs)
        result[key] = [round(float(v), 4) for v in max_el]
    return result


def write_json(path: Path, data, compact: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        if compact:
            json.dump(data, f, separators=(",", ":"), allow_nan=False)
        else:
            json.dump(data, f, indent=2, allow_nan=False)


def _download_file(session: requests.Session, url: str, dest: Path) -> Path:
    tmp = dest.with_suffix(dest.suffix + ".part")
    with session.get(url, stream=True, timeout=240) as resp:
        resp.raise_for_status()
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    fh.write(chunk)
    tmp.replace(dest)
    return dest


def read_dem(path: str | Path, source_url: str, spacing_m: float,
             bounds: tuple[float, float, float, float] | None = None) -> tuple[np.ndarray, dict]:
    """The sole raster boundary: explicit PGDA policy, masks, scaling and identity."""
    import rasterio
    from rasterio.windows import from_bounds

    with rasterio.open(path) as src:
        if src.count != 1 or src.crs is None:
            raise ValueError("Expected single-band DEM with explicit CRS")
        crs = src.crs.to_dict()
        policy = validate_raster_policy(
            crs, tuple(src.transform)[:6], expected_spacing_m=spacing_m, height_unit=src.units[0],
        )
        win = None if bounds is None else from_bounds(*bounds, src.transform).round_offsets().round_lengths()
        if win is not None and (
            win.col_off < 0 or win.row_off < 0 or win.width < 1 or win.height < 1
            or win.col_off + win.width > src.width or win.row_off + win.height > src.height
        ):
            raise ValueError("Requested DEM window is outside source coverage")
        transform = src.transform if win is None else src.window_transform(win)
        raw = src.read(1, window=win)
        mask = src.read_masks(1, window=win)
        nodata, scale, offset = src.nodatavals[0], src.scales[0], src.offsets[0]
        grid = decode_heights(raw, mask, nodata=nodata, scale=scale, offset=offset)
        policy["sourceCrsWkt"] = src.crs.to_wkt()
        policy["sourceTransform"] = policy["transform"]
        policy["transform"] = list(tuple(transform)[:6])
        policy["scale"] = scale
        policy["offset"] = offset
        policy["nodata"] = nodata if nodata is None or math.isfinite(nodata) else str(nodata)
        policy["maskFlags"] = [flag.name for flag in src.mask_flag_enums[0]]
        query = {
            "sourceUrl": source_url, "band": 1,
            "requestedBoundsM": list(bounds) if bounds else None,
            "window": [win.col_off, win.row_off, win.width, win.height] if win else [0, 0, src.width, src.height],
            "transform": policy["transform"], "shape": list(grid.shape),
        }
    source = {
        "url": source_url,
        "fileSha256": file_hash(Path(path)) if isinstance(path, Path) else None,
        "checksumScope": "local-source-file" if isinstance(path, Path) else "queried-window-only",
        "rawWindowHash": array_hash(raw),
        "maskHash": array_hash(mask),
    }
    provenance = {
        "policy": policy, "source": source, "query": query,
        "sourceHash": json_hash(source), "queryHash": json_hash(query),
        "inputHash": json_hash({"source": source, "query": query, "policy": policy}),
        "decodedContentHash": array_hash(grid),
    }
    return grid, {
        "xMinM": float(transform.c), "yMaxM": float(transform.f), "spacingM": spacing_m,
        "rows": int(grid.shape[0]), "cols": int(grid.shape[1]), "inputProvenance": provenance,
    }


def require_current_layer(meta: dict) -> str:
    provenance = meta.get("inputProvenance", {})
    if provenance.get("policy", {}).get("policyVersion") != POLICY_VERSION:
        raise ValueError(f"Legacy DEM {meta.get('id')} has no validity provenance; regenerate it from source")
    path = PUBLIC_DIR / Path(meta["url"]).name
    actual_hash = file_hash(path)
    if meta.get("sha256") != actual_hash:
        raise ValueError(f"DEM bytes no longer match recorded content for {meta.get('id')}; regenerate it")
    return actual_hash


def load_or_fetch_regional_480m(session: requests.Session, rebuild: bool) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    sp_480_path = PUBLIC_DIR / "terrain_south_pole_480m.bin"
    metadata_path = CACHE_DIR / "regional_480m_metadata.json"
    if sp_480_path.exists() and not rebuild:
        if not metadata_path.exists():
            raise ValueError("Legacy regional DEM lacks validity provenance; explicitly use --rebuild-regional")
        meta = json.loads(metadata_path.read_text(encoding="utf-8"))
        require_current_layer(meta)
        return meta
    tif240 = CACHE_DIR / "LDEM_60S_240MPP_ADJ.TIF"
    if not tif240.exists() or rebuild:
        _download_file(session, PGDA_240M_HTTPS, tif240)
    far_grid, near_meta = read_dem(
        tif240, PGDA_240M_HTTPS, 240.0,
        (-REGIONAL_HALF_EXTENT_M, -REGIONAL_HALF_EXTENT_M, REGIONAL_HALF_EXTENT_M, REGIONAL_HALF_EXTENT_M),
    )
    sp_480 = downsample_block_mean(far_grid, 2)
    sp_480.tofile(sp_480_path)
    meta = layer_metadata_from_bin(
        "south-pole-480m", None, sp_480_path.name, near_meta["xMinM"], near_meta["yMaxM"],
        480.0, sp_480.shape[0], sp_480.shape[1], sp_480,
        "PGDA 90 LDEM_60S_240MPP_ADJ (complete-valid 2x blocks)", near_meta["inputProvenance"],
    )
    write_json(metadata_path, meta)
    return meta


def load_site_near_dem(session: requests.Session, site: dict, sx: float, sy: float) -> tuple[np.ndarray, dict, float]:
    if site["demType"] == "pgda_5m":
        tif_cache = CACHE_DIR / f"{site['slug']}_5mpp_surf.tif"
        if not tif_cache.exists():
            _download_file(session, site["pgdaUrl"], tif_cache)
        grid, meta = read_dem(tif_cache, site["pgdaUrl"], 5.0)
        return grid, meta, 5.0
    if site["demType"] == "pgda_10m":
        # Do not reuse historical unmasked .npz caches as qualified observations.
        grid, meta = read_dem(site["pgdaUrl"], site["pgdaUrl"], 10.0,
                              (sx - 8_000.0, sy - 8_000.0, sx + 8_000.0, sy + 8_000.0))
        return grid, meta, 10.0
    raise ValueError(f"Unsupported demType: {site['demType']}")


def layer_metadata_from_bin(
    layer_id: str,
    site_id: str | None,
    bin_name: str,
    x_min_m: float,
    y_max_m: float,
    spacing_m: float,
    rows: int,
    cols: int,
    arr: np.ndarray,
    source: str,
    input_provenance: dict,
) -> dict:
    return {
        "id": layer_id,
        "siteId": site_id,
        "url": f"/data/pilot/{bin_name}",
        "xMinM": float(x_min_m),
        "yMaxM": float(y_max_m),
        "spacingM": float(spacing_m),
        "rows": int(rows),
        "cols": int(cols),
        **validity_summary(arr),
        "source": source,
        "inputProvenance": input_provenance,
        "method": POLICY_VERSION,
        "sha256": file_hash(PUBLIC_DIR / bin_name),
        "queryHash": json_hash({
            "inputQueryHash": input_provenance["queryHash"], "xMinM": x_min_m, "yMaxM": y_max_m,
            "spacingM": spacing_m, "rows": rows, "cols": cols, "aggregation": "complete-valid-blocks-only",
        }),
    }


def load_served_mosaic(ordered_layers: list[dict]) -> list[tuple[dict, np.ndarray]]:
    mosaic: list[tuple[dict, np.ndarray]] = []
    for meta in ordered_layers:
        require_current_layer(meta)
        bin_path = PUBLIC_DIR / Path(meta["url"]).name
        arr = np.fromfile(bin_path, dtype="<f4").reshape(meta["rows"], meta["cols"])
        mosaic.append((meta, arr))
    return mosaic


def current_ground(site: dict, mosaic_layers: list[tuple[dict, np.ndarray]]) -> float:
    sx, sy = south_polar_forward(site["latDeg"], site["lonDegE"])
    ground = float(sample_mosaic_bilinear(mosaic_layers, np.array([float(sx)]), np.array([float(sy)]))[0])
    if not math.isfinite(ground):
        raise ValueError(f"Ground elevation is unavailable at {site['id']}")
    return ground


def horizon_query_identity(site: dict, ground_m: float, terrain_identity: str) -> dict:
    return {
        "latDeg": site["latDeg"], "lonDegE": site["lonDegE"], "groundHeightM": ground_m,
        "observerHeightsM": OBSERVER_HEIGHTS_M, "maxRangeM": HORIZON_MAX_RANGE_M,
        "method": HORIZON_METHOD, "terrainContentHashPolicy": TERRAIN_HASH_POLICY,
        "terrainContentHash": terrain_identity,
    }


def require_fields(record: object, expected: dict, label: str) -> None:
    if not isinstance(record, dict) or any(key not in record or record[key] != value for key, value in expected.items()):
        raise ValueError(f"{label} does not match current generated inputs")


def validate_horizon_record(record: dict, site: dict, ground_m: float, terrain_identity: str) -> None:
    require_terrain_dependency(record, terrain_identity)
    require_fields(record, {
        "siteId": site["id"], "horizonMethod": HORIZON_METHOD,
        "maxRangeM": HORIZON_MAX_RANGE_M, "azimuthsDeg": list(range(360)),
        "queryHash": json_hash(horizon_query_identity(site, ground_m, terrain_identity)),
    }, "Horizon method/query")
    require_fields(record.get("observer"), {
        "latDeg": site["latDeg"], "lonDegE": site["lonDegE"],
        "groundHeightM": ground_m, "observerHeightsM": OBSERVER_HEIGHTS_M,
        "datumStatus": "conditional", "metadataOrigin": "pipeline-record",
    }, "Horizon observer")
    heights = record.get("heights")
    expected_keys = {str(int(h)) if float(h).is_integer() else str(h) for h in OBSERVER_HEIGHTS_M}
    if not isinstance(heights, dict) or set(heights) != expected_keys:
        raise ValueError("Horizon height set does not match generated query")
    for values in heights.values():
        if not isinstance(values, list) or len(values) != 360 or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not -90 <= v <= 90
            for v in values
        ):
            raise ValueError("Horizon must contain 360 finite angular samples per height")
    if record.get("contentHash") != json_hash(heights):
        raise ValueError("Horizon contentHash does not match its samples")


def ephemeris_content_hash(record: dict) -> str:
    return json_hash({key: record[key] for key in (
        "observer", "timesUtcMs", "sunAzDeg", "sunElDeg", "earthAzDeg", "earthElDeg", "queryHash",
    )})


def validate_ephemeris_record(record: dict, registry_observer: object, site: dict,
                              ground_m: float, terrain_identity: str) -> None:
    require_terrain_dependency(record, terrain_identity)
    expected_observer = observer_metadata(site["latDeg"], site["lonDegE"], ground_m, generated=True)
    require_fields(record.get("observer"), expected_observer, "Ephemeris observer/ground/transmitted altitude")
    require_fields(registry_observer, expected_observer, "Observer registry")
    require_fields(record, {"siteId": site["id"], "frame": "MOON_ME", "stepSeconds": 3600}, "Ephemeris settings")
    identities = record.get("queries")
    if not isinstance(identities, dict):
        raise ValueError("Generated ephemeris requires recorded queries")
    query_hashes, response_hashes = [], []
    for body, target in (("sun", "10"), ("earth", "399")):
        query = horizons_query(target, site["lonDegE"], site["latDeg"], expected_observer["ellipsoidAltitudeKm"])
        query_hash = json_hash({"url": HORIZONS_URL, "params": query})
        identity = identities.get(body)
        require_fields(identity, {"query": query, "queryHash": query_hash}, f"Ephemeris {body} query")
        response_hash = identity.get("responseHash")
        if not isinstance(response_hash, str) or len(response_hash) != 64 or any(
            char not in "0123456789abcdef" for char in response_hash
        ):
            raise ValueError(f"Ephemeris {body} response hash is missing/invalid")
        query_hashes.append(query_hash)
        response_hashes.append(response_hash)
    require_fields(record, {
        "queryHash": json_hash(query_hashes),
        "sourceHash": json_hash({"sunResponseHash": response_hashes[0], "earthResponseHash": response_hashes[1]}),
    }, "Ephemeris query/source identity")
    start = int(datetime.strptime(START_TIME, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() * 1000)
    stop = int(datetime.strptime(STOP_TIME, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc).timestamp() * 1000)
    times = list(range(start, stop + 1, 3_600_000))
    require_fields(record, {"startUtcMs": start, "timesUtcMs": times}, "Ephemeris time grid")
    for key, lower, upper in (
        ("sunAzDeg", 0, 360), ("sunElDeg", -90, 90), ("earthAzDeg", 0, 360), ("earthElDeg", -90, 90),
    ):
        values = record.get(key)
        if not isinstance(values, list) or len(values) != len(times) or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lower <= v <= upper
            for v in values
        ):
            raise ValueError(f"Ephemeris {key} does not cover the generated time grid with valid angles")
    if record.get("contentHash") != ephemeris_content_hash(record):
        raise ValueError("Ephemeris contentHash does not match its samples/observer")


def retained_site_records(site: dict, ground_m: float, terrain_identity: str, registry_observer: object,
                          *, targeted: bool, skip_existing: bool, recompute_horizons: bool
                          ) -> tuple[dict | None, dict | None]:
    """Preflight retained records before offline computation or any upstream call.

    None explicitly requests generation. Incompatible targeted horizons may be
    recomputed offline; incompatible celestial records in reuse modes must fail.
    Non-target and legacy records cannot be silently promoted into the new pack.
    """
    sid = site["id"]
    ephem_path = PUBLIC_DIR / f"ephemeris_{sid}.json"
    horizon_path = PUBLIC_DIR / f"horizon_{sid}.json"
    reuse_ephemeris = not targeted or skip_existing or recompute_horizons
    ephemeris = None
    if reuse_ephemeris:
        if ephem_path.exists():
            try:
                ephemeris = json.loads(ephem_path.read_text(encoding="utf-8"))
                validate_ephemeris_record(ephemeris, registry_observer, site, ground_m, terrain_identity)
            except (ValueError, TypeError, KeyError, AttributeError) as exc:
                raise ValueError(
                    f"Cached ephemeris for {sid} is incompatible: {exc}. "
                    "No upstream query was made; explicitly regenerate without reuse flags."
                ) from exc
        elif not targeted or recompute_horizons:
            raise ValueError(f"Missing retained ephemeris for {sid}; no upstream query is allowed in this mode")
    horizon = None
    if not targeted or (skip_existing and not recompute_horizons):
        try:
            horizon = json.loads(horizon_path.read_text(encoding="utf-8"))
            validate_horizon_record(horizon, site, ground_m, terrain_identity)
        except (FileNotFoundError, ValueError, TypeError, KeyError, AttributeError) as exc:
            if not targeted:
                raise ValueError(f"Non-target horizon for {sid} is incompatible: {exc}") from exc
            horizon = None
    return horizon, ephemeris


def publish_generated_pack(manifest: dict, catalog: list[dict], mosaic_layers: list[tuple[dict, np.ndarray]],
                           registry: dict, horizons: dict[str, dict], ephemerides: dict[str, dict],
                           sites_catalog: list[dict]) -> None:
    """Validate every dependent record before publishing the generated manifest."""
    actual_hashes = [require_current_layer(layer) for layer in manifest["layers"]]
    identity = terrain_content_hash(manifest["coverage"], manifest["layers"], actual_hashes)
    require_terrain_dependency(manifest, identity)
    declared_method = manifest.get("provenance", {}).get("method")
    if declared_method is not None and declared_method != POLICY_VERSION:
        raise ValueError("Generated terrain validity method conflicts with the dependency policy")
    for site in catalog:
        sid = site["id"]
        ground_m = current_ground(site, mosaic_layers)
        validate_horizon_record(horizons[sid], site, ground_m, identity)
        validate_ephemeris_record(ephemerides[sid], registry["sites"].get(sid), site, ground_m, identity)
    for site in catalog:
        sid = site["id"]
        write_json(PUBLIC_DIR / f"horizon_{sid}.json", horizons[sid], compact=True)
        write_json(PUBLIC_DIR / f"ephemeris_{sid}.json", ephemerides[sid], compact=True)
    write_json(SRC_DIR / "observerMetadata.json", registry)
    write_json(SRC_DIR / "sites.json", sites_catalog)
    # This is a bounded publication ordering rule, not a transactional datastore.
    write_json(PUBLIC_DIR / "terrain_manifest.json", manifest)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild-regional", action="store_true")
    parser.add_argument("--skip-existing", action="store_true", help="Reuse only dependency/observer/query-compatible generated outputs")
    parser.add_argument(
        "--recompute-horizons",
        action="store_true",
        help="Recompute horizon masks directly from served DEM .bin mosaic (reuses existing DEM bins and ephemeris JSONs)",
    )
    parser.add_argument("--sites", nargs="*", help="Optional subset of site IDs to process (all sites remain in manifest/catalog)")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    target_ids = set(args.sites) if args.sites else None
    if target_ids is not None and not target_ids <= {site["id"] for site in catalog}:
        raise ValueError("Requested site IDs are not in the canonical catalog")

    SRC_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Clean obsolete legacy files moved from src -> public or replaced by 480 m regional grid
    for stale in [
        SRC_DIR / "ephemeris_site01.json",
        SRC_DIR / "ephemeris_site04.json",
        SRC_DIR / "horizon_site01.json",
        SRC_DIR / "horizon_site04.json",
        PUBLIC_DIR / "terrain_south_pole_320m.bin",
    ]:
        if stale.exists():
            stale.unlink()

    session = _http_session()
    sp_480_layer = load_or_fetch_regional_480m(session, args.rebuild_regional)

    manifest_index_path = CACHE_DIR / "site_layers_index.json"
    site_layers_by_id: dict[str, list[dict]] = (
        json.loads(manifest_index_path.read_text(encoding="utf-8")) if manifest_index_path.exists() else {}
    )
    sites_catalog = []

    for site in catalog:
        sid = site["id"]
        slug = site["slug"]
        spacing_native = 5.0 if site["demType"] == "pgda_5m" else 10.0
        res_tag = "5m" if spacing_native == 5.0 else "10m"
        crop_name = f"terrain_{slug}_{res_tag}.bin"
        grid40_name = f"terrain_{slug}_40m.bin"

        sites_catalog.append(
            {
                "id": sid,
                "name": site["name"],
                "category": site["category"],
                "latDeg": site["latDeg"],
                "lonDegE": site["lonDegE"],
                "nameVerified": False,
                "nameStatus": "source-derived",
                "coordinateStatus": site.get("coordinateStatus", "retained-application-observer"),
                "description": site["description"],
                "provenance": {
                    "kind": "processed",
                    "source": f"NASA Artemis Candidate Landing Sites / {site['pgdaSourceLabel']}",
                    "version": "pilot-v2",
                    "generatedAt": now_iso,
                    "notes": f"{site['description']} Source-derived label, not landing-coordinate validation. Datum/frame reconciliation remains conditional.",
                },
            }
        )

        bins_ready = (PUBLIC_DIR / crop_name).exists() and (PUBLIC_DIR / grid40_name).exists() and sid in site_layers_by_id
        if target_ids is not None and sid not in target_ids:
            continue
        if (args.skip_existing or args.recompute_horizons) and bins_ready:
            continue
        if args.recompute_horizons:
            raise ValueError(f"Missing retained DEM bins for {sid}; --recompute-horizons cannot acquire raster data")

        print(f"2/4 Building local DEM bins for {sid} ({site['name']})...", flush=True)
        sx, sy = south_polar_forward(site["latDeg"], site["lonDegE"])
        near_grid, near_meta, native_spacing = load_site_near_dem(session, site, float(sx), float(sy))

        # Save inner 2.5 km x 2.5 km high-res crop (501x501 @ 5m or 251x251 @ 10m)
        half_m = 1252.5 if native_spacing == 5.0 else 1255.0
        target_px = 501 if native_spacing == 5.0 else 251
        col0 = max(0, int(math.floor((float(sx) - half_m - near_meta["xMinM"]) / native_spacing)))
        row0 = max(0, int(math.floor((near_meta["yMaxM"] - (float(sy) + half_m)) / native_spacing)))
        col1 = min(near_meta["cols"], col0 + target_px)
        row1 = min(near_meta["rows"], row0 + target_px)
        crop_arr = near_grid[row0:row1, col0:col1].astype(np.float32)
        crop_arr.tofile(PUBLIC_DIR / crop_name)
        crop_meta = layer_metadata_from_bin(
            f"{slug}-{res_tag}",
            sid,
            crop_name,
            near_meta["xMinM"] + col0 * native_spacing,
            near_meta["yMaxM"] - row0 * native_spacing,
            native_spacing,
            crop_arr.shape[0],
            crop_arr.shape[1],
            crop_arr,
            site["pgdaSourceLabel"],
            near_meta["inputProvenance"],
        )

        # Save 40 m/px tile covering the full near-field tile
        factor_40 = 8 if native_spacing == 5.0 else 4
        grid40 = downsample_block_mean(near_grid, factor_40)
        grid40.tofile(PUBLIC_DIR / grid40_name)
        grid40_meta = layer_metadata_from_bin(
            f"{slug}-40m",
            sid,
            grid40_name,
            near_meta["xMinM"],
            near_meta["yMaxM"],
            40.0,
            grid40.shape[0],
            grid40.shape[1],
            grid40,
            f"{site['pgdaSourceLabel']} (downsampled {factor_40}x to 40 m/px)",
            near_meta["inputProvenance"],
        )
        print(f"   -> Saved {crop_name} {crop_arr.shape} and {grid40_name} {grid40.shape}", flush=True)

        site_layers_by_id[sid] = [crop_meta, grid40_meta]
        write_json(manifest_index_path, site_layers_by_id, compact=False)

    print("3/4 Preparing generated terrain manifest (publication deferred)...", flush=True)

    all_local_layers = []
    for site in catalog:
        all_local_layers.extend(site_layers_by_id.get(site["id"], []))

    # Layer lookup priority: finest grid spacing first -> regional 480 m grid last
    ordered_layers = sorted(all_local_layers, key=lambda l: (l["spacingM"], l["id"])) + [sp_480_layer]
    # Cached historical metadata is never promoted to the new validity contract.
    actual_hashes = [require_current_layer(layer) for layer in ordered_layers]
    metadata_identity = json_hash({"method": POLICY_VERSION, "layers": ordered_layers})
    manifest = {
        "version": "pilot-v2",
        "coverage": {
            "southDeg": -90.0,
            "northDeg": COVERAGE_NORTH_DEG,
            "westDegE": 0.0,
            "eastDegE": 360.0,
        },
        "provenance": {
            "kind": "processed",
            "source": "NASA PGDA 78 (5 m local) + PGDA 90 LDEM_83S_10MPP_ADJ (10 m) + LDEM_60S_240MPP_ADJ (480 m regional)",
            "version": "pilot-v2",
            "generatedAt": now_iso,
            "notes": "PGDA lunar spherical south-polar grid (R = 1,737,400 m); projection checked, vertical datum and MOON_ME reconciliation conditional.",
            "contentHash": metadata_identity,
            "method": POLICY_VERSION,
        },
        "layers": ordered_layers,
    }
    terrain_identity = terrain_content_hash(manifest["coverage"], ordered_layers, actual_hashes)
    manifest["terrainContentHashPolicy"] = TERRAIN_HASH_POLICY
    manifest["terrainContentHash"] = terrain_identity

    print("4/4 Generating horizon masks & ephemerides from served DEM mosaic...", flush=True)
    mosaic_layers = load_served_mosaic(ordered_layers)
    registry_path = SRC_DIR / "observerMetadata.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8")) if registry_path.exists() else {
        "version": "pilot-observer-metadata-v1",
        "sites": {site["id"]: observer_metadata(site["latDeg"], site["lonDegE"]) for site in catalog},
    }
    if not isinstance(registry, dict) or not isinstance(registry.get("sites"), dict):
        raise ValueError("Observer registry must contain a sites mapping")

    # Check *all* retained dependencies before any recomputation or upstream call.
    # A subset run must not publish a new manifest over incompatible other sites.
    planned: dict[str, tuple[float, dict | None, dict | None]] = {}
    for site in catalog:
        ground_m = current_ground(site, mosaic_layers)
        horizon_doc, ephem_doc = retained_site_records(
            site, ground_m, terrain_identity, registry["sites"].get(site["id"]),
            targeted=target_ids is None or site["id"] in target_ids,
            skip_existing=args.skip_existing, recompute_horizons=args.recompute_horizons,
        )
        planned[site["id"]] = (ground_m, horizon_doc, ephem_doc)
    horizons: dict[str, dict] = {}
    ephemerides: dict[str, dict] = {}

    for site in catalog:
        sid = site["id"]
        ground_m, horizon_doc, ephem_doc = planned[sid]
        if horizon_doc is None:
            heights_dict = compute_horizon_masks(
                site["latDeg"],
                site["lonDegE"],
                ground_m,
                mosaic_layers,
            )
            horizon_doc = {
                "siteId": sid,
                "azimuthsDeg": list(range(360)),
                "maxRangeM": int(HORIZON_MAX_RANGE_M),
                "heights": heights_dict,
                "observer": {
                    "latDeg": site["latDeg"], "lonDegE": site["lonDegE"],
                    "groundHeightM": ground_m, "observerHeightsM": OBSERVER_HEIGHTS_M,
                    "datumStatus": "conditional", "metadataOrigin": "pipeline-record",
                },
                "terrainContentHashPolicy": TERRAIN_HASH_POLICY,
                "terrainContentHash": terrain_identity,
                "horizonMethod": HORIZON_METHOD,
                "queryHash": json_hash(horizon_query_identity(site, ground_m, terrain_identity)),
                "provenance": {
                    "kind": "processed",
                    "source": f"{site['pgdaSourceLabel']} + PGDA 90 480 m/px mosaic (0–150 km)",
                    "version": "pilot-v2",
                    "generatedAt": now_iso,
                    "notes": "360-degree true local ENU North spherical ray-marched horizon mask up to 150 km over served DEM mosaic; precomputed at 0, 0.25, 1, 2.5, 10 m AGL.",
                },
            }
            horizon_doc["contentHash"] = json_hash(horizon_doc["heights"])
            print(f"   -> Prepared horizon for {sid} (ground={ground_m:.3f} m)", flush=True)

        if ephem_doc is None:
            observer = observer_metadata(site["latDeg"], site["lonDegE"], ground_m, generated=True)
            alt_km = observer["ellipsoidAltitudeKm"]
            print(f"   -> Fetching 3-month JPL Horizons ephemeris for {sid}...", flush=True)
            t_sun, s_az, s_el, sun_identity = fetch_horizons_series(session, "10", site["lonDegE"], site["latDeg"], alt_km)
            time.sleep(0.3)
            t_earth, e_az, e_el, earth_identity = fetch_horizons_series(session, "399", site["lonDegE"], site["latDeg"], alt_km)
            if t_sun != t_earth:
                raise ValueError(f"Timestamps differ for {sid}")
            step_sec = int((t_sun[1] - t_sun[0]) / 1000)
            ephem_doc = {
                "siteId": sid,
                "frame": "MOON_ME",
                "startUtcMs": t_sun[0],
                "stepSeconds": step_sec,
                "timesUtcMs": t_sun,
                "sunAzDeg": s_az,
                "sunElDeg": s_el,
                "earthAzDeg": e_az,
                "earthElDeg": e_el,
                "observer": observer,
                "queries": {"sun": sun_identity, "earth": earth_identity},
                "queryHash": json_hash([sun_identity["queryHash"], earth_identity["queryHash"]]),
                "sourceHash": json_hash({
                    "sunResponseHash": sun_identity["responseHash"],
                    "earthResponseHash": earth_identity["responseHash"],
                }),
                "terrainContentHashPolicy": TERRAIN_HASH_POLICY,
                "terrainContentHash": terrain_identity,
                "provenance": {
                    "kind": "processed",
                    "source": "NASA/JPL Horizons API (actual request/response hashes recorded)",
                    "version": "pilot-v2",
                    "generatedAt": now_iso,
                    "notes": f"Hourly apparent azimuth/elevation for retained observer at {site['name']}; 1 m AGL. DEM-to-Horizons datum/MOON_ME relationship is conditional, not independently validated.",
                },
            }
            ephem_doc["contentHash"] = ephemeris_content_hash(ephem_doc)
            registry["sites"][sid] = observer
            print(f"   -> Prepared ephemeris for {sid} ({len(t_sun)} samples)", flush=True)
        horizons[sid] = horizon_doc
        ephemerides[sid] = ephem_doc

    publish_generated_pack(manifest, catalog, mosaic_layers, registry, horizons, ephemerides, sites_catalog)

    print(f"All pilot assets generated successfully! ({len(sites_catalog)} sites, {len(ordered_layers)} DEM layers)", flush=True)


if __name__ == "__main__":
    main()
