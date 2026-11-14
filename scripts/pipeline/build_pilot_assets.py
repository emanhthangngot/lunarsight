"""
Offline pipeline script for LunarSight Pilot Assets.
Parses NASA Horizons ephemerides, Site04 near-far horizon CSV, and terrain data
to produce lightweight, production-ready static JSON and binary assets for web.
Outputs to both web/public/data/pilot/ (for CDN static fetch) and web/src/data/pilot/ (for direct TS bundling).
"""

import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
EVIDENCE_DIR = REPO_ROOT / "notebooks" / "evidence"
SITE04_DIR = EVIDENCE_DIR / "site04-case"
PUBLIC_DIR = REPO_ROOT / "web" / "public" / "data" / "pilot"
SRC_DIR = REPO_ROOT / "web" / "src" / "data" / "pilot"

def parse_horizons_text(raw_text: str):
    """Parses a JPL Horizons text block between $$SOE and $$EOE."""
    soe = raw_text.find("$$SOE")
    eoe = raw_text.find("$$EOE")
    if soe == -1 or eoe == -1:
        raise ValueError("Could not find $$SOE or $$EOE delimiters in Horizons output")
    
    table_block = raw_text[soe + 5:eoe].strip()
    times_utc_ms = []
    az_deg = []
    el_deg = []
    
    for line in table_block.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 5:
            continue
        date_str = parts[0]  # e.g. "2027-Jan-01 00:00"
        az = float(parts[3])
        el = float(parts[4])
        
        dt = datetime.strptime(date_str, "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        ms = int(dt.timestamp() * 1000)
        
        times_utc_ms.append(ms)
        az_deg.append(round(az, 4))
        el_deg.append(round(el, 4))
        
    return times_utc_ms, az_deg, el_deg

def save_json(data, filename: str):
    for out_dir in [PUBLIC_DIR, SRC_DIR]:
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    print(f"-> Saved {filename} to public & src")

def build_ephemeris():
    print("Parsing Ephemeris for Site04...")
    sun_file = SITE04_DIR / "sun.json"
    earth_file = SITE04_DIR / "earth.json"
    
    with open(sun_file, "r", encoding="utf-8") as f:
        sun_raw = json.load(f)["result"]
    with open(earth_file, "r", encoding="utf-8") as f:
        earth_raw = json.load(f)["result"]
        
    times_sun, sun_az, sun_el = parse_horizons_text(sun_raw)
    times_earth, earth_az, earth_el = parse_horizons_text(earth_raw)
    
    assert times_sun == times_earth, "Sun and Earth timestamps must align"
    assert len(times_sun) > 0, "No ephemeris samples found"
    
    step_seconds = int((times_sun[1] - times_sun[0]) / 1000)
    
    ephemeris_data = {
        "siteId": "site-04",
        "frame": "MOON_ME",
        "startUtcMs": times_sun[0],
        "stepSeconds": step_seconds,
        "timesUtcMs": times_sun,
        "sunAzDeg": sun_az,
        "sunElDeg": sun_el,
        "earthAzDeg": earth_az,
        "earthElDeg": earth_el,
        "provenance": {
            "kind": "processed",
            "source": "NASA/JPL Horizons API (DE441/DE421, high precision MEAN_ME)",
            "version": "1.2",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "notes": "Hourly topocentric apparent azimuth and elevation at Connecting Ridge (Site04)."
        }
    }
    save_json(ephemeris_data, "ephemeris_site04.json")

def build_horizon():
    print("Parsing 360-bin Horizon Mask for Site04...")
    csv_file = SITE04_DIR / "near-far-25km.csv"
    azimuths = []
    elevations = []
    
    with open(csv_file, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            az = int(row["grid_azimuth_bin_deg"])
            combined_deg = float(row["combined_deg"])
            azimuths.append(az)
            elevations.append(round(combined_deg, 4))
            
    assert len(azimuths) == 360, "Expected 360 azimuth bins"
    
    horizon_data = {
        "siteId": "site-04",
        "observerHeightM": 1.0,
        "azimuthsDeg": azimuths,
        "elevationsDeg": elevations,
        "maxRangeM": 25000,
        "provenance": {
            "kind": "processed",
            "source": "PGDA 78 (5 m local) + PGDA 90 (80 m regional) Near/Far Fusion",
            "version": "1.0",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "notes": "360-degree near/far fused horizon mask up to 25 km; 1.0 m AGL."
        }
    }
    save_json(horizon_data, "horizon_site04.json")

def build_sites():
    print("Generating sites.json catalog...")
    sites = [
        {
            "id": "site-04",
            "name": "Site 04 — Connecting Ridge",
            "category": "artemis-candidate",
            "latDeg": -89.7668,
            "lonDegE": -171.87,
            "nameVerified": True,
            "description": "Connecting ridge candidate site near Shackleton crater with high illumination.",
            "provenance": {
                "kind": "processed",
                "source": "NASA Artemis Candidate Landing Sites / PGDA 78",
                "version": "pilot-v1",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "notes": "Reference coordinates from NASA Data Book & PGDA 78."
            }
        },
        {
            "id": "site-01",
            "name": "Site 01 — de Gerlache Rim",
            "category": "artemis-candidate",
            "latDeg": -89.4632,
            "lonDegE": -137.49,
            "nameVerified": True,
            "description": "Elevated ridge crest on the rim of de Gerlache crater.",
            "provenance": {
                "kind": "processed",
                "source": "NASA Artemis Candidate Landing Sites / PGDA 78",
                "version": "pilot-v1",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "notes": "Reference coordinates from NASA Data Book & PGDA 78."
            }
        }
    ]
    save_json(sites, "sites.json")

def build_terrain_grids():
    print("Generating binary terrain grids...")
    site01_npz = REPO_ROOT / "data" / "preview" / "site01_roi" / "surface.npz"
    if site01_npz.exists():
        d = np.load(site01_npz)
        data = d["data"].astype(np.float32)
        meta = {
            "siteId": "site-01",
            "rows": int(data.shape[0]),
            "cols": int(data.shape[1]),
            "spacingM": 5.0,
            "centerLatDeg": -89.4632,
            "centerLonDegE": -137.49,
            "minHeightM": float(np.nanmin(data)),
            "maxHeightM": float(np.nanmax(data)),
            "provenance": {
                "kind": "processed",
                "source": "PGDA 78 Site01 5 m local DEM",
                "version": "1.0",
                "generatedAt": datetime.now(timezone.utc).isoformat()
            }
        }
        save_json(meta, "terrain_site01_meta.json")
        for out_dir in [PUBLIC_DIR, SRC_DIR]:
            bin_path = out_dir / "terrain_site01.bin"
            data.tofile(bin_path)
        print("-> Saved Site01 terrain binary to public & src")

def main():
    build_ephemeris()
    build_horizon()
    build_sites()
    build_terrain_grids()
    print("All pilot static assets successfully built!")

if __name__ == "__main__":
    main()
