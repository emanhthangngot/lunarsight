"""Deterministic lunar visibility analysis matching web/src/analysis/visibility.ts."""

from __future__ import annotations

from bisect import bisect_right
import hashlib
import json
import math

from ..config import METHOD_VERSION
from ..geo import normalize_longitude, validate_coordinates
from ..models import (
    EphemerisSeries,
    HorizonMask,
    ScenarioInputsModel,
    VisibilityAnalysis,
    WindowMetrics,
)


def interpolate_horizon_mask(
    azimuths_deg: list[float], elevations_deg: list[float], az_deg: float
) -> float | None:
    """Ascending mask samples in [0, 360); bridges wrap across 360->0."""
    az = normalize_longitude(az_deg)
    if len(azimuths_deg) != len(elevations_deg):
        raise ValueError("Mask array sizes differ")
    n = len(azimuths_deg)
    if n == 0:
        return None
    for i, a in enumerate(azimuths_deg):
        if not math.isfinite(a) or a < 0.0 or a >= 360.0 or not math.isfinite(elevations_deg[i]):
            raise ValueError("Mask samples must be finite and within [0, 360)")
        if i > 0 and a <= azimuths_deg[i - 1]:
            raise ValueError("Mask azimuths must be strictly ascending")
    if n == 1:
        return elevations_deg[0]

    idx = bisect_right(azimuths_deg, az)
    left = (idx + n - 1) % n
    right = idx % n
    x0 = azimuths_deg[left]
    x1 = azimuths_deg[right] + (360.0 if right == 0 else 0.0)
    x = az + 360.0 if az < x0 else az
    fraction = (x - x0) / (x1 - x0)
    return elevations_deg[left] + fraction * (elevations_deg[right] - elevations_deg[left])


def is_visible(el_deg: float | None, mask_el_deg: float | None) -> bool | None:
    """Centre must be strictly above terrain mask; missing remains None (unknown)."""
    if el_deg is None or mask_el_deg is None:
        return None
    if not (math.isfinite(el_deg) and math.isfinite(mask_el_deg)):
        return None
    return el_deg > mask_el_deg


def _summarize_track(times: list[int], states: list[bool | None]) -> tuple[float | None, float | None]:
    visible_hours = 0.0
    longest_hidden = 0.0
    hidden_run = 0.0
    unknown = False

    for i in range(len(times) - 1):
        hours = (times[i + 1] - times[i]) / 3_600_000.0
        if not math.isfinite(hours) or hours <= 0.0:
            raise ValueError("Times must be finite and strictly increasing")
        state = states[i]
        if state is None:
            unknown = True
            hidden_run = 0.0
        elif state:
            visible_hours += hours
            hidden_run = 0.0
        else:
            hidden_run += hours
            if hidden_run > longest_hidden:
                longest_hidden = hidden_run

    return (None, None) if unknown else (visible_hours, longest_hidden)


def summarize_window(
    times: list[int],
    sun_visible: list[bool | None],
    earth_visible: list[bool | None],
    both: list[bool | None],
) -> WindowMetrics:
    n = len(times)
    if len(sun_visible) != n or len(earth_visible) != n or len(both) != n:
        raise ValueError("Visibility and time array sizes differ")

    window_hours = 0.0 if n < 2 else (times[-1] - times[0]) / 3_600_000.0
    sun_vis_h, sun_dark_h = _summarize_track(times, sun_visible)
    earth_vis_h, earth_dark_h = _summarize_track(times, earth_visible)
    both_vis_h, _ = _summarize_track(times, both)

    def duration(val: float | None) -> float | None:
        return val if window_hours > 0.0 else None

    def percent(hours: float | None) -> float | None:
        return (100.0 * hours / window_hours) if (window_hours > 0.0 and hours is not None) else None

    return WindowMetrics(
        windowHours=window_hours,
        sunlitPercent=percent(sun_vis_h),
        earthVisiblePercent=percent(earth_vis_h),
        bothPercent=percent(both_vis_h),
        sunlitHours=duration(sun_vis_h),
        earthVisibleHours=duration(earth_vis_h),
        bothHours=duration(both_vis_h),
        longestDarknessHours=duration(sun_dark_h),
        longestEarthBlackoutHours=duration(earth_dark_h),
    )


def analyze_visibility(series: EphemerisSeries, mask: HorizonMask | None) -> VisibilityAnalysis:
    n = len(series.timesUtcMs)
    if any(
        len(arr) != n
        for arr in (series.sunAzDeg, series.sunElDeg, series.earthAzDeg, series.earthElDeg)
    ):
        raise ValueError("Ephemeris array sizes differ")

    sun_visible: list[bool | None] = []
    earth_visible: list[bool | None] = []
    both: list[bool | None] = []

    for i in range(n):
        sun_mask = (
            None
            if mask is None
            else interpolate_horizon_mask(mask.azimuthsDeg, mask.elevationsDeg, series.sunAzDeg[i])
        )
        earth_mask = (
            None
            if mask is None
            else interpolate_horizon_mask(mask.azimuthsDeg, mask.elevationsDeg, series.earthAzDeg[i])
        )
        sun = is_visible(series.sunElDeg[i], sun_mask)
        earth = is_visible(series.earthElDeg[i], earth_mask)
        sun_visible.append(sun)
        earth_visible.append(earth)
        both.append(None if (sun is None or earth is None) else (sun and earth))

    metrics = summarize_window(series.timesUtcMs, sun_visible, earth_visible, both)
    return VisibilityAnalysis(
        sunVisible=sun_visible,
        earthVisible=earth_visible,
        both=both,
        metrics=metrics,
    )


def validate_scenario_inputs(inputs: ScenarioInputsModel) -> None:
    """Matches web/src/state/scenario.ts validateScenario."""
    validate_coordinates(inputs.site.latDeg, inputs.site.lonDegE)
    if not math.isfinite(inputs.durationDays) or inputs.durationDays <= 0.0 or inputs.durationDays > 90.0:
        raise ValueError("Duration must be greater than 0 and at most 90 days")
    if inputs.stepSeconds < 60:
        raise ValueError("Sample step must be at least 60 seconds")
    if (
        not math.isfinite(inputs.observerHeightM)
        or inputs.observerHeightM < 0.0
        or inputs.observerHeightM > 1000.0
    ):
        raise ValueError("Observer height must be between 0 and 1000 m")
    if math.ceil(inputs.durationDays * 86_400.0 / inputs.stepSeconds) + 1 > 25_000:
        raise ValueError("At most 25,000 samples per scenario; increase the step or shorten the duration")


def compute_calc_hash(inputs: ScenarioInputsModel, dem_version: str) -> str:
    """Deterministic identity for immutable cached results."""
    lat_v, lon_v = validate_coordinates(inputs.site.latDeg, inputs.site.lonDegE)
    payload = [
        inputs.site.id if not inputs.site.id.startswith("custom:") else "custom",
        round(lat_v, 6),
        round(lon_v, 6),
        inputs.startUtcMs,
        round(inputs.durationDays, 6),
        inputs.stepSeconds,
        round(inputs.observerHeightM, 4),
        dem_version,
        METHOD_VERSION,
    ]
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode("utf-8")).hexdigest()[:32]
