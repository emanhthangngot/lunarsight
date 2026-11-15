"""Source-attributed lunar technical observer catalog."""

from __future__ import annotations

from pathlib import Path

from ..models import SiteSummary
from .assets import ScienceAssets


class SiteCatalogService:
    """Serve the immutable startup catalog, not a live filesystem view."""

    def __init__(self, pilot_src_dir: Path, assets: ScienceAssets | None = None) -> None:
        self.assets = assets or ScienceAssets(pilot_src_dir)

    def _load(self) -> list[SiteSummary]:
        return list(self.assets.sites.values())

    def list_sites(self) -> list[SiteSummary]:
        return [site.model_copy(deep=True) for site in self._load()]

    def get_site(self, site_id: str) -> SiteSummary | None:
        for site in self._load():
            if site.id == site_id:
                return site.model_copy(deep=True)
        return None
