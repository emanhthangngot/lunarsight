"""Runtime configuration and physical constants for the LunarSight backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

MOON_RADIUS_M = 1_737_400.0
HORIZON_MAX_RANGE_M = 150_000.0
DEFAULT_HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class Settings:
    """Resolved filesystem paths and network/CORS settings."""

    pilot_public_dir: Path
    pilot_src_dir: Path
    cache_dir: Path
    cors_origins: tuple[str, ...]
    horizons_url: str
    horizons_timeout_s: float


def load_settings() -> Settings:
    """Load settings from environment variables with repository defaults."""
    public_dir = Path(
        os.environ.get("LUNARSIGHT_PILOT_PUBLIC_DIR", REPO_ROOT / "web" / "public" / "data" / "pilot")
    )
    src_dir = Path(
        os.environ.get("LUNARSIGHT_PILOT_SRC_DIR", REPO_ROOT / "web" / "src" / "data" / "pilot")
    )
    cache_dir = Path(os.environ.get("LUNARSIGHT_CACHE_DIR", REPO_ROOT / "backend" / "cache"))
    raw_origins = os.environ.get(
        "LUNARSIGHT_CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,https://lunarsight.vercel.app",
    )
    cors_origins = tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())
    horizons_url = os.environ.get("LUNARSIGHT_HORIZONS_URL", DEFAULT_HORIZONS_URL)
    horizons_timeout_s = float(os.environ.get("LUNARSIGHT_HORIZONS_TIMEOUT_S", "45"))
    return Settings(
        pilot_public_dir=public_dir,
        pilot_src_dir=src_dir,
        cache_dir=cache_dir,
        cors_origins=cors_origins,
        horizons_url=horizons_url,
        horizons_timeout_s=horizons_timeout_s,
    )
