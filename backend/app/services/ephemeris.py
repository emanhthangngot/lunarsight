"""Ephemeris service: precomputed Q1 2027 lookup + dynamic JPL Horizons API with cache."""

from __future__ import annotations

from bisect import bisect_right
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import requests

from ..geo import interpolate_angle_deg, validate_coordinates
from ..models import EphemerisSeries, ObserverMetadata, Provenance
from .terrain import TerrainService
from .assets import ScienceAssets
from .resources import Admission, BoundedHttp, JsonCache, checkpoint


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
    _validate_series(raw)
    if start_utc_ms < raw.timesUtcMs[0] or end_utc_ms > raw.timesUtcMs[-1]:
        raise UpstreamEphemerisError("Ephemeris timestamps do not bracket the requested window")
    step_ms = step_seconds * 1000

    times_ms: list[int] = []
    sun_az: list[float] = []
    sun_el: list[float] = []
    earth_az: list[float] = []
    earth_el: list[float] = []

    t = start_utc_ms
    while t <= end_utc_ms:
        times_ms.append(t)
        i0 = max(0, bisect_right(raw.timesUtcMs, t) - 1)
        i1 = min(len(raw.timesUtcMs) - 1, i0 + 1)
        span = raw.timesUtcMs[i1] - raw.timesUtcMs[i0]
        alpha = 0.0 if span == 0 else (t - raw.timesUtcMs[i0]) / span

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
        observer=raw.observer,
    )

def _validate_series(raw: EphemerisSeries) -> None:
    times = raw.timesUtcMs
    arrays = (raw.sunAzDeg, raw.sunElDeg, raw.earthAzDeg, raw.earthElDeg)
    if not times or raw.stepSeconds <= 0 or raw.startUtcMs != times[0]:
        raise UpstreamEphemerisError("Invalid ephemeris timestamp origin/support")
    if any(len(arr) != len(times) or any(not math.isfinite(v) for v in arr) for arr in arrays):
        raise UpstreamEphemerisError("Invalid ephemeris sample arrays")
    if any(b <= a for a, b in zip(times, times[1:])):
        raise UpstreamEphemerisError("Ephemeris timestamps must be strictly increasing")
    if any(b - a != raw.stepSeconds * 1000 for a, b in zip(times, times[1:])):
        raise UpstreamEphemerisError("Ephemeris timestamps disagree with source cadence")
    if any(not 0 <= v <= 360 for arr in (raw.sunAzDeg, raw.earthAzDeg) for v in arr):
        raise UpstreamEphemerisError("Ephemeris azimuth outside [0, 360]")
    if any(not -90 <= v <= 90 for arr in (raw.sunElDeg, raw.earthElDeg) for v in arr):
        raise UpstreamEphemerisError("Ephemeris elevation outside [-90, 90]")



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
        assets: ScienceAssets | None = None,
    ) -> None:
        self._assets = assets or ScienceAssets(pilot_public_dir or pilot_src_dir, pilot_src_dir)
        self._terrain = terrain
        self._horizons_url = horizons_url
        self._horizons_timeout_s = min(30.0, horizons_timeout_s)
        self.fingerprint = hashlib.sha256(
            (self._assets.fingerprint + horizons_url).encode()
        ).hexdigest()
        self._upstream = Admission(2)
        self._http = BoundedHttp(2)
        self._cache = JsonCache(cache_dir / "ephemeris", EphemerisSeries)
        self._precomputed_cache: dict[str, EphemerisSeries] = {}
        for name, content in self._assets.bytes.items():
            if name.startswith("ephemeris_") and name.endswith(".json"):
                record = json.loads(content)
                series = EphemerisSeries.model_validate(record)
                try:
                    _validate_series(series)
                except UpstreamEphemerisError as exc:
                    raise ValueError(f"Invalid startup ephemeris {name}: {exc}") from exc
                observer = series.observer or self._assets.observers.get(series.siteId)
                registry_observer = self._assets.observers.get(series.siteId)
                if series.observer is not None and registry_observer is not None and series.observer != registry_observer:
                    raise ValueError("Ephemeris observer conflicts with startup metadata registry")
                if observer is not None:
                    self._assets.validate_site(series.siteId, observer.latDeg, observer.lonDegE)
                generated = self._assets.validate_preset_dependency(record, observer)
                if generated:
                    if (series.siteId not in self._assets.sites or series.observer is None
                            or registry_observer is None or observer is None
                            or observer.metadataOrigin != "pipeline-record"
                            or observer.observerHeightM != 1):
                        raise ValueError("Generated ephemeris requires canonical recorded 1 m observer and registry")
                    ground_m, _ = self._terrain.height_at(observer.latDeg, observer.lonDegE)
                    if ground_m is None or observer.groundHeightM != ground_m:
                        raise ValueError("Generated ephemeris observer ground disagrees with current terrain")
                    altitude_km = float(f"{(ground_m + observer.observerHeightM) / 1000:.5f}")
                    if observer.ellipsoidAltitudeKm != altitude_km:
                        raise ValueError("Generated ephemeris altitude disagrees with five-decimal pipeline query")
                elif observer is None or observer.metadataOrigin != "legacy-pipeline-height":
                    raise ValueError("Legacy ephemeris requires unknown historical ground/altitude metadata")
                provenance = self._assets.provenance(series.provenance, series.siteId, generated=generated)
                if observer is not None:
                    altitude_note = (
                        "Original queried ground/ellipsoid altitude were not retained and remain unknown."
                        if observer.metadataOrigin == "legacy-pipeline-height" else
                        "Observer ground and transmitted altitude are retained in the generation record."
                    )
                    provenance.notes = (
                        f"{provenance.notes or ''} Recorded {observer.observerHeightM:g} m AGL; "
                        f"source cadence {series.stepSeconds} s (interpolation does not add source fidelity). "
                        f"{altitude_note}"
                    )
                series = series.model_copy(update={
                    "observer": observer,
                    "provenance": provenance,
                })
                if series.siteId in self._precomputed_cache:
                    raise ValueError("Duplicate startup ephemeris siteId")
                self._precomputed_cache[series.siteId] = series

    def _get_precomputed(self, site_id: str) -> EphemerisSeries | None:
        return self._precomputed_cache.get(site_id)

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
        checkpoint()
        self._assets.validate_site(site_id, lat_v, lon_v)
        if not math.isfinite(observer_height_m) or not 0.0 <= observer_height_m <= 1000.0:
            raise ValueError("observerHeightM must be between 0 and 1000 m")
        if end_utc_ms < start_utc_ms or step_seconds < 60:
            raise ValueError("Require endUtcMs >= startUtcMs and stepSeconds >= 60")
        if not -62_135_596_800_000 <= start_utc_ms <= end_utc_ms <= 253_402_300_799_999:
            raise ValueError("UTC timestamps must fit calendar years 1 through 9999")

        sample_count = int(math.floor((end_utc_ms - start_utc_ms) / (step_seconds * 1000))) + 1
        if sample_count > 25_000:
            raise ValueError("Ephemeris request exceeds 25,000 samples per scenario")

        resolved_site_id = site_id or f"custom:{lat_v}:{lon_v}"

        # Fast-path: precomputed Q1 2027 Horizons series for any catalog site
        if site_id:
            ephem = self._get_precomputed(site_id)
            if (ephem is not None and ephem.timesUtcMs and ephem.observer is not None
                    and ephem.observer.observerHeightM == observer_height_m
                    and self._assets.coordinates_match(lat_v, lon_v, ephem.observer.latDeg, ephem.observer.lonDegE)):
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
        source_step_ms = step_min * 60_000
        aligned_end_ms = aligned_start_ms + max(
            1, math.ceil((end_utc_ms - aligned_start_ms) / source_step_ms)
        ) * source_step_ms

        cache_key_raw = json.dumps(
            [
                lat_v,
                lon_v,
                alt_km,
                observer_height_m,
                self._assets.fingerprint,
                self._horizons_url,
                aligned_start_ms,
                aligned_end_ms,
                step_min,
            ]
        )
        cache_hash = hashlib.sha256(cache_key_raw.encode("utf-8")).hexdigest()[:24]

        raw_series = self._cache.get(cache_hash)
        if raw_series is None:
            with self._upstream.enter():
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
            raw_series.observer = ObserverMetadata(
                latDeg=lat_v, lonDegE=lon_v, observerHeightM=observer_height_m,
                groundHeightM=ground_m, ellipsoidAltitudeKm=alt_km,
                metadataOrigin="runtime-dem-query",
            )
            _validate_series(raw_series)
            if raw_series.timesUtcMs[0] > aligned_start_ms or raw_series.timesUtcMs[-1] < aligned_end_ms:
                raise UpstreamEphemerisError("JPL Horizons returned incomplete timestamp support")
            self._cache.put(cache_hash, raw_series)

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

        checkpoint()
        t_sun, s_az, s_el = self._query_horizons_target(
            "10", lon_deg_e, lat_deg, alt_km, start_str, stop_str, step_str
        )
        checkpoint()
        t_earth, e_az, e_el = self._query_horizons_target(
            "399", lon_deg_e, lat_deg, alt_km, start_str, stop_str, step_str
        )
        checkpoint()
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
            "SITE_COORD": f"{lon_deg_e},{lat_deg},{alt_km}",
            "START_TIME": start_str,
            "STOP_TIME": stop_str,
            "STEP_SIZE": step_str,
            "QUANTITIES": "4",
            "CSV_FORMAT": "YES",
        }
        try:
            payload = self._http.request(
                requests.get, self._horizons_url,
                params=params, headers={"Accept-Encoding": "identity"},
                timeout_s=self._horizons_timeout_s, max_bytes=8 * 1024 * 1024,
            )
        except (requests.RequestException, ValueError, TimeoutError) as exc:
            raise UpstreamEphemerisError("JPL Horizons request failed or exceeded response limits") from exc
        if not isinstance(payload, dict):
            raise UpstreamEphemerisError("JPL Horizons response must be an object")

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
                raise UpstreamEphemerisError("Malformed JPL Horizons sample")
            try:
                times_ms.append(_parse_horizons_timestamp_ms(parts[0]))
                az_deg.append(round(float(parts[3]), 4))
                el_deg.append(round(float(parts[4]), 4))
            except ValueError as exc:
                raise UpstreamEphemerisError("Invalid JPL Horizons numeric sample") from exc
        return times_ms, az_deg, el_deg
