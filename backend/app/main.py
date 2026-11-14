"""FastAPI entrypoint for the LunarSight Stage 1 Scientific Backend."""

from __future__ import annotations

from dataclasses import dataclass
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings, load_settings
from .geo import CoordinateValidationError
from .models import (
    CoverageCheckRequest,
    CoverageCheckResponse,
    DemManifest,
    ElevationResponse,
    EphemerisSeries,
    HealthResponse,
    HorizonMask,
    SiteSummary,
)
from .services.coverage import CoverageService
from .services.ephemeris import EphemerisService, OutsideCoverageError, UpstreamEphemerisError
from .services.horizon import HorizonService
from .services.sites import SiteCatalogService
from .services.terrain import TerrainService


@dataclass
class AppServices:
    settings: Settings
    sites: SiteCatalogService
    terrain: TerrainService
    horizon: HorizonService
    ephemeris: EphemerisService
    coverage: CoverageService


def create_app(settings: Settings | None = None) -> FastAPI:
    cfg = settings or load_settings()
    sites_svc = SiteCatalogService(cfg.pilot_src_dir)
    terrain_svc = TerrainService(cfg.pilot_public_dir)
    horizon_svc = HorizonService(cfg.pilot_src_dir, cfg.cache_dir, terrain_svc)
    ephemeris_svc = EphemerisService(
        cfg.pilot_src_dir,
        cfg.cache_dir,
        terrain_svc,
        horizons_url=cfg.horizons_url,
        horizons_timeout_s=cfg.horizons_timeout_s,
    )
    coverage_svc = CoverageService(terrain_svc, ephemeris_svc)

    app = FastAPI(
        title="LunarSight Scientific API",
        version="0.1.0",
        description="Stage 1 modular backend serving PGDA DEMs, horizon masks, and JPL Horizons ephemeris.",
    )
    app.state.services = AppServices(
        settings=cfg,
        sites=sites_svc,
        terrain=terrain_svc,
        horizon=horizon_svc,
        ephemeris=ephemeris_svc,
        coverage=coverage_svc,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cfg.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Dem-Meta"],
    )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            terrainLayers=len(terrain_svc.layers),
            catalogSites=len(sites_svc.list_sites()),
        )

    @app.get("/api/sites", response_model=list[SiteSummary])
    def list_sites() -> list[SiteSummary]:
        return sites_svc.list_sites()

    @app.post("/api/coverage/check", response_model=CoverageCheckResponse)
    def check_coverage(req: CoverageCheckRequest) -> CoverageCheckResponse:
        try:
            return coverage_svc.check(req)
        except CoordinateValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/terrain/manifest", response_model=DemManifest)
    def terrain_manifest() -> DemManifest:
        return terrain_svc.get_manifest(layer_url_prefix="/api/terrain/layers")

    @app.get("/api/terrain/layers/{layer_filename}")
    def terrain_layer_binary(layer_filename: str) -> Response:
        layer_id = layer_filename.removesuffix(".bin")
        layer = terrain_svc.get_layer(layer_id)
        if layer is None:
            raise HTTPException(status_code=404, detail=f"DEM layer '{layer_id}' not found")
        return Response(
            content=layer.raw_bytes,
            media_type="application/octet-stream",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    @app.get("/api/terrain/elevation", response_model=ElevationResponse)
    def terrain_elevation(
        latDeg: float = Query(..., description="Selenographic latitude in degrees"),
        lonDegE: float = Query(..., description="East longitude in degrees"),
    ) -> ElevationResponse:
        try:
            return terrain_svc.query_elevation(latDeg, lonDegE)
        except CoordinateValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/terrain/patch")
    def terrain_patch(
        latDeg: float = Query(..., description="Center latitude in degrees"),
        lonDegE: float = Query(..., description="Center east longitude in degrees"),
        radiusM: float = Query(2000.0, gt=0.0, le=100_000.0, description="Half-width in metres"),
    ) -> Response:
        try:
            patch = terrain_svc.extract_patch(latDeg, lonDegE, radiusM)
        except (CoordinateValidationError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if patch is None:
            raise HTTPException(
                status_code=404,
                detail="Requested coordinates are outside coverage of the PGDA DEM mosaic.",
            )
        meta, raw_bytes = patch
        return Response(
            content=raw_bytes,
            media_type="application/octet-stream",
            headers={
                "X-Dem-Meta": meta.model_dump_json(),
                "Cache-Control": "public, max-age=3600",
            },
        )

    @app.get("/api/horizon", response_model=HorizonMask)
    def horizon_mask(
        latDeg: float = Query(..., description="Observer latitude in degrees"),
        lonDegE: float = Query(..., description="Observer east longitude in degrees"),
        observerHeightM: float = Query(..., ge=0.0, le=1000.0, description="Observer height AGL (m)"),
        siteId: str | None = Query(None, description="Optional catalog site ID"),
    ) -> HorizonMask:
        try:
            mask = horizon_svc.get_horizon_mask(latDeg, lonDegE, observerHeightM, site_id=siteId)
        except (CoordinateValidationError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if mask is None:
            raise HTTPException(
                status_code=404,
                detail="Horizon mask unavailable: observer or horizon rays fall outside terrain coverage.",
            )
        return mask

    @app.get("/api/ephemeris", response_model=EphemerisSeries)
    def ephemeris(
        latDeg: float = Query(..., description="Observer latitude in degrees"),
        lonDegE: float = Query(..., description="Observer east longitude in degrees"),
        startUtcMs: int = Query(..., description="Start epoch in UTC milliseconds"),
        endUtcMs: int = Query(..., description="End epoch in UTC milliseconds"),
        stepSeconds: int = Query(..., ge=60, description="Sampling step in seconds"),
        observerHeightM: float = Query(0.0, ge=0.0, le=1000.0),
        siteId: str | None = Query(None, description="Optional catalog site ID"),
    ) -> EphemerisSeries:
        try:
            return ephemeris_svc.get_ephemeris(
                lat_deg=latDeg,
                lon_deg_e=lonDegE,
                start_utc_ms=startUtcMs,
                end_utc_ms=endUtcMs,
                step_seconds=stepSeconds,
                observer_height_m=observerHeightM,
                site_id=siteId,
            )
        except OutsideCoverageError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except (CoordinateValidationError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except UpstreamEphemerisError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

    return app


app = create_app()
