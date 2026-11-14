"""Background analysis job coordinator with calc-hash deduplication and cancellation."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import uuid

from ..geo import CoordinateValidationError
from ..models import (
    AnalysisJobModel,
    AnalysisRequest,
    AnalysisResultModel,
    AnalysisSubmitResponse,
    EphemerisSeries,
    ScenarioInputsModel,
)
from .ephemeris import EphemerisService, OutsideCoverageError, UpstreamEphemerisError
from .horizon import HorizonService
from .storage import SQLiteStorage
from .terrain import TerrainService
from .visibility import analyze_visibility, compute_calc_hash, validate_scenario_inputs


class AnalysisJobService:
    """Runs and caches immutable scenario analyses with observable job lifecycle."""

    def __init__(
        self,
        storage: SQLiteStorage,
        terrain: TerrainService,
        horizon: HorizonService,
        ephemeris: EphemerisService,
        max_workers: int = 2,
    ) -> None:
        self._storage = storage
        self._terrain = terrain
        self._horizon = horizon
        self._ephemeris = ephemeris
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ls-job")

    def shutdown(self) -> None:
        self._executor.shutdown(wait=True)

    def submit_analysis(self, req: AnalysisRequest) -> AnalysisSubmitResponse:
        validate_scenario_inputs(req.inputs)
        calc_hash = compute_calc_hash(req.inputs, self._terrain.provenance.version)

        # 1. Exact immutable cached result
        cached = self._storage.get_result_by_hash(calc_hash)
        if cached is not None:
            return AnalysisSubmitResponse(status="cached", result=cached, job=None)

        # 2. Idempotency token reuse
        if req.idempotencyKey:
            existing_by_key = self._storage.get_job_by_idempotency_key(req.idempotencyKey)
            if existing_by_key is not None:
                if existing_by_key.calcHash != calc_hash:
                    raise ValueError("Idempotency key already used for a different scenario")
                if existing_by_key.status == "succeeded" and existing_by_key.resultId:
                    res = self._storage.get_result_by_id(existing_by_key.resultId)
                    if res is not None:
                        return AnalysisSubmitResponse(status="cached", result=res, job=existing_by_key)
                return AnalysisSubmitResponse(status="accepted", result=None, job=existing_by_key)

        # 3. Deduplicate active identical calculation
        active = self._storage.get_active_job_by_hash(calc_hash)
        if active is not None:
            return AnalysisSubmitResponse(status="accepted", result=None, job=active)

        job = self._storage.create_job(calc_hash=calc_hash, idempotency_key=req.idempotencyKey)
        self._executor.submit(self._run_job, job.id, calc_hash, req.inputs)
        return AnalysisSubmitResponse(status="accepted", result=None, job=job)

    def get_job(self, job_id: str) -> AnalysisJobModel | None:
        return self._storage.get_job(job_id)

    def cancel_job(self, job_id: str) -> AnalysisJobModel | None:
        return self._storage.update_job(
            job_id,
            status="cancelled",
            error_message="Cancelled by user request",
            only_if_non_terminal=True,
        )

    def _is_cancelled(self, job_id: str) -> bool:
        job = self._storage.get_job(job_id)
        return job is None or job.status == "cancelled"

    def _fetch_ephemeris_with_tail(self, inputs: ScenarioInputsModel) -> EphemerisSeries:
        end_utc_ms = inputs.startUtcMs + int(round(inputs.durationDays * 86_400_000))
        series = self._ephemeris.get_ephemeris(
            lat_deg=inputs.site.latDeg,
            lon_deg_e=inputs.site.lonDegE,
            start_utc_ms=inputs.startUtcMs,
            end_utc_ms=end_utc_ms,
            step_seconds=inputs.stepSeconds,
            observer_height_m=inputs.observerHeightM,
            site_id=None if inputs.site.id.startswith("custom:") else inputs.site.id,
        )
        if not series.timesUtcMs or series.timesUtcMs[-1] >= end_utc_ms:
            return series

        tail = self._ephemeris.get_ephemeris(
            lat_deg=inputs.site.latDeg,
            lon_deg_e=inputs.site.lonDegE,
            start_utc_ms=end_utc_ms,
            end_utc_ms=end_utc_ms,
            step_seconds=inputs.stepSeconds,
            observer_height_m=inputs.observerHeightM,
            site_id=None if inputs.site.id.startswith("custom:") else inputs.site.id,
        )
        return series.model_copy(
            update={
                "timesUtcMs": [*series.timesUtcMs, *tail.timesUtcMs],
                "sunAzDeg": [*series.sunAzDeg, *tail.sunAzDeg],
                "sunElDeg": [*series.sunElDeg, *tail.sunElDeg],
                "earthAzDeg": [*series.earthAzDeg, *tail.earthAzDeg],
                "earthElDeg": [*series.earthElDeg, *tail.earthElDeg],
            }
        )

    def _run_job(self, job_id: str, calc_hash: str, inputs: ScenarioInputsModel) -> None:
        if self._is_cancelled(job_id):
            return
        self._storage.update_job(job_id, status="running", progress=0.1, only_if_non_terminal=True)

        try:
            site_id = None if inputs.site.id.startswith("custom:") else inputs.site.id
            mask = self._horizon.get_horizon_mask(
                lat_deg=inputs.site.latDeg,
                lon_deg_e=inputs.site.lonDegE,
                observer_height_m=inputs.observerHeightM,
                site_id=site_id,
            )
            if self._is_cancelled(job_id):
                return
            self._storage.update_job(job_id, progress=0.45, only_if_non_terminal=True)

            ephemeris = self._fetch_ephemeris_with_tail(inputs)
            if self._is_cancelled(job_id):
                return
            self._storage.update_job(job_id, progress=0.8, only_if_non_terminal=True)

            analysis = analyze_visibility(ephemeris, mask)
            result = AnalysisResultModel(
                id=f"res_{uuid.uuid4().hex[:12]}",
                calcHash=calc_hash,
                inputs=inputs,
                ephemeris=ephemeris,
                mask=mask,
                analysis=analysis,
                createdAt=datetime.now(timezone.utc).isoformat(),
            )
            saved = self._storage.save_result_idempotent(result)

            if self._is_cancelled(job_id):
                return
            self._storage.update_job(
                job_id,
                status="succeeded",
                progress=1.0,
                result_id=saved.id,
                only_if_non_terminal=True,
            )
        except OutsideCoverageError as exc:
            self._storage.update_job(
                job_id,
                status="failed",
                progress=1.0,
                error_message=str(exc),
                outside_coverage=True,
                only_if_non_terminal=True,
            )
        except (CoordinateValidationError, ValueError, UpstreamEphemerisError) as exc:
            self._storage.update_job(
                job_id,
                status="failed",
                progress=1.0,
                error_message=str(exc),
                outside_coverage="outside" in str(exc).lower() and "coverage" in str(exc).lower(),
                only_if_non_terminal=True,
            )
        except Exception as exc:  # pragma: no cover - defensive guard
            self._storage.update_job(
                job_id,
                status="failed",
                progress=1.0,
                error_message=f"Internal analysis failure: {exc}",
                outside_coverage=False,
                only_if_non_terminal=True,
            )
