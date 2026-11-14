"""Ephemeris service: precomputed Q1 2027 lookup + dynamic JPL Horizons API with cache."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import requests

from ..geo import interpolate_angle_deg, validate_coordinates
from ..models import EphemerisSeries, Provenance
from .terrain import TerrainService


class OutsideCoverageError(ValueError):
    """Raised when requested coordinates/time fall outside supported terrain or ephemeris."""


class UpstreamEphemerisError(RuntimeError):
    """Raised when JPL Horizons API fails or returns unparseable output."""


def _resample_series(
    raw: EphemerisSeries,
    site_id: str,
    start_utc_ms: int,
    end_utc_ms: int,
    step_seconds: int,
    provenance_notes: str | None = None,
) -> EphemerisSeries:
    pilot_start_ms = raw.startUtcMs
    pilot_step_ms = raw.stepSeconds * 1000
    pilot_count = len(raw.timesUtcMs)
    step_ms = step_seconds * 1000

    times_ms: list[int] = []
    sun_az: list[float] = []
    sun_el: list[float] = []
    earth_az: list[float] = []
    earth_el: list[float] = []

    t = start_utc_ms
    while t <= end_utc_ms:
        times_ms.append(t)
        float_idx = (t - pilot_start_ms) / pilot_step_ms
        i0 = max(0, min(pilot_count - 1, int(math.floor(float_idx))))
        i1 = min(pilot_count - 1, i0 + 1)
        alpha = max(0.0, min(1.0, float_idx - i0))

        s_az0 = raw.sunAzDeg[i0]
        s_az1 = raw.sunAzDeg[i1]
        s_el0 = raw.sunElDeg[i0]
        s_el1 = raw.sunElDeg[i1]

        e_az0 = raw.earthAzDeg[i0]
        e_az1 = raw.earthAzDeg[i1]
        e_el0 = raw.earthElDeg[i0]
        e_el1 = raw.earthElDeg[i1]

        sun_az.append(round(interpolate_angle_deg(s_az0, s_az1, alpha), 4))
        sun_el.append(round(s_el0 + alpha * (s_el1 - s_el0), 4))
        earth_az.append(round(interpolate_angle_deg(e_az0, e_az1, alpha), 4))
        earth_el.append(round(e_el0 + alpha * (e_el1 - e_el0), 4))
        t += step_ms

    prov = raw.provenance.model_copy(deep=True)
    if provenance_notes:
        prov.notes = provenance_notes

    return EphemerisSeries(
        siteId=site_id,
        frame="MOON_ME",
        startUtcMs=start_utc_ms,
        stepSeconds=step_seconds,
        timesUtcMs=times_ms,
        sunAzDeg=sun_az,
        sunElDeg=sun_el,
        earthAzDeg=earth_az,
        earthElDeg=earth_el,
        provenance=prov,
    )


def _choose_horizons_step_minutes(start_utc_ms: int, end_utc_ms: int, step_seconds: int) -> int:
    span_minutes = max(1, math.ceil((end_utc_ms - start_utc_ms) / 60_000))
    if step_seconds >= 60 and step_seconds % 60 == 0:
        candidate = step_seconds // 60
        if span_minutes / candidate <= 45_000:
            return candidate
    for candidate in (1, 5, 10, 15, 30, 60):
        if span_minutes / candidate <= 45_000:
            return candidate
    return 60


def _parse_horizons_timestamp_ms(token: str) -> int:
    for fmt in ("%Y-%b-%d %H:%M", "%Y-%b-%d %H:%M:%S", "%Y-%b-%d %H:%M:%S.%f"):
        try:
            dt = datetime.strptime(token, fmt).replace(tzinfo=timezone.utc)
            return int(dt.timestamp() * 1000)
        except ValueError:
            continue
    raise UpstreamEphemerisError(f"Unrecognized JPL Horizons timestamp format: {token!r}")


class EphemerisService:
    """Serves precomputed site ephemeris and dynamically fetches/caches JPL Horizons series."""

    def __init__(
        self,
        pilot_src_dir: Path,
        cache_dir: Path,
        terrain: TerrainService,
        horizons_url: str,
        horizons_timeout_s: float = 45.0,
        pilot_public_dir: Path | None = None,
    ) -> None:
        self._asset_dirs = [d for d in (pilot_public_dir, pilot_src_dir) if d is not None]
        self._cache_dir = cache_dir / "ephemeris"
        self._terrain = terrain
        self._horizons_url = horizons_url
        self._horizons_timeout_s = horizons_timeout_s
        self._precomputed_paths: dict[str, Path] | None = None
        self._precomputed_cache: dict[str, EphemerisSeries] = {}
        self._mem_cache: dict[str, EphemerisSeries] = {}

    def _discover_precomputed(self) -> dict[str, Path]:
        if self._precomputed_paths is None:
            discovered: dict[str, Path] = {}
            for directory in self._asset_dirs:
                if not directory.exists():
                    continue
                for path in sorted(directory.glob("ephemeris_*.json")):
                    try:
                        payload = json.loads(path.read_text(encoding="utf-8"))
                        sid = payload.get("siteId")
                        if isinstance(sid, str) and sid and sid not in discovered:
                            discovered[sid] = path
                    except (OSError, json.JSONDecodeError):
                        continue
            self._precomputed_paths = discovered
        return self._precomputed_paths

    def _get_precomputed(self, site_id: str) -> EphemerisSeries | None:
        cached = self._precomputed_cache.get(site_id)
        if cached is not None:
            return cached
        for directory in self._asset_dirs:
            direct = directory / f"ephemeris_{site_id}.json"
            if direct.exists():
                loaded = EphemerisSeries.model_validate_json(direct.read_text(encoding="utf-8"))
                self._precomputed_cache[site_id] = loaded
                return loaded
        path = self._discover_precomputed().get(site_id)
        if path is not None and path.exists():
            loaded = EphemerisSeries.model_validate_json(path.read_text(encoding="utf-8"))
            self._precomputed_cache[site_id] = loaded
            return loaded
        return None

    def has_precomputed_coverage(
        self, site_id: str | None, start_utc_ms: int, end_utc_ms: int
    ) -> bool:
        if not site_id:
            return False
        ephem = self._get_precomputed(site_id)
        if ephem is None or not ephem.timesUtcMs:
            return False
        return start_utc_ms >= ephem.timesUtcMs[0] and end_utc_ms <= ephem.timesUtcMs[-1]

    def get_ephemeris(
        self,
        lat_deg: float,
        lon_deg_e: float,
        start_utc_ms: int,
        end_utc_ms: int,
        step_seconds: int,
        observer_height_m: float = 0.0,
        site_id: str | None = None,
    ) -> EphemerisSeries:
        lat_v, lon_v = validate_coordinates(lat_deg, lon_deg_e)
        if not math.isfinite(observer_height_m) or observer_height_m < 0.0:
            raise ValueError("observerHeightM must be finite and nonnegative")
        if end_utc_ms < start_utc_ms or step_seconds < 60:
            raise ValueError("Require endUtcMs >= startUtcMs and stepSeconds >= 60")

        sample_count = int(math.floor((end_utc_ms - start_utc_ms) / (step_seconds * 1000))) + 1
        if sample_count > 25_000:
            raise ValueError("Ephemeris request exceeds 25,000 samples per scenario")

        resolved_site_id = site_id or f"custom:{lat_v}:{lon_v}"

        # Fast-path: precomputed Q1 2027 Horizons series for any catalog site
        if site_id:
            ephem = self._get_precomputed(site_id)
            if ephem is not None and ephem.timesUtcMs:
                if start_utc_ms >= ephem.timesUtcMs[0] and end_utc_ms <= ephem.timesUtcMs[-1]:
                    return _resample_series(ephem, site_id, start_utc_ms, end_utc_ms, step_seconds)

        # Dynamic JPL Horizons path requires valid ground elevation from DEM coverage
        ground_m, layer_id = self._terrain.height_at(lat_v, lon_v)
        if ground_m is None:
            raise OutsideCoverageError(
                f"Coordinates ({lat_v:.4f}, {lon_v:.4f}) are outside coverage of the PGDA DEM mosaic."
            )

        alt_km = (ground_m + observer_height_m) / 1000.0
        step_min = _choose_horizons_step_minutes(start_utc_ms, end_utc_ms, step_seconds)
        aligned_start_ms = int(math.floor(start_utc_ms / 60_000) * 60_000)
        # Ensure at least one Horizons step covers end_utc_ms
        aligned_end_ms = int(math.ceil(end_utc_ms / (step_min * 60_000)) * (step_min * 60_000))
        if aligned_end_ms <= aligned_start_ms:
            aligned_end_ms = aligned_start_ms + step_min * 60_000

        cache_key_raw = json.dumps(
            [
                round(lat_v, 5),
                round(lon_v, 5),
                round(alt_km, 4),
                aligned_start_ms,
                aligned_end_ms,
                step_min,
            ]
        )
        cache_hash = hashlib.sha256(cache_key_raw.encode("utf-8")).hexdigest()[:24]

        raw_series = self._mem_cache.get(cache_hash)
        if raw_series is None:
            disk_path = self._cache_dir / f"{cache_hash}.json"
            if disk_path.exists():
                raw_series = EphemerisSeries.model_validate_json(
                    disk_path.read_text(encoding="utf-8")
                )
            else:
                raw_series = self._fetch_horizons_pair(
                    site_id=resolved_site_id,
                    lat_deg=lat_v,
                    lon_deg_e=lon_v,
                    alt_km=alt_km,
                    start_utc_ms=aligned_start_ms,
                    end_utc_ms=aligned_end_ms,
                    step_minutes=step_min,
                    dem_layer_id=layer_id,
                )
                self._cache_dir.mkdir(parents=True, exist_ok=True)
                disk_path.write_text(raw_series.model_dump_json(), encoding="utf-8")
            self._mem_cache[cache_hash] = raw_series

        return _resample_series(raw_series, resolved_site_id, start_utc_ms, end_utc_ms, step_seconds)

    def _fetch_horizons_pair(
        self,
        site_id: str,
        lat_deg: float,
        lon_deg_e: float,
        alt_km: float,
        start_utc_ms: int,
        end_utc_ms: int,
        step_minutes: int,
        dem_layer_id: str | None,
    ) -> EphemerisSeries:
        start_str = datetime.fromtimestamp(start_utc_ms / 1000.0, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M"
        )
        stop_str = datetime.fromtimestamp(end_utc_ms / 1000.0, tz=timezone.utc).strftime(
            "%Y-%m-%d %H:%M"
        )
        step_str = f"{step_minutes} m"

        t_sun, s_az, s_el = self._query_horizons_target(
            "10", lon_deg_e, lat_deg, alt_km, start_str, stop_str, step_str
        )
        t_earth, e_az, e_el = self._query_horizons_target(
            "399", lon_deg_e, lat_deg, alt_km, start_str, stop_str, step_str
        )
        if t_sun != t_earth or not t_sun:
            raise UpstreamEphemerisError("JPL Horizons Sun/Earth timestamps mismatched or empty")

        return EphemerisSeries(
            siteId=site_id,
            frame="MOON_ME",
            startUtcMs=t_sun[0],
            stepSeconds=step_minutes * 60,
            timesUtcMs=t_sun,
            sunAzDeg=s_az,
            sunElDeg=s_el,
            earthAzDeg=e_az,
            earthElDeg=e_el,
            provenance=Provenance(
                kind="processed",
                source="NASA/JPL Horizons API (DE441, MOON_ME) — dynamic server query",
                version="pilot-api-v1",
                generatedAt=datetime.now(timezone.utc).isoformat(),
                notes=(
                    f"Topocentric apparent Sun/Earth azimuth & elevation at ({lat_deg:.5f}°, "
                    f"{lon_deg_e:.5f}° E), altitude {alt_km:.4f} km from {dem_layer_id or 'PGDA DEM'}, "
                    f"step {step_str}."
                ),
            ),
        )

    def _query_horizons_target(
        self,
        target_id: str,
        lon_deg_e: float,
        lat_deg: float,
        alt_km: float,
        start_str: str,
        stop_str: str,
        step_str: str,
    ) -> tuple[list[int], list[float], list[float]]:
        params = {
            "format": "json",
            "COMMAND": target_id,
            "OBJ_DATA": "NO",
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "OBSERVER",
            "CENTER": "coord@301",
            "COORD_TYPE": "GEODETIC",
            "SITE_COORD": f"{lon_deg_e:.6f},{lat_deg:.6f},{alt_km:.5f}",
            "START_TIME": start_str,
            "STOP_TIME": stop_str,
            "STEP_SIZE": step_str,
            "QUANTITIES": "4",
            "CSV_FORMAT": "YES",
        }
        try:
            resp = requests.get(self._horizons_url, params=params, timeout=self._horizons_timeout_s)
            resp.raise_for_status()
            payload = resp.json()
        except requests.RequestException as exc:
            raise UpstreamEphemerisError(f"JPL Horizons request failed: {exc}") from exc
        except ValueError as exc:
            raise UpstreamEphemerisError(f"Invalid JSON from JPL Horizons: {exc}") from exc

        raw = payload.get("result")
        if not isinstance(raw, str):
            raise UpstreamEphemerisError("JPL Horizons response missing 'result' text")
        soe = raw.find("$$SOE")
        eoe = raw.find("$$EOE")
        if soe == -1 or eoe == -1 or eoe <= soe:
            raise UpstreamEphemerisError(f"JPL Horizons $$SOE/$$EOE missing: {raw[:300]}")

        times_ms: list[int] = []
        az_deg: list[float] = []
        el_deg: list[float] = []
        for line in raw[soe + 5 : eoe].strip().splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            parts = [p.strip() for p in stripped.split(",")]
            if len(parts) < 5:
                continue
            times_ms.append(_parse_horizons_timestamp_ms(parts[0]))
            az_deg.append(round(float(parts[3]), 4))
            el_deg.append(round(float(parts[4]), 4))
        return times_ms, az_deg, el_deg
