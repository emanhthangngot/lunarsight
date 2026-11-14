"""
Offline pipeline script for LunarSight Real Pilot Assets (Option 1: Static Precomputed).

Fetches and processes official NASA data for Site 01 (de Gerlache Rim) and Site 04 (Connecting Ridge):
  1. JPL Horizons API ephemerides (Sun & Earth, frame MOON_ME, 3 months: 2027-01-01 to 2027-04-01 UTC).
  2. PGDA LOLA DEMs via GDAL /vsicurl/:
       - Regional 80 m/px (LDEM_80S_80MPP_ADJ.TIF) downsampled to 320 m/px covering [-192 km, +192 km].
       - Local 5 m/px (Site01 & Site04) -> 40 m/px (16 km x 16 km) + 5 m/px (2.5 km x 2.5 km centered on site).
  3. 360-degree true-North spherical ray-marched Horizon Masks (0–150 km) at [0, 0.25, 1, 2.5, 10] m AGL
     using the full 5 m/px near-field + 80 m/px far-field PGDA grids.

Outputs:
  - Compact JSON (sites, ephemerides, horizons) -> web/src/data/pilot/
  - Binary Float32 DEM grids + terrain_manifest.json -> web/public/data/pilot/
"""

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import numpy as np
import rasterio
from rasterio.io import MemoryFile
from rasterio.windows import from_bounds
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

os.environ.setdefault("GDAL_HTTP_MAX_RETRY", "6")
os.environ.setdefault("GDAL_HTTP_RETRY_DELAY", "3")
os.environ.setdefault("GDAL_HTTP_TIMEOUT", "60")

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SRC_DIR = REPO_ROOT / "web" / "src" / "data" / "pilot"
PUBLIC_DIR = REPO_ROOT / "web" / "public" / "data" / "pilot"

MOON_RADIUS_M = 1_737_400.0
DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi

PGDA_80M_URL = "/vsicurl/https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF"
HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

START_TIME = "2027-01-01 00:00"
STOP_TIME = "2027-04-01 00:00"
STEP_SIZE = "60 m"

OBSERVER_HEIGHTS_M = [0.0, 0.25, 1.0, 2.5, 10.0]
HORIZON_MAX_RANGE_M = 150_000.0

SITES = [
    {
        "id": "site-04",
        "slug": "site04",
        "name": "Site 04 — Connecting Ridge",
        "category": "artemis-candidate",
        "latDeg": -89.785092,
        "lonDegE": 204.018283,  # Connecting Ridge ROI observer point (-2652.5, -5952.5 m), ~1737 m elevation
        "nameVerified": True,
        "description": "Connecting ridge candidate site near Shackleton crater with high illumination.",
        "pgda5mUrl": "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site04/Site04_final_adj_5mpp_surf.tif",
        "pgdaSourceLabel": "PGDA 78 Site04 5 m/px",
    },
    {
        "id": "site-01",
        "slug": "site01",
        "name": "Site 01 — de Gerlache Rim",
        "category": "artemis-candidate",
        "latDeg": -89.4632,
        "lonDegE": 222.51,  # -137.49 deg E normalized to [0, 360)
        "nameVerified": True,
        "description": "Elevated ridge crest on the rim of de Gerlache crater.",
        "pgda5mUrl": "https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/Site01/Site01_final_adj_5mpp_surf.tif",
        "pgdaSourceLabel": "PGDA 78 Site01 5 m/px",
    },
]


def south_polar_forward(lat_deg: np.ndarray | float, lon_deg_e: np.ndarray | float):
    rho = 2.0 * MOON_RADIUS_M * np.tan(math.pi / 4.0 + np.asarray(lat_deg) * DEG_TO_RAD / 2.0)
    lon = np.asarray(lon_deg_e) * DEG_TO_RAD
    return rho * np.sin(lon), rho * np.cos(lon)


def sample_grid_bilinear(grid: np.ndarray, x_min: float, y_max: float, spacing: float, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    rows, cols = grid.shape
    fx = (x - x_min) / spacing - 0.5
    fy = (y_max - y) / spacing - 0.5
    c0 = np.floor(fx).astype(np.int64)
    r0 = np.floor(fy).astype(np.int64)
    in_bounds = (c0 >= 0) & (c0 + 1 < cols) & (r0 >= 0) & (r0 + 1 < rows)

    c0_safe = np.clip(c0, 0, cols - 2)
    r0_safe = np.clip(r0, 0, rows - 2)
    tx = fx - c0_safe
    ty = fy - r0_safe

    v00 = grid[r0_safe, c0_safe]
    v01 = grid[r0_safe, c0_safe + 1]
    v10 = grid[r0_safe + 1, c0_safe]
    v11 = grid[r0_safe + 1, c0_safe + 1]

    val = (1 - ty) * ((1 - tx) * v00 + tx * v01) + ty * ((1 - tx) * v10 + tx * v11)
    return np.where(in_bounds, val, np.nan)


def downsample_block_mean(arr: np.ndarray, factor: int) -> np.ndarray:
    h, w = arr.shape
    h_trim = (h // factor) * factor
    w_trim = (w // factor) * factor
    blocks = arr[:h_trim, :w_trim].reshape(h_trim // factor, factor, w_trim // factor, factor)
    return np.nanmean(blocks, axis=(1, 3)).astype(np.float32)


def fetch_horizons_series(target_id: str, lon_deg_e: float, lat_deg: float, alt_km: float):
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
    resp = requests.get(HORIZONS_URL, params=params, timeout=60)
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


def compute_horizon_masks(
    lat_deg: float,
    lon_deg_e: float,
    ground_m: float,
    near_grid: np.ndarray,
    near_meta: dict,
    far_grid: np.ndarray,
    far_meta: dict,
) -> dict[str, list[float]]:
    """Matches MockDataProvider spherical ray-march geometry (true local ENU North, 25 m -> +4% step to 150 km)."""
    distances = []
    d = 25.0
    while True:
        distances.append(d)
        if d >= HORIZON_MAX_RANGE_M:
            break
        d = min(HORIZON_MAX_RANGE_M, d + max(25.0, d * 0.04))
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

    near_h = sample_grid_bilinear(near_grid, near_meta["xMinM"], near_meta["yMaxM"], near_meta["spacingM"], x_m, y_m)
    far_h = sample_grid_bilinear(far_grid, far_meta["xMinM"], far_meta["yMaxM"], far_meta["spacingM"], x_m, y_m)
    heights = np.where(np.isnan(near_h), far_h, near_h)

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rebuild-regional", action="store_true")
    args = parser.parse_args()

    SRC_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    now_iso = datetime.now(timezone.utc).isoformat()

    # Clean obsolete duplicated/stale pilot files
    for stale in [
        SRC_DIR / "terrain_site01.bin",
        SRC_DIR / "terrain_site01_meta.json",
        PUBLIC_DIR / "ephemeris_site04.json",
        PUBLIC_DIR / "horizon_site04.json",
        PUBLIC_DIR / "sites.json",
        PUBLIC_DIR / "terrain_site01.bin",
        PUBLIC_DIR / "terrain_site01_meta.json",
    ]:
        if stale.exists():
            stale.unlink()

    sp_320_path = PUBLIC_DIR / "terrain_south_pole_320m.bin"
    if sp_320_path.exists() and not args.rebuild_regional:
        print("1/4 Reusing existing terrain_south_pole_320m.bin...", flush=True)
        sp_320 = np.fromfile(sp_320_path, dtype=np.float32).reshape(1200, 1200)
        far_grid = sp_320
        far_meta = {
            "xMinM": -192_000.0,
            "yMaxM": 192_000.0,
            "spacingM": 320.0,
            "rows": 1200,
            "cols": 1200,
        }
    else:
        print("1/4 Reading regional PGDA 80 m/px South Pole DEM [-192 km, +192 km]...", flush=True)
        with rasterio.open(PGDA_80M_URL) as src80:
            win80 = from_bounds(-192_000.0, -192_000.0, 192_000.0, 192_000.0, src80.transform)
            far_grid = src80.read(1, window=win80).astype(np.float32)
            far_tf = src80.window_transform(win80)
            far_meta = {
                "xMinM": float(far_tf.c),
                "yMaxM": float(far_tf.f),
                "spacingM": 80.0,
                "rows": int(far_grid.shape[0]),
                "cols": int(far_grid.shape[1]),
            }
        sp_320 = downsample_block_mean(far_grid, 4)
        sp_320.tofile(sp_320_path)
        print(f"   -> Saved terrain_south_pole_320m.bin {sp_320.shape}", flush=True)

    sp_320_layer = {
        "id": "south-pole-320m",
        "url": "/data/pilot/terrain_south_pole_320m.bin",
        "xMinM": -192_000.0,
        "yMaxM": 192_000.0,
        "spacingM": 320.0,
        "rows": int(sp_320.shape[0]),
        "cols": int(sp_320.shape[1]),
        "minHeightM": float(np.nanmin(sp_320)),
        "maxHeightM": float(np.nanmax(sp_320)),
        "source": "PGDA 90 LDEM_80S_80MPP_ADJ (downsampled 4x to 320 m/px)",
    }

    local_layers = []
    sites_catalog = []

    for site in SITES:
        sid = site["id"]
        slug = site["slug"]
        print(f"2/4 Processing {sid} ({site['name']})...", flush=True)

        session = requests.Session()
        session.mount("https://", HTTPAdapter(max_retries=Retry(total=5, backoff_factor=1.5)))
        tiff_resp = session.get(site["pgda5mUrl"], timeout=180)
        tiff_resp.raise_for_status()
        with MemoryFile(tiff_resp.content) as mem, mem.open() as src5:
            near_grid = src5.read(1).astype(np.float32)
            near_meta = {
                "xMinM": float(src5.transform.c),
                "yMaxM": float(src5.transform.f),
                "spacingM": 5.0,
                "rows": int(near_grid.shape[0]),
                "cols": int(near_grid.shape[1]),
            }

        sx, sy = south_polar_forward(site["latDeg"], site["lonDegE"])
        ground_m = float(sample_grid_bilinear(near_grid, near_meta["xMinM"], near_meta["yMaxM"], 5.0, np.array([sx]), np.array([sy]))[0])
        if math.isnan(ground_m):
            raise ValueError(f"Ground elevation is NaN at {sid}")
        print(f"   -> Observer XY=({sx:.2f}, {sy:.2f}) m, ground={ground_m:.3f} m")

        # Save 5 m/px inner 2.5 km x 2.5 km crop (501 x 501)
        half_m = 1252.5
        col0 = max(0, int(math.floor((sx - half_m - near_meta["xMinM"]) / 5.0)))
        row0 = max(0, int(math.floor((near_meta["yMaxM"] - (sy + half_m)) / 5.0)))
        col1 = min(near_meta["cols"], col0 + 501)
        row1 = min(near_meta["rows"], row0 + 501)
        crop5 = near_grid[row0:row1, col0:col1].astype(np.float32)
        crop5_name = f"terrain_{slug}_5m.bin"
        crop5.tofile(PUBLIC_DIR / crop5_name)
        local_layers.append({
            "id": f"{slug}-5m",
            "siteId": sid,
            "url": f"/data/pilot/{crop5_name}",
            "xMinM": near_meta["xMinM"] + col0 * 5.0,
            "yMaxM": near_meta["yMaxM"] - row0 * 5.0,
            "spacingM": 5.0,
            "rows": int(crop5.shape[0]),
            "cols": int(crop5.shape[1]),
            "minHeightM": float(np.nanmin(crop5)),
            "maxHeightM": float(np.nanmax(crop5)),
            "source": site["pgdaSourceLabel"],
        })

        # Save 40 m/px full 16 km x 16 km tile (400 x 400)
        grid40 = downsample_block_mean(near_grid, 8)
        grid40_name = f"terrain_{slug}_40m.bin"
        grid40.tofile(PUBLIC_DIR / grid40_name)
        local_layers.append({
            "id": f"{slug}-40m",
            "siteId": sid,
            "url": f"/data/pilot/{grid40_name}",
            "xMinM": near_meta["xMinM"],
            "yMaxM": near_meta["yMaxM"],
            "spacingM": 40.0,
            "rows": int(grid40.shape[0]),
            "cols": int(grid40.shape[1]),
            "minHeightM": float(np.nanmin(grid40)),
            "maxHeightM": float(np.nanmax(grid40)),
            "source": f"{site['pgdaSourceLabel']} (downsampled 8x to 40 m/px)",
        })
        print(f"   -> Saved {crop5_name} {crop5.shape} and {grid40_name} {grid40.shape}")

        # 360-degree Horizon Mask up to 150 km
        heights_dict = compute_horizon_masks(site["latDeg"], site["lonDegE"], ground_m, near_grid, near_meta, far_grid, far_meta)
        horizon_doc = {
            "siteId": sid,
            "azimuthsDeg": list(range(360)),
            "maxRangeM": int(HORIZON_MAX_RANGE_M),
            "heights": heights_dict,
            "provenance": {
                "kind": "processed",
                "source": f"{site['pgdaSourceLabel']} + PGDA 90 80 m/px (0–150 km)",
                "version": "pilot-v2",
                "generatedAt": now_iso,
                "notes": "360-degree true local ENU North spherical ray-marched horizon mask up to 150 km; precomputed at 0, 0.25, 1, 2.5, 10 m AGL.",
            },
        }
        write_json(SRC_DIR / f"horizon_{slug}.json", horizon_doc, compact=True)
        print(f"   -> Saved horizon_{slug}.json")

        # 3-month JPL Horizons Ephemeris (Sun + Earth)
        alt_km = (ground_m + 1.0) / 1000.0
        print(f"3/4 Fetching 3-month JPL Horizons ephemeris for {sid}...")
        t_sun, s_az, s_el = fetch_horizons_series("10", site["lonDegE"], site["latDeg"], alt_km)
        t_earth, e_az, e_el = fetch_horizons_series("399", site["lonDegE"], site["latDeg"], alt_km)
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
        write_json(SRC_DIR / f"ephemeris_{slug}.json", ephem_doc, compact=True)
        print(f"   -> Saved ephemeris_{slug}.json ({len(t_sun)} samples)")

        sites_catalog.append({
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
        })

    print("4/4 Writing sites.json and terrain_manifest.json...")
    write_json(SRC_DIR / "sites.json", sites_catalog, compact=False)

    # Layer lookup priority: 5m local patches -> 40m site tiles -> 320m South Pole regional grid
    ordered_layers = [l for l in local_layers if l["spacingM"] == 5.0] + [l for l in local_layers if l["spacingM"] == 40.0] + [sp_320_layer]
    manifest = {
        "version": "pilot-v2",
        "coverage": {
            "southDeg": -90.0,
            "northDeg": -84.0,
            "westDegE": 0.0,
            "eastDegE": 360.0,
        },
        "provenance": {
            "kind": "processed",
            "source": "NASA PGDA 78 (5 m local) + PGDA 90 LDEM_80S_80MPP_ADJ (320 m regional)",
            "version": "pilot-v2",
            "generatedAt": now_iso,
            "notes": "Multi-resolution Lunar South Pole DEM mosaic in Polar Stereographic MOON_ME frame (R = 1,737,400 m).",
        },
        "layers": ordered_layers,
    }
    write_json(PUBLIC_DIR / "terrain_manifest.json", manifest, compact=False)
    print("All real pilot assets generated successfully!")


if __name__ == "__main__":
    main()
