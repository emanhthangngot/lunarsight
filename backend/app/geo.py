"""Lunar coordinate validation and projection helpers (MOON_ME, R = 1,737,400 m)."""

from __future__ import annotations

import math
import numpy as np

from .config import MOON_RADIUS_M

DEG_TO_RAD = math.pi / 180.0
RAD_TO_DEG = 180.0 / math.pi


class CoordinateValidationError(ValueError):
    """Raised when lunar coordinates are invalid or at an unsupported exact pole."""


def normalize_longitude(lon_deg_e: float) -> float:
    """Wrap east longitude into [0, 360)."""
    wrapped = lon_deg_e % 360.0
    return 0.0 if wrapped == 360.0 or wrapped == -0.0 else wrapped


def validate_coordinates(lat_deg: float, lon_deg_e: float) -> tuple[float, float]:
    """Validate selenographic latitude and east longitude, rejecting exact poles."""
    if not math.isfinite(lat_deg) or not math.isfinite(lon_deg_e):
        raise CoordinateValidationError("Coordinates must be finite numbers")
    if lat_deg < -90.0 or lat_deg > 90.0:
        raise CoordinateValidationError("Latitude must be between -90 and +90 degrees")
    if abs(lat_deg) == 90.0:
        raise CoordinateValidationError(
            "Exact pole coordinates have undefined local North; offset slightly from +-90 deg"
        )
    return float(lat_deg), normalize_longitude(float(lon_deg_e))


def south_polar_forward(
    lat_deg: np.ndarray | float, lon_deg_e: np.ndarray | float
) -> tuple[np.ndarray | float, np.ndarray | float]:
    """Project selenographic coordinates to Moon South Polar Stereographic (m)."""
    lat_arr = np.asarray(lat_deg, dtype=np.float64)
    lon_arr = np.asarray(lon_deg_e, dtype=np.float64)
    rho = 2.0 * MOON_RADIUS_M * np.tan(math.pi / 4.0 + lat_arr * DEG_TO_RAD / 2.0)
    lon_rad = lon_arr * DEG_TO_RAD
    x = rho * np.sin(lon_rad)
    y = rho * np.cos(lon_rad)
    if np.ndim(lat_deg) == 0 and np.ndim(lon_deg_e) == 0:
        return float(x), float(y)
    return x, y


def interpolate_angle_deg(a1: float, a2: float, alpha: float) -> float:
    """Shortest-arc linear interpolation between two angles in [0, 360)."""
    diff = (a2 - a1) % 360.0
    if diff > 180.0:
        diff -= 360.0
    if diff < -180.0:
        diff += 360.0
    return (a1 + alpha * diff + 360.0) % 360.0
