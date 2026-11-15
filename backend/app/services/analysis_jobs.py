"""Background analysis job coordinator with calc-hash deduplication and cancellation."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
import uuid
import threading
import secrets

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
from .resources import CapacityError, WorkCancelled, checkpoint, work_scope


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
        self._storage.reconcile_interrupted_jobs()
        self._lock = threading.RLock()
        self._active: dict[str, tuple[Future, threading.Event]] = {}
        self._capacity = max_workers + 4
        self._closed = False
        self._executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="ls-job")

    def shutdown(self) -> None:
        with self._lock:
            self._closed = True
            for _, event in self._active.values():
                event.set()
        self._executor.shutdown(wait=True)

    def submit_analysis(self, req: AnalysisRequest) -> AnalysisSubmitResponse:
        validate_scenario_inputs(req.inputs)
        self._terrain.assets.validate_site(req.inputs.site.id, req.inputs.site.latDeg, req.inputs.site.lonDegE)
        canonical = self._terrain.assets.sites.get(req.inputs.site.id)
        inputs = req.inputs.model_copy(update={"site": canonical.model_copy(deep=True)}) if canonical else req.inputs.model_copy(deep=True)
        calc_hash = compute_calc_hash(inputs, self._ephemeris.fingerprint)
        with self._lock:
            if self._closed:
                raise CapacityError("Analysis runtime is shutting down")
            existing = None
            if req.idempotencyKey:
                existing = self._storage.get_job_by_idempotency_key(req.idempotencyKey)
                if existing is not None:
                    if existing.calcHash != calc_hash:
                        raise ValueError("Idempotency key already used for a different scenario")
            cached = self._storage.get_result_by_hash(calc_hash)
            if cached is not None:
                return AnalysisSubmitResponse(status="cached", result=cached)
            if existing is not None:
                return AnalysisSubmitResponse(status="accepted", job=existing)
            if len(self._active) >= self._capacity:
                raise CapacityError("Analysis capacity exhausted (2 running plus 4 queued)")
            cancel_token = secrets.token_urlsafe(32)
            event = threading.Event()
            job = self._storage.create_job(calc_hash, req.idempotencyKey, cancel_token)
            try:
                future = self._executor.submit(self._run_scoped, job.id, calc_hash, inputs, event)
            except RuntimeError:
                self._storage.update_job(job.id, status="failed", error_message="Analysis executor unavailable")
                raise CapacityError("Analysis executor unavailable") from None
            self._active[job.id] = (future, event)
            future.add_done_callback(lambda _: self._release(job.id))
            return AnalysisSubmitResponse(status="accepted", job=job, cancelToken=cancel_token)

    def _release(self, job_id: str) -> None:
        with self._lock:
            self._active.pop(job_id, None)

    def _run_scoped(self, job_id: str, calc_hash: str, inputs: ScenarioInputsModel, event: threading.Event) -> None:
        try:
            with work_scope(event):
                self._run_job(job_id, calc_hash, inputs)
        except WorkCancelled as exc:
            self._storage.update_job(job_id, status="failed", progress=1, error_message=str(exc),
                                     only_if_non_terminal=True)

    def get_job(self, job_id: str) -> AnalysisJobModel | None:
        with self._lock:
            job = self._storage.get_job(job_id)
            if job is not None and job.status in ("queued", "running") and job_id not in self._active:
                return self._storage.update_job(
                    job_id, status="failed", progress=1,
                    error_message="Analysis worker exited without a terminal result; submit a new analysis",
                    only_if_non_terminal=True,
                )
            return job

    def cancel_job(
        self, job_id: str, cancel_token: str | None = None, *, admin: bool = False
    ) -> AnalysisJobModel | None:
        if not admin and not self._storage.authorize_cancel(job_id, cancel_token):
            raise PermissionError("Cancellation capability required")
        with self._lock:
            active = self._active.get(job_id)
            if active is not None:
                active[1].set()
            return self._storage.update_job(
                job_id, status="cancelled",
                error_message="Cancellation requested; in-flight blocking I/O may finish before capacity is released",
                only_if_non_terminal=True,
            )

    def _is_cancelled(self, job_id: str) -> bool:
        job = self._storage.get_job(job_id)
        return job is None or job.status == "cancelled"

    def _fetch_ephemeris_with_tail(self, inputs: ScenarioInputsModel) -> EphemerisSeries:
        checkpoint()
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

        checkpoint()
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
            checkpoint()
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
            checkpoint()
            result = AnalysisResultModel(
                id=f"res_{uuid.uuid4().hex[:12]}",
                calcHash=calc_hash,
                inputs=inputs,
                ephemeris=ephemeris,
                mask=mask,
                analysis=analysis,
                createdAt=datetime.now(timezone.utc).isoformat(),
            )
            # Cancellation and publication share one lock: cancelled work cannot
            # populate the completed cache in a late save/update race.
            with self._lock:
                checkpoint()
                if self._is_cancelled(job_id):
                    return
                saved = self._storage.save_result_idempotent(result)
                self._storage.update_job(
                    job_id, status="succeeded", progress=1.0, result_id=saved.id,
                    only_if_non_terminal=True,
                )
        except WorkCancelled:
            raise
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
