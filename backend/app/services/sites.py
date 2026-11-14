"""Catalog service for verified lunar landing sites."""

from __future__ import annotations

import json
from pathlib import Path

from ..models import SiteSummary


class SiteCatalogService:
    """Loads and serves verified candidate landing sites from JSON."""

    def __init__(self, pilot_src_dir: Path) -> None:
        self._sites_path = pilot_src_dir / "sites.json"
        self._sites: list[SiteSummary] | None = None

    def _load(self) -> list[SiteSummary]:
        if self._sites is None:
            raw = json.loads(self._sites_path.read_text(encoding="utf-8"))
            self._sites = [SiteSummary.model_validate(item) for item in raw]
        return self._sites

    def list_sites(self) -> list[SiteSummary]:
        return [site.model_copy(deep=True) for site in self._load()]

    def get_site(self, site_id: str) -> SiteSummary | None:
        for site in self._load():
            if site.id == site_id:
                return site.model_copy(deep=True)
        return None
