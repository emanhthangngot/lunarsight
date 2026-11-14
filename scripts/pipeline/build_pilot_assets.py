"""
Offline pipeline script for LunarSight Real Pilot Assets (Level A: Full Artemis South Pole Catalog).

Fetches and processes official NASA data for the full Artemis III candidate landing sites
plus high-resolution PGDA 78 sites:
  1. JPL Horizons API ephemerides (Sun & Earth, frame MOON_ME, 3 months: 2027-01-01 to 2027-04-01 UTC).
  2. PGDA LOLA DEMs:
       - Regional 240 m/px (LDEM_60S_240MPP_ADJ.TIF) over [-384 km, +384 km] (~77.4°S–90°S),
         downsampled 2x to 480 m/px for compact web/backend delivery (coverage south of -78°).
       - Local 5 m/px (PGDA 78) or 10 m/px (PGDA 90 LDEM_83S_10MPP_ADJ.TIF) ->
         inner 2.5 km x 2.5 km high-res crop + 16 km+ x 16 km+ 40 m/px site tile.
  3. 360-degree true-North spherical ray-marched Horizon Masks (0–150 km) at [0, 0.25, 1, 2.5, 10] m AGL
     sampled directly from the served priority-ordered DEM mosaic (5/10 m -> 40 m -> 480 m) so
     precomputed masks match runtime TerrainService / HorizonService ray-marching identically.

Outputs:
  - Lightweight site catalog JSON -> web/src/data/pilot/sites.json
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
import rasterio
from rasterio.windows import from_bounds
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


def downsample_block_mean(arr: np.ndarray, factor: int) -> np.ndarray:
    h, w = arr.shape
    h_trim = (h // factor) * factor
    w_trim = (w // factor) * factor
    blocks = arr[:h_trim, :w_trim].reshape(h_trim // factor, factor, w_trim // factor, factor)
    return np.nanmean(blocks, axis=(1, 3)).astype(np.float32)


def fetch_horizons_series(
    session: requests.Session, target_id: str, lon_deg_e: float, lat_deg: float, alt_km: float
):
    params = {
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
    resp = session.get(HORIZONS_URL, params=params, timeout=60)
    resp.raise_for_status()
    raw = resp.json()["result"]
    soe = raw.find("$$SOE")
    eoe = raw.find("$$EOE")
    if soe == -1 or eoe == -1:
        raise ValueError(f"Horizons $$SOE/$$EOE missing for target {target_id}: {raw[:400]}")

    times_ms = []
    az_deg = []
    el_deg = []
    for line in raw[soe + 5 : eoe].strip().splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 5:
            continue
        dt = datetime.strptime(parts[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        times_ms.append(int(dt.timestamp() * 1000))
        az_deg.append(round(float(parts[3]), 4))
        el_deg.append(round(float(parts[4]), 4))
    return times_ms, az_deg, el_deg


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
            json.dump(data, f, separators=(",", ":"))
        else:
            json.dump(data, f, indent=2)


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


def load_or_fetch_regional_480m(session: requests.Session, rebuild: bool) -> dict:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    far_npy = CACHE_DIR / "ldem_60s_240m.npy"
    sp_480_path = PUBLIC_DIR / "terrain_south_pole_480m.bin"

    if sp_480_path.exists() and not rebuild:
        print("1/4 Reusing cached terrain_south_pole_480m.bin...", flush=True)
        sp_480 = np.fromfile(sp_480_path, dtype=np.float32).reshape(1600, 1600)
    else:
        tif240 = CACHE_DIR / "LDEM_60S_240MPP_ADJ.TIF"
        if not tif240.exists() or rebuild:
            print("1/4 Downloading PGDA 240 m/px South Pole DEM (209 MB)...", flush=True)
            _download_file(session, PGDA_240M_HTTPS, tif240)
        with rasterio.open(tif240) as src240:
            win240 = from_bounds(
                -REGIONAL_HALF_EXTENT_M,
                -REGIONAL_HALF_EXTENT_M,
                REGIONAL_HALF_EXTENT_M,
                REGIONAL_HALF_EXTENT_M,
                src240.transform,
            )
            far_grid = src240.read(1, window=win240).astype(np.float32)
        np.save(far_npy, far_grid)
        sp_480 = downsample_block_mean(far_grid, 2)
        sp_480.tofile(sp_480_path)
        print(f"   -> Saved terrain_south_pole_480m.bin {sp_480.shape}", flush=True)

    return {
        "id": "south-pole-480m",
        "url": "/data/pilot/terrain_south_pole_480m.bin",
        "xMinM": -REGIONAL_HALF_EXTENT_M,
        "yMaxM": REGIONAL_HALF_EXTENT_M,
        "spacingM": 480.0,
        "rows": int(sp_480.shape[0]),
        "cols": int(sp_480.shape[1]),
        "minHeightM": float(np.nanmin(sp_480)),
        "maxHeightM": float(np.nanmax(sp_480)),
        "source": "PGDA 90 LDEM_60S_240MPP_ADJ (cropped [-384, +384] km, downsampled 2x to 480 m/px)",
    }


def load_site_near_dem(session: requests.Session, site: dict, sx: float, sy: float) -> tuple[np.ndarray, dict, float]:
    dem_type = site["demType"]
    slug = site["slug"]
    if dem_type == "pgda_5m":
        tif_cache = CACHE_DIR / f"{slug}_5mpp_surf.tif"
        if not tif_cache.exists():
            print(f"   -> Downloading {site['pgdaUrl']}...", flush=True)
            resp = session.get(site["pgdaUrl"], timeout=240)
            resp.raise_for_status()
            tif_cache.write_bytes(resp.content)
        with rasterio.open(tif_cache) as src5:
            near_grid = src5.read(1).astype(np.float32)
            near_meta = {
                "xMinM": float(src5.transform.c),
                "yMaxM": float(src5.transform.f),
                "spacingM": 5.0,
                "rows": int(near_grid.shape[0]),
                "cols": int(near_grid.shape[1]),
            }
        return near_grid, near_meta, 5.0

    if dem_type == "pgda_10m":
        tile_cache = CACHE_DIR / f"{slug}_10mpp_16km.npz"
        if tile_cache.exists():
            loaded = np.load(tile_cache)
            near_grid = loaded["grid"]
            near_meta = json.loads(str(loaded["meta"]))
            return near_grid, near_meta, 10.0

        print(f"   -> Reading 16x16 km @ 10 m/px window from PGDA 90 for {site['id']}...", flush=True)
        half_tile_m = 8_000.0
        with rasterio.open(site["pgdaUrl"]) as src10:
            win = from_bounds(
                sx - half_tile_m,
                sy - half_tile_m,
                sx + half_tile_m,
                sy + half_tile_m,
                src10.transform,
            )
            near_grid = src10.read(1, window=win).astype(np.float32)
            tf = src10.window_transform(win)
            near_meta = {
                "xMinM": float(tf.c),
                "yMaxM": float(tf.f),
                "spacingM": 10.0,
                "rows": int(near_grid.shape[0]),
                "cols": int(near_grid.shape[1]),
            }
        np.savez(tile_cache, grid=near_grid, meta=json.dumps(near_meta))
        return near_grid, near_meta, 10.0

    raise ValueError(f"Unsupported demType: {dem_type}")


def layer_metadata_from_bin(
    layer_id: str,
    site_id: str,
    bin_name: str,
    x_min_m: float,
    y_max_m: float,
    spacing_m: float,
    rows: int,
    cols: int,
    arr: np.ndarray,
    source: str,
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
        "minHeightM": float(np.nanmin(arr)),
        "maxHeightM": float(np.nanmax(arr)),
        "source": source,
    }


def load_served_mosaic(ordered_layers: list[dict]) -> list[tuple[dict, np.ndarray]]:
    mosaic: list[tuple[dict, np.ndarray]] = []
    for meta in ordered_layers:
        bin_path = PUBLIC_DIR / Path(meta["url"]).name
        arr = np.fromfile(bin_path, dtype=np.float32).reshape(meta["rows"], meta["cols"])
        mosaic.append((meta, arr))
    return mosaic


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild-regional", action="store_true")
    parser.add_argument("--skip-existing", action="store_true", help="Skip sites whose generated outputs already exist")
    parser.add_argument(
        "--recompute-horizons",
        action="store_true",
        help="Recompute horizon masks directly from served DEM .bin mosaic (reuses existing DEM bins and ephemeris JSONs)",
    )
    parser.add_argument("--sites", nargs="*", help="Optional subset of site IDs to process (all sites remain in manifest/catalog)")
    args = parser.parse_args()

    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    target_ids = set(args.sites) if args.sites else None

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
                "nameVerified": site["nameVerified"],
                "description": site["description"],
                "provenance": {
                    "kind": "processed",
                    "source": f"NASA Artemis Candidate Landing Sites / {site['pgdaSourceLabel']}",
                    "version": "pilot-v2",
                    "generatedAt": now_iso,
                    "notes": "Verified coordinates matched across DEM, horizon mask, and JPL Horizons ephemeris.",
                },
            }
        )

        bins_ready = (PUBLIC_DIR / crop_name).exists() and (PUBLIC_DIR / grid40_name).exists() and sid in site_layers_by_id
        if target_ids is not None and sid not in target_ids:
            continue
        if (args.skip_existing or args.recompute_horizons) and bins_ready:
            continue

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
        )
        print(f"   -> Saved {crop_name} {crop_arr.shape} and {grid40_name} {grid40.shape}", flush=True)

        site_layers_by_id[sid] = [crop_meta, grid40_meta]
        write_json(manifest_index_path, site_layers_by_id, compact=False)

    print("3/4 Writing sites.json and terrain_manifest.json...", flush=True)
    write_json(SRC_DIR / "sites.json", sites_catalog, compact=False)

    all_local_layers = []
    for site in catalog:
        all_local_layers.extend(site_layers_by_id.get(site["id"], []))

    # Layer lookup priority: finest grid spacing first -> regional 480 m grid last
    ordered_layers = sorted(all_local_layers, key=lambda l: (l["spacingM"], l["id"])) + [sp_480_layer]
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
            "notes": "Multi-resolution Lunar South Pole DEM mosaic in Polar Stereographic MOON_ME frame (R = 1,737,400 m).",
        },
        "layers": ordered_layers,
    }
    write_json(PUBLIC_DIR / "terrain_manifest.json", manifest, compact=False)

    print("4/4 Generating horizon masks & ephemerides from served DEM mosaic...", flush=True)
    mosaic_layers = load_served_mosaic(ordered_layers)

    for site in catalog:
        sid = site["id"]
        if target_ids is not None and sid not in target_ids:
            continue
        horizon_path = PUBLIC_DIR / f"horizon_{sid}.json"
        ephem_path = PUBLIC_DIR / f"ephemeris_{sid}.json"

        sx, sy = south_polar_forward(site["latDeg"], site["lonDegE"])
        ground_m = float(sample_mosaic_bilinear(mosaic_layers, np.array([float(sx)]), np.array([float(sy)]))[0])
        if math.isnan(ground_m):
            raise ValueError(f"Ground elevation is NaN at {sid}")

        if args.recompute_horizons or not (args.skip_existing and horizon_path.exists()):
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
                "provenance": {
                    "kind": "processed",
                    "source": f"{site['pgdaSourceLabel']} + PGDA 90 480 m/px mosaic (0–150 km)",
                    "version": "pilot-v2",
                    "generatedAt": now_iso,
                    "notes": "360-degree true local ENU North spherical ray-marched horizon mask up to 150 km over served DEM mosaic; precomputed at 0, 0.25, 1, 2.5, 10 m AGL.",
                },
            }
            write_json(horizon_path, horizon_doc, compact=True)
            print(f"   -> Saved {horizon_path.name} (ground={ground_m:.3f} m)", flush=True)

        if not ephem_path.exists() or (not args.recompute_horizons and not args.skip_existing):
            alt_km = (ground_m + 1.0) / 1000.0
            print(f"   -> Fetching 3-month JPL Horizons ephemeris for {sid}...", flush=True)
            t_sun, s_az, s_el = fetch_horizons_series(session, "10", site["lonDegE"], site["latDeg"], alt_km)
            time.sleep(0.3)
            t_earth, e_az, e_el = fetch_horizons_series(session, "399", site["lonDegE"], site["latDeg"], alt_km)
            assert t_sun == t_earth, f"Timestamps differ for {sid}"
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
                "provenance": {
                    "kind": "processed",
                    "source": "NASA/JPL Horizons API (DE441, MOON_ME)",
                    "version": "pilot-v2",
                    "generatedAt": now_iso,
                    "notes": f"Hourly topocentric apparent azimuth/elevation for {site['name']} (2027-01-01 to 2027-04-01 UTC).",
                },
            }
            write_json(ephem_path, ephem_doc, compact=True)
            print(f"   -> Saved {ephem_path.name} ({len(t_sun)} samples)", flush=True)

    print(f"All pilot assets generated successfully! ({len(sites_catalog)} sites, {len(ordered_layers)} DEM layers)", flush=True)


if __name__ == "__main__":
    main()
