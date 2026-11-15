"""Stage 3 tests: evidence-linked AI Advisor deterministic, LLM, fallback, and 404 contracts."""

from __future__ import annotations

import json
from pathlib import Path
import time
from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

from app.config import Settings, load_settings
from app.main import create_app


def _make_settings(tmp_path: Path, llm_api_key: str | None = None) -> Settings:
    base = load_settings()
    return Settings(
        pilot_public_dir=base.pilot_public_dir,
        pilot_src_dir=base.pilot_src_dir,
        cache_dir=tmp_path / "cache",
        db_path=tmp_path / "cache" / "advisor_test.db",
        cors_origins=("http://127.0.0.1:5173",),
        horizons_url=base.horizons_url,
        horizons_timeout_s=10.0,
        llm_api_key=llm_api_key,
        admin_token="offline-test-administrator-token-32chars",
    )


def _create_sample_result(client: TestClient) -> str:
    sites = client.get("/api/sites").json()
    site04 = next(s for s in sites if s["id"] == "site-04")
    sub = client.post(
        "/api/analyses",
        json={
            "inputs": {
                "site": site04,
                "startUtcMs": 1_798_761_600_000,
                "durationDays": 2,
                "stepSeconds": 3600,
                "observerHeightM": 1,
            }
        },
    )
    if sub.status_code == 200:
        return sub.json()["result"]["id"]
    job_id = sub.json()["job"]["id"]
    for _ in range(100):
        job = client.get(f"/api/analysis-jobs/{job_id}").json()
        if job["status"] == "succeeded":
            return job["resultId"]
        time.sleep(0.05)
    raise AssertionError("Sample analysis job did not finish")


def test_advisor_deterministic_and_missing_result(tmp_path: Path) -> None:
    with TestClient(create_app(_make_settings(tmp_path, llm_api_key=None))) as client:
        client.headers["Authorization"] = "Bearer offline-test-administrator-token-32chars"
        missing = client.post("/api/advisor-responses", json={"resultId": "res_missing"})
        assert missing.status_code == 404

        result_id = _create_sample_result(client)
        resp = client.post(
            "/api/advisor-responses",
            json={"resultId": result_id, "language": "vi"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["resultId"] == result_id
        assert body["mode"] == "deterministic"
        assert body["providerUnavailable"] is False
        assert len(body["citations"]) >= 4
        assert len(body["limitations"]) >= 2
        assert "100.0%" in body["summary"]


def test_advisor_llm_success_and_recoverable_fallback(tmp_path: Path) -> None:
    with TestClient(create_app(_make_settings(tmp_path, llm_api_key="test-key"))) as client:
        client.headers["Authorization"] = "Bearer offline-test-administrator-token-32chars"
        result_id = _create_sample_result(client)
        metrics = client.get(f"/api/analysis-results/{result_id}").json()["analysis"]["metrics"]

        class FakeOk:
            def raise_for_status(self) -> None:
                return None

            def iter_content(self, chunk_size: int):
                yield json.dumps({"choices": [{"message": {"content": json.dumps({
                    "summary": "Site 04 shows continuous illumination over 48.0 h.",
                    "recommendations": ["Verify 0.25 m mast sensitivity."],
                    "facts": metrics,
                })}}]}).encode()

            def close(self) -> None:
                pass

        with patch("app.services.advisor.requests.post", return_value=FakeOk()) as mock_post:
            ok_resp = client.post(
                "/api/advisor-responses",
                json={"resultId": result_id, "question": "Evaluate illumination", "language": "en"},
            )
            assert ok_resp.status_code == 200
            assert mock_post.call_count == 1
            ok_body = ok_resp.json()
            assert ok_body["mode"] == "llm"
            assert ok_body["providerUnavailable"] is False
            assert "48.0 h" in ok_body["summary"]
            assert ok_body["unverifiedProviderSummary"] == "Site 04 shows continuous illumination over 48.0 h."
            assert ok_body["recommendations"] != ok_body["unverifiedProviderRecommendations"]

        # Recoverable fallback when external LLM fails
        with patch("app.services.advisor.requests.post", side_effect=RuntimeError("Upstream timeout")):
            fb_resp = client.post(
                "/api/advisor-responses",
                json={"resultId": result_id, "language": "en"},
            )
            assert fb_resp.status_code == 200
            fb_body = fb_resp.json()
            assert fb_body["mode"] == "deterministic_fallback"
            assert fb_body["providerUnavailable"] is True
            assert "deterministic summary preserved" in fb_body["providerError"]
            assert "100.0%" in fb_body["summary"]
