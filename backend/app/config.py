"""Runtime configuration and physical constants for the LunarSight backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

MOON_RADIUS_M = 1_737_400.0
HORIZON_MAX_RANGE_M = 150_000.0
METHOD_VERSION = "visibility-v1"
DEFAULT_HORIZONS_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LLM_MODEL = "gpt-4o-mini"

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


@dataclass(frozen=True)
class Settings:
    """Resolved filesystem paths, SQLite path, network/CORS, and optional AI Advisor settings."""

    pilot_public_dir: Path
    pilot_src_dir: Path
    cache_dir: Path
    db_path: Path
    cors_origins: tuple[str, ...]
    horizons_url: str
    horizons_timeout_s: float
    llm_api_key: str | None = None
    llm_base_url: str = DEFAULT_LLM_BASE_URL
    llm_model: str = DEFAULT_LLM_MODEL
    llm_timeout_s: float = 20.0


def load_settings() -> Settings:
    """Load settings from environment variables with repository defaults."""
    public_dir = Path(
        os.environ.get("LUNARSIGHT_PILOT_PUBLIC_DIR", REPO_ROOT / "web" / "public" / "data" / "pilot")
    )
    src_dir = Path(
        os.environ.get("LUNARSIGHT_PILOT_SRC_DIR", REPO_ROOT / "web" / "src" / "data" / "pilot")
    )
    cache_dir = Path(os.environ.get("LUNARSIGHT_CACHE_DIR", REPO_ROOT / "backend" / "cache"))
    db_path = Path(os.environ.get("LUNARSIGHT_DB_PATH", cache_dir / "lunarsight.db"))
    raw_origins = os.environ.get(
        "LUNARSIGHT_CORS_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,https://lunarsight.vercel.app",
    )
    cors_origins = tuple(origin.strip() for origin in raw_origins.split(",") if origin.strip())
    horizons_url = os.environ.get("LUNARSIGHT_HORIZONS_URL", DEFAULT_HORIZONS_URL)
    horizons_timeout_s = float(os.environ.get("LUNARSIGHT_HORIZONS_TIMEOUT_S", "45"))
    llm_api_key = os.environ.get("LUNARSIGHT_LLM_API_KEY", "").strip() or None
    llm_base_url = os.environ.get("LUNARSIGHT_LLM_BASE_URL", DEFAULT_LLM_BASE_URL).strip().rstrip("/")
    llm_model = os.environ.get("LUNARSIGHT_LLM_MODEL", DEFAULT_LLM_MODEL).strip()
    llm_timeout_s = float(os.environ.get("LUNARSIGHT_LLM_TIMEOUT_S", "20"))
    return Settings(
        pilot_public_dir=public_dir,
        pilot_src_dir=src_dir,
        cache_dir=cache_dir,
        db_path=db_path,
        cors_origins=cors_origins,
        horizons_url=horizons_url,
        horizons_timeout_s=horizons_timeout_s,
        llm_api_key=llm_api_key,
        llm_base_url=llm_base_url,
        llm_model=llm_model,
        llm_timeout_s=llm_timeout_s,
    )
