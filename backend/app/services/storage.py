"""Thread-safe SQLite repository for immutable results, analysis jobs, and saved scenarios."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
import uuid

from ..models import (
    AnalysisJobModel,
    AnalysisResultModel,
    JobStatus,
    SavedScenarioDetail,
    SavedScenarioSummary,
    SaveScenarioRequest,
    ScenarioInputsModel,
    WindowMetrics,
)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class SQLiteStorage:
    """Persistent store for analysis results, jobs, and user-saved scenarios."""

    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(str(db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._init_schema()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS analysis_results (
                id TEXT PRIMARY KEY,
                calc_hash TEXT UNIQUE NOT NULL,
                inputs_json TEXT NOT NULL,
                metrics_json TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analysis_jobs (
                id TEXT PRIMARY KEY,
                calc_hash TEXT NOT NULL,
                idempotency_key TEXT,
                status TEXT NOT NULL,
                progress REAL NOT NULL,
                result_id TEXT,
                error_message TEXT,
                outside_coverage INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_jobs_calc_hash ON analysis_jobs(calc_hash);
            CREATE INDEX IF NOT EXISTS idx_jobs_idemp ON analysis_jobs(idempotency_key);

            CREATE TABLE IF NOT EXISTS scenarios (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                notes TEXT,
                inputs_json TEXT NOT NULL,
                result_id TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(result_id) REFERENCES analysis_results(id) ON DELETE SET NULL
            );
            """
        )
        self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    # --- Immutable Analysis Results ---

    def get_result_by_hash(self, calc_hash: str) -> AnalysisResultModel | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT payload_json FROM analysis_results WHERE calc_hash = ?",
                (calc_hash,),
            ).fetchone()
        if row is None:
            return None
        return AnalysisResultModel.model_validate_json(row["payload_json"])

    def get_result_by_id(self, result_id: str) -> AnalysisResultModel | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT payload_json FROM analysis_results WHERE id = ?",
                (result_id,),
            ).fetchone()
        if row is None:
            return None
        return AnalysisResultModel.model_validate_json(row["payload_json"])

    def save_result_idempotent(self, result: AnalysisResultModel) -> AnalysisResultModel:
        """Atomically persist result by calc_hash; returns existing record on race."""
        inputs_json = result.inputs.model_dump_json()
        metrics_json = result.analysis.metrics.model_dump_json()
        payload_json = result.model_dump_json()
        with self._lock:
            self._conn.execute(
                """
                INSERT OR IGNORE INTO analysis_results
                    (id, calc_hash, inputs_json, metrics_json, payload_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    result.id,
                    result.calcHash,
                    inputs_json,
                    metrics_json,
                    payload_json,
                    result.createdAt,
                ),
            )
            self._conn.commit()
            row = self._conn.execute(
                "SELECT payload_json FROM analysis_results WHERE calc_hash = ?",
                (result.calcHash,),
            ).fetchone()
        assert row is not None
        return AnalysisResultModel.model_validate_json(row["payload_json"])

    # --- Analysis Jobs ---

    @staticmethod
    def _row_to_job(row: sqlite3.Row) -> AnalysisJobModel:
        return AnalysisJobModel(
            id=row["id"],
            calcHash=row["calc_hash"],
            status=row["status"],
            progress=float(row["progress"]),
            resultId=row["result_id"],
            errorMessage=row["error_message"],
            outsideCoverage=bool(row["outside_coverage"]),
            createdAt=row["created_at"],
            updatedAt=row["updated_at"],
        )

    def get_job(self, job_id: str) -> AnalysisJobModel | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM analysis_jobs WHERE id = ?",
                (job_id,),
            ).fetchone()
        return None if row is None else self._row_to_job(row)

    def get_active_job_by_hash(self, calc_hash: str) -> AnalysisJobModel | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT * FROM analysis_jobs
                WHERE calc_hash = ? AND status IN ('queued', 'running')
                ORDER BY created_at DESC LIMIT 1
                """,
                (calc_hash,),
            ).fetchone()
        return None if row is None else self._row_to_job(row)

    def get_job_by_idempotency_key(self, idempotency_key: str) -> AnalysisJobModel | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT * FROM analysis_jobs
                WHERE idempotency_key = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (idempotency_key,),
            ).fetchone()
        return None if row is None else self._row_to_job(row)

    def create_job(self, calc_hash: str, idempotency_key: str | None = None) -> AnalysisJobModel:
        now = _utc_now_iso()
        job = AnalysisJobModel(
            id=f"job_{uuid.uuid4().hex[:12]}",
            calcHash=calc_hash,
            status="queued",
            progress=0.0,
            resultId=None,
            errorMessage=None,
            outsideCoverage=False,
            createdAt=now,
            updatedAt=now,
        )
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO analysis_jobs
                    (id, calc_hash, idempotency_key, status, progress, result_id, error_message, outside_coverage, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job.id,
                    job.calcHash,
                    idempotency_key,
                    job.status,
                    job.progress,
                    None,
                    None,
                    0,
                    job.createdAt,
                    job.updatedAt,
                ),
            )
            self._conn.commit()
        return job

    def update_job(
        self,
        job_id: str,
        *,
        status: JobStatus | None = None,
        progress: float | None = None,
        result_id: str | None = None,
        error_message: str | None = None,
        outside_coverage: bool | None = None,
        only_if_non_terminal: bool = False,
    ) -> AnalysisJobModel | None:
        now = _utc_now_iso()
        with self._lock:
            row = self._conn.execute("SELECT * FROM analysis_jobs WHERE id = ?", (job_id,)).fetchone()
            if row is None:
                return None
            if only_if_non_terminal and row["status"] in ("succeeded", "failed", "cancelled"):
                return self._row_to_job(row)

            next_status = status if status is not None else row["status"]
            next_progress = progress if progress is not None else row["progress"]
            next_result_id = result_id if result_id is not None else row["result_id"]
            next_error = error_message if error_message is not None else row["error_message"]
            next_outside = (
                int(outside_coverage) if outside_coverage is not None else row["outside_coverage"]
            )
            self._conn.execute(
                """
                UPDATE analysis_jobs
                SET status = ?, progress = ?, result_id = ?, error_message = ?, outside_coverage = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    next_status,
                    next_progress,
                    next_result_id,
                    next_error,
                    next_outside,
                    now,
                    job_id,
                ),
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM analysis_jobs WHERE id = ?", (job_id,)).fetchone()
        return None if updated is None else self._row_to_job(updated)

    # --- Saved Scenarios ---

    def count_scenarios(self) -> int:
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS cnt FROM scenarios").fetchone()
        return int(row["cnt"]) if row else 0

    def create_scenario(self, req: SaveScenarioRequest) -> SavedScenarioSummary:
        scenario_id = f"scn_{uuid.uuid4().hex[:10]}"
        now = _utc_now_iso()
        metrics: WindowMetrics | None = None
        valid_result_id: str | None = None

        if req.resultId:
            res = self.get_result_by_id(req.resultId)
            if res is not None:
                valid_result_id = res.id
                metrics = res.analysis.metrics

        with self._lock:
            self._conn.execute(
                """
                INSERT INTO scenarios (id, title, notes, inputs_json, result_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    scenario_id,
                    req.title.strip(),
                    req.notes.strip() if req.notes else None,
                    req.inputs.model_dump_json(),
                    valid_result_id,
                    now,
                ),
            )
            self._conn.commit()

        return SavedScenarioSummary(
            id=scenario_id,
            title=req.title.strip(),
            notes=req.notes.strip() if req.notes else None,
            inputs=req.inputs,
            resultId=valid_result_id,
            metrics=metrics,
            createdAt=now,
        )

    def list_scenarios(self) -> list[SavedScenarioSummary]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT s.*, r.metrics_json
                FROM scenarios s
                LEFT JOIN analysis_results r ON s.result_id = r.id
                ORDER BY s.created_at DESC
                """
            ).fetchall()
        summaries: list[SavedScenarioSummary] = []
        for row in rows:
            metrics = (
                WindowMetrics.model_validate_json(row["metrics_json"])
                if row["metrics_json"]
                else None
            )
            summaries.append(
                SavedScenarioSummary(
                    id=row["id"],
                    title=row["title"],
                    notes=row["notes"],
                    inputs=ScenarioInputsModel.model_validate_json(row["inputs_json"]),
                    resultId=row["result_id"],
                    metrics=metrics,
                    createdAt=row["created_at"],
                )
            )
        return summaries

    def get_scenario(self, scenario_id: str) -> SavedScenarioDetail | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM scenarios WHERE id = ?",
                (scenario_id,),
            ).fetchone()
        if row is None:
            return None
        result = self.get_result_by_id(row["result_id"]) if row["result_id"] else None
        return SavedScenarioDetail(
            id=row["id"],
            title=row["title"],
            notes=row["notes"],
            inputs=ScenarioInputsModel.model_validate_json(row["inputs_json"]),
            result=result,
            createdAt=row["created_at"],
        )

    def delete_scenario(self, scenario_id: str) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM scenarios WHERE id = ?", (scenario_id,))
            self._conn.commit()
            return cur.rowcount > 0
