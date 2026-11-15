"""Coverage preflight service distinguishing supported, partial, and outside-coverage inputs."""

from __future__ import annotations

from ..geo import validate_coordinates
from ..models import CoverageCheckRequest, CoverageCheckResponse, LayerCoverageItem
from .ephemeris import EphemerisService
from .terrain import TerrainService


class CoverageService:
    """Evaluates terrain, horizon, and ephemeris coverage before running analysis."""

    def __init__(self, terrain: TerrainService, ephemeris: EphemerisService) -> None:
        self._terrain = terrain
        self._ephemeris = ephemeris

    def check(self, req: CoverageCheckRequest) -> CoverageCheckResponse:
        lat_v, lon_v = validate_coordinates(req.latDeg, req.lonDegE)
        ground_m, layer_id = self._terrain.height_at(lat_v, lon_v)
        terrain_ok = ground_m is not None

        # Horizon ray-march requires valid terrain up to coverage north edge
        edge_ok = terrain_ok and lat_v < self._terrain.coverage.northDeg - 0.002
        layers: list[LayerCoverageItem] = []

        if terrain_ok:
            layers.append(
                LayerCoverageItem(
                    name="pgda-dem",
                    status="supported",
                    detail=f"Covered by DEM layer '{layer_id}' (ground {ground_m:.2f} m).",
                    version=self._terrain.provenance.version,
                )
            )
        else:
            layers.append(
                LayerCoverageItem(
                    name="pgda-dem",
                    status="outside_coverage",
                    detail=(
                        f"Outside PGDA DEM coverage ({self._terrain.coverage.southDeg}° to "
                        f"{self._terrain.coverage.northDeg}°)."
                    ),
                    version=self._terrain.provenance.version,
                )
            )

        layers.append(
            LayerCoverageItem(
                name="horizon-mask",
                status="supported" if edge_ok else "outside_coverage",
                detail=(
                    "1-degree spherical ray-march available."
                    if edge_ok
                    else "Insufficient terrain extent to compute horizon mask."
                ),
                version=self._terrain.provenance.version,
            )
        )

        if not terrain_ok:
            ephem_mode = "outside_coverage"
            layers.append(
                LayerCoverageItem(
                    name="jpl-horizons-ephemeris",
                    status="outside_coverage",
                    detail="Topocentric ephemeris requires ground elevation within DEM coverage.",
                )
            )
        else:
            ephem_mode = "dynamic_horizons"
            layers.append(
                LayerCoverageItem(
                    name="jpl-horizons-ephemeris",
                    status="dynamic",
                    detail="Served from Q1 2027 precomputed cache or dynamically fetched from JPL Horizons.",
                )
            )

        return CoverageCheckResponse(
            latDeg=lat_v,
            lonDegE=lon_v,
            terrainSupported=terrain_ok,
            horizonSupported=edge_ok,
            ephemerisMode=ephem_mode,
            groundHeightM=ground_m,
            layers=layers,
        )
