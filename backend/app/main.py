"""FastAPI entrypoint for the LunarSight Scientific Backend (Stage 1 + Stage 2)."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .geo import CoordinateValidationError
from .models import (
    AnalysisJobModel,
    AnalysisRequest,
    AnalysisResultModel,
    AnalysisSubmitResponse,
    CoverageCheckRequest,
    CoverageCheckResponse,
    DemManifest,
    ElevationResponse,
    EphemerisSeries,
    HealthResponse,
    HorizonMask,
    SavedScenarioDetail,
    SavedScenarioSummary,
    SaveScenarioRequest,
    SiteSummary,
)
from .services.analysis_jobs import AnalysisJobService
from .services.coverage import CoverageService
from .services.ephemeris import EphemerisService, OutsideCoverageError, UpstreamEphemerisError
from .services.horizon import HorizonService
from .services.sites import SiteCatalogService
from .services.storage import SQLiteStorage
from .services.terrain import TerrainService


@dataclass
class AppServices:
    settings: Settings
    sites: SiteCatalogService
    terrain: TerrainService
    horizon: HorizonService
    ephemeris: EphemerisService
    coverage: CoverageService
    storage: SQLiteStorage
    jobs: AnalysisJobService


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
    storage_svc = SQLiteStorage(cfg.db_path)
    jobs_svc = AnalysisJobService(storage_svc, terrain_svc, horizon_svc, ephemeris_svc)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        try:
            yield
        finally:
            jobs_svc.shutdown()
            storage_svc.close()

    app = FastAPI(
        title="LunarSight Scientific API",
        version="0.2.0",
        description=(
            "Modular backend serving PGDA DEMs, horizon masks, JPL Horizons ephemeris, "
            "SQLite-backed immutable analysis results, jobs, and saved scenarios."
        ),
        lifespan=lifespan,
    )
    app.state.services = AppServices(
        settings=cfg,
        sites=sites_svc,
        terrain=terrain_svc,
        horizon=horizon_svc,
        ephemeris=ephemeris_svc,
        coverage=coverage_svc,
        storage=storage_svc,
        jobs=jobs_svc,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(cfg.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Dem-Meta"],
    )

    @app.get("/api/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(
            terrainLayers=len(terrain_svc.layers),
            catalogSites=len(sites_svc.list_sites()),
            savedScenarios=storage_svc.count_scenarios(),
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

    # --- Stage 2: Immutable Analyses, Jobs, and Saved Scenarios ---

    @app.post("/api/analyses", response_model=AnalysisSubmitResponse)
    def submit_analysis(req: AnalysisRequest) -> Response:
        try:
            outcome = jobs_svc.submit_analysis(req)
        except (CoordinateValidationError, ValueError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        status_code = 200 if outcome.status == "cached" else 202
        return JSONResponse(content=outcome.model_dump(mode="json"), status_code=status_code)

    @app.get("/api/analysis-jobs/{job_id}", response_model=AnalysisJobModel)
    def get_analysis_job(job_id: str) -> AnalysisJobModel:
        job = jobs_svc.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Analysis job '{job_id}' not found")
        return job

    @app.post("/api/analysis-jobs/{job_id}/cancel", response_model=AnalysisJobModel)
    def cancel_analysis_job(job_id: str) -> AnalysisJobModel:
        job = jobs_svc.cancel_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Analysis job '{job_id}' not found")
        return job

    @app.get("/api/analysis-results/{result_id}", response_model=AnalysisResultModel)
    def get_analysis_result(result_id: str) -> AnalysisResultModel:
        result = storage_svc.get_result_by_id(result_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Analysis result '{result_id}' not found")
        return result

    @app.get("/api/scenarios", response_model=list[SavedScenarioSummary])
    def list_scenarios() -> list[SavedScenarioSummary]:
        return storage_svc.list_scenarios()

    @app.post("/api/scenarios", response_model=SavedScenarioSummary, status_code=201)
    def create_scenario(req: SaveScenarioRequest) -> SavedScenarioSummary:
        try:
            return storage_svc.create_scenario(req)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    @app.get("/api/scenarios/{scenario_id}", response_model=SavedScenarioDetail)
    def get_scenario(scenario_id: str) -> SavedScenarioDetail:
        scenario = storage_svc.get_scenario(scenario_id)
        if scenario is None:
            raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")
        return scenario

    @app.delete("/api/scenarios/{scenario_id}", status_code=204)
    def delete_scenario(scenario_id: str) -> Response:
        deleted = storage_svc.delete_scenario(scenario_id)
        if not deleted:
            raise HTTPException(status_code=404, detail=f"Scenario '{scenario_id}' not found")
        return Response(status_code=204)

    return app


app = create_app()
