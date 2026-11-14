"""Horizon mask lookup and vectorized spherical ray-marching on PGDA DEMs."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import numpy as np

from ..config import HORIZON_MAX_RANGE_M, MOON_RADIUS_M
from ..geo import DEG_TO_RAD, RAD_TO_DEG, normalize_longitude, validate_coordinates
from ..models import HorizonMask, Provenance
from .terrain import TerrainService


def _format_height_key(height_m: float) -> str:
    return str(int(height_m)) if float(height_m).is_integer() else str(height_m)


class HorizonService:
    """Serves precomputed site masks and computes/caches custom South Polar horizon masks."""

    def __init__(self, pilot_src_dir: Path, cache_dir: Path, terrain: TerrainService) -> None:
        self._src_dir = pilot_src_dir
        self._cache_dir = cache_dir / "horizons"
        self._terrain = terrain
        self._precomputed: dict[str, dict] | None = None
        self._mem_cache: dict[str, HorizonMask] = {}

    def _load_precomputed(self) -> dict[str, dict]:
        if self._precomputed is None:
            loaded: dict[str, dict] = {}
            for site_id, filename in [
                ("site-01", "horizon_site01.json"),
                ("site-04", "horizon_site04.json"),
            ]:
                path = self._src_dir / filename
                if path.exists():
                    loaded[site_id] = json.loads(path.read_text(encoding="utf-8"))
            self._precomputed = loaded
        return self._precomputed

    def get_horizon_mask(
        self,
        lat_deg: float,
        lon_deg_e: float,
        observer_height_m: float,
        site_id: str | None = None,
    ) -> HorizonMask | None:
        lat_v, lon_v = validate_coordinates(lat_deg, lon_deg_e)
        if not math.isfinite(observer_height_m) or observer_height_m < 0.0:
            raise ValueError("observerHeightM must be finite and nonnegative")

        if site_id:
            pre = self._load_precomputed().get(site_id)
            if pre is not None:
                heights_map = pre.get("heights", {})
                preset = heights_map.get(_format_height_key(observer_height_m))
                if preset is not None:
                    return HorizonMask(
                        siteId=site_id,
                        observerHeightM=observer_height_m,
                        azimuthsDeg=[float(a) for a in pre["azimuthsDeg"]],
                        elevationsDeg=[float(e) for e in preset],
                        maxRangeM=float(pre["maxRangeM"]),
                        provenance=Provenance.model_validate(pre["provenance"]),
                    )

        resolved_site_id = site_id or f"custom:{lat_v}:{lon_v}"
        cache_key_raw = json.dumps(
            [
                round(lat_v, 6),
                round(lon_v, 6),
                round(observer_height_m, 4),
                self._terrain.provenance.version,
            ]
        )
        cache_hash = hashlib.sha256(cache_key_raw.encode("utf-8")).hexdigest()[:24]

        cached = self._mem_cache.get(cache_hash)
        if cached is not None:
            return cached.model_copy(update={"siteId": resolved_site_id})

        disk_path = self._cache_dir / f"{cache_hash}.json"
        if disk_path.exists():
            doc = HorizonMask.model_validate_json(disk_path.read_text(encoding="utf-8"))
            self._mem_cache[cache_hash] = doc
            return doc.model_copy(update={"siteId": resolved_site_id})

        computed = self._ray_march(resolved_site_id, lat_v, lon_v, observer_height_m)
        if computed is None:
            return None

        self._cache_dir.mkdir(parents=True, exist_ok=True)
        disk_path.write_text(computed.model_dump_json(), encoding="utf-8")
        self._mem_cache[cache_hash] = computed
        return computed

    def _ray_march(
        self,
        site_id: str,
        lat_deg: float,
        lon_deg_e: float,
        observer_height_m: float,
    ) -> HorizonMask | None:
        ground_m, _ = self._terrain.height_at(lat_deg, lon_deg_e)
        if ground_m is None:
            return None

        edge_distance_m = (self._terrain.coverage.northDeg - lat_deg) * DEG_TO_RAD * MOON_RADIUS_M
        max_range_m = min(HORIZON_MAX_RANGE_M, edge_distance_m * (1.0 - 1e-10))
        if max_range_m < 25.0:
            return None

        distances: list[float] = []
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
        sin_lat = math.sin(lat_rad)
        cos_lat = math.cos(lat_rad)

        ang = dist_arr / MOON_RADIUS_M
        sin_ang = np.sin(ang)
        cos_ang = np.cos(ang)
        cos_b = np.cos(az_arr)
        sin_b = np.sin(az_arr)

        target_lat_rad = np.arcsin(
            np.clip(sin_lat * cos_ang + cos_lat * sin_ang * cos_b, -1.0, 1.0)
        )
        target_lon_rad = lon_rad + np.arctan2(
            sin_b * sin_ang * cos_lat, cos_ang - sin_lat * np.sin(target_lat_rad)
        )

        sample_lat_deg = np.maximum(-89.9999999999, target_lat_rad * RAD_TO_DEG)
        sample_lon_deg = np.mod(target_lon_rad * RAD_TO_DEG, 360.0)

        heights = self._terrain.height_array(sample_lat_deg, sample_lon_deg)
        if np.any(np.isnan(heights)):
            return None

        curvature = (dist_arr * dist_arr) / (2.0 * MOON_RADIUS_M)
        delta = heights - ground_m - observer_height_m
        el_deg = np.arctan2(delta - curvature, dist_arr) * RAD_TO_DEG
        max_el = np.max(el_deg, axis=1)

        return HorizonMask(
            siteId=site_id,
            observerHeightM=observer_height_m,
            azimuthsDeg=[float(a) for a in range(360)],
            elevationsDeg=[round(float(v), 6) for v in max_el],
            maxRangeM=float(max_range_m),
            provenance=Provenance(
                kind="processed",
                source=self._terrain.provenance.source,
                version=self._terrain.provenance.version,
                generatedAt=datetime.now(timezone.utc).isoformat(),
                notes=(
                    f"Server 1-degree spherical ray-marched mask on PGDA LOLA DEM at "
                    f"{observer_height_m} m AGL (0–{max_range_m / 1000.0:.1f} km)."
                ),
            ),
        )
