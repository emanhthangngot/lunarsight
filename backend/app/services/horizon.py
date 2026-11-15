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
from .assets import HORIZON_METHOD, ScienceAssets
from .resources import JsonCache, checkpoint


def _format_height_key(height_m: float) -> str:
    return str(int(height_m)) if float(height_m).is_integer() else str(height_m)


def _finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


class HorizonService:
    """Serves precomputed site masks and computes/caches custom South Polar horizon masks."""

    def __init__(
        self,
        pilot_src_dir: Path,
        cache_dir: Path,
        terrain: TerrainService,
        pilot_public_dir: Path | None = None,
        assets: ScienceAssets | None = None,
    ) -> None:
        self._assets = assets or ScienceAssets(pilot_public_dir or pilot_src_dir, pilot_src_dir)
        self._terrain = terrain
        self._cache = JsonCache(cache_dir / "horizons", HorizonMask)
        self._presets = {}
        self._generated_presets: set[str] = set()
        for name, content in self._assets.bytes.items():
            if name.startswith("horizon_") and name.endswith(".json"):
                loaded = json.loads(content)
                if not isinstance(loaded, dict) or not isinstance(loaded.get("siteId"), str):
                    raise ValueError("Startup horizon requires a siteId")
                site_id = loaded["siteId"]
                generated = self._assets.validate_preset_dependency(
                    loaded, self._assets.observers.get(site_id))
                self._validate_preset(loaded, generated)
                if generated:
                    self._generated_presets.add(site_id)
                if site_id in self._presets:
                    raise ValueError("Duplicate startup horizon siteId")
                self._presets[site_id] = loaded

    def _validate_preset(self, raw: dict, generated: bool) -> None:
        azimuths = raw.get("azimuthsDeg")
        heights = raw.get("heights")
        if (not isinstance(azimuths, list) or len(azimuths) < 2
                or any(not _finite_number(a) or not 0 <= a <= 360
                       for a in azimuths)
                or any(b <= a for a, b in zip(azimuths, azimuths[1:]))):
            raise ValueError("Invalid startup horizon azimuth samples")
        if (not isinstance(heights, dict) or not heights
                or not _finite_number(raw.get("maxRangeM")) or raw["maxRangeM"] <= 0):
            raise ValueError("Invalid startup horizon heights/range")
        recorded_heights = []
        for key, elevations in heights.items():
            try:
                height = float(key)
            except (ValueError, TypeError) as exc:
                raise ValueError("Invalid startup horizon height key") from exc
            if (not math.isfinite(height) or not 0 <= height <= 1000
                    or (generated and key != _format_height_key(height))):
                raise ValueError("Invalid startup horizon height key")
            if (not isinstance(elevations, list) or len(elevations) != len(azimuths)
                    or any(not _finite_number(e) or not -90 <= e <= 90
                           for e in elevations)):
                raise ValueError("Invalid startup horizon elevation samples")
            recorded_heights.append(height)
        Provenance.model_validate(raw.get("provenance"))
        if not generated:
            return
        if raw.get("horizonMethod") != HORIZON_METHOD:
            raise ValueError("Unsupported generated horizon method")
        site_id = raw["siteId"]
        observer = raw.get("observer")
        if (site_id not in self._assets.sites or not isinstance(observer, dict)
                or observer.get("metadataOrigin") != "pipeline-record"
                or observer.get("datumStatus") != "conditional"):
            raise ValueError("Generated horizon requires canonical pipeline-record observer")
        if not _finite_number(observer.get("latDeg")) or not _finite_number(observer.get("lonDegE")):
            raise ValueError("Generated horizon requires finite observer coordinates")
        self._assets.validate_site(site_id, observer["latDeg"], observer["lonDegE"])
        observer_heights = observer.get("observerHeightsM")
        if (not isinstance(observer_heights, list)
                or any(not _finite_number(h) for h in observer_heights)
                or len(set(observer_heights)) != len(observer_heights)
                or set(observer_heights) != set(recorded_heights)):
            raise ValueError("Generated horizon observer height set disagrees with masks")
        ground_m, _ = self._terrain.height_at(observer["latDeg"], observer["lonDegE"])
        if (ground_m is None or not _finite_number(observer.get("groundHeightM"))
                or observer["groundHeightM"] != ground_m):
            raise ValueError("Generated horizon observer ground disagrees with current terrain")

    def _get_precomputed(self, site_id: str) -> dict | None:
        return self._presets.get(site_id)

    def get_horizon_mask(
        self,
        lat_deg: float,
        lon_deg_e: float,
        observer_height_m: float,
        site_id: str | None = None,
    ) -> HorizonMask | None:
        lat_v, lon_v = validate_coordinates(lat_deg, lon_deg_e)
        checkpoint()
        self._assets.validate_site(site_id, lat_v, lon_v)
        if not math.isfinite(observer_height_m) or not 0.0 <= observer_height_m <= 1000.0:
            raise ValueError("observerHeightM must be between 0 and 1000 m")

        if site_id:
            pre = self._get_precomputed(site_id)
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
                        provenance=self._assets.provenance(
                            Provenance.model_validate(pre["provenance"]), site_id,
                            generated=site_id in self._generated_presets),
                    )

        resolved_site_id = site_id or f"custom:{lat_v}:{lon_v}"
        cache_key_raw = json.dumps(
            [
                lat_v,
                lon_v,
                observer_height_m,
                self._assets.fingerprint,
            ]
        )
        cache_hash = hashlib.sha256(cache_key_raw.encode("utf-8")).hexdigest()[:24]

        cached = self._cache.get(cache_hash)
        if cached is not None:
            return cached.model_copy(update={"siteId": resolved_site_id})
        computed = self._ray_march(resolved_site_id, lat_v, lon_v, observer_height_m)
        if computed is not None:
            self._cache.put(cache_hash, computed)
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
