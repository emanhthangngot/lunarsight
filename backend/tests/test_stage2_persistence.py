"""Stage 2 tests: visibility parity, SQLite persistence, background jobs, cancellation, and scenarios."""

from __future__ import annotations

from pathlib import Path
import time
from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest

from app.config import Settings, load_settings
from app.main import create_app
from app.models import EphemerisSeries, HorizonMask, Provenance
from app.services.visibility import analyze_visibility


@pytest.fixture()
def client(tmp_path: Path):
    base = load_settings()
    settings = Settings(
        pilot_public_dir=base.pilot_public_dir,
        pilot_src_dir=base.pilot_src_dir,
        cache_dir=tmp_path / "cache",
        db_path=tmp_path / "cache" / "test.db",
        cors_origins=("http://127.0.0.1:5173",),
        horizons_url=base.horizons_url,
        horizons_timeout_s=10.0,
    )
    app = create_app(settings)
    with TestClient(app) as tc:
        yield tc


def _poll_until_terminal(client: TestClient, job_id: str, timeout_s: float = 10.0) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        resp = client.get(f"/api/analysis-jobs/{job_id}")
        assert resp.status_code == 200
        job = resp.json()
        if job["status"] in ("succeeded", "failed", "cancelled"):
            return job
        time.sleep(0.05)
    raise AssertionError(f"Job {job_id} did not finish within {timeout_s}s")


def test_visibility_analysis_matches_contract_and_preserves_unknowns() -> None:
    prov = Provenance(kind="processed", source="test", version="1", generatedAt="2026-11-14T00:00:00Z")
    series = EphemerisSeries(
        siteId="site-test",
        frame="MOON_ME",
        startUtcMs=0,
        stepSeconds=3600,
        timesUtcMs=[0, 3_600_000, 7_200_000, 10_800_000],
        sunAzDeg=[0.0, 90.0, 180.0, 270.0],
        sunElDeg=[2.0, 0.5, 0.5, 3.0],
        earthAzDeg=[0.0, 90.0, 180.0, 270.0],
        earthElDeg=[5.0, 5.0, -1.0, 5.0],
        provenance=prov,
    )
    mask = HorizonMask(
        siteId="site-test",
        observerHeightM=2.5,
        azimuthsDeg=[0.0, 90.0, 180.0, 270.0],
        elevationsDeg=[1.0, 0.5, 0.0, 1.0],
        maxRangeM=150_000.0,
        provenance=prov,
    )
    analysis = analyze_visibility(series, mask)
    # Strict '>' comparison: 0.5 > 0.5 is False; 0.5 > 0.0 is True
    assert analysis.sunVisible == [True, False, True, True]
    assert analysis.earthVisible == [True, True, False, True]
    assert analysis.both == [True, False, False, True]
    assert analysis.metrics.windowHours == pytest.approx(3.0)
    assert analysis.metrics.sunlitHours == pytest.approx(2.0)
    assert analysis.metrics.longestDarknessHours == pytest.approx(1.0)

    # Missing mask produces None (never 0)
    unknown = analyze_visibility(series, None)
    assert unknown.sunVisible == [None, None, None, None]
    assert unknown.metrics.sunlitPercent is None
    assert unknown.metrics.longestDarknessHours is None


def test_analysis_job_execution_cache_hit_and_scenarios(client: TestClient) -> None:
    sites = client.get("/api/sites").json()
    site04 = next(s for s in sites if s["id"] == "site-04")
    inputs = {
        "site": site04,
        "startUtcMs": 1_798_761_600_000,  # 2027-01-01T00:00:00Z
        "durationDays": 2,
        "stepSeconds": 3600,
        "observerHeightM": 2.5,
    }

    # First submission queues background job (202 Accepted)
    sub1 = client.post("/api/analyses", json={"inputs": inputs, "idempotencyKey": "req-1"})
    assert sub1.status_code == 202
    body1 = sub1.json()
    assert body1["status"] == "accepted"
    job = _poll_until_terminal(client, body1["job"]["id"])
    assert job["status"] == "succeeded"
    result_id = job["resultId"]
    assert result_id.startswith("res_")

    # Fetch immutable result
    res_resp = client.get(f"/api/analysis-results/{result_id}")
    assert res_resp.status_code == 200
    result = res_resp.json()
    assert result["analysis"]["metrics"]["windowHours"] == pytest.approx(48.0)

    # Second submission hits immutable cache immediately (200 OK)
    sub2 = client.post("/api/analyses", json={"inputs": inputs})
    assert sub2.status_code == 200
    assert sub2.json()["status"] == "cached"
    assert sub2.json()["result"]["id"] == result_id

    # Save scenario linked to resultId, list, get detail, delete
    created = client.post(
        "/api/scenarios",
        json={
            "title": "Connecting Ridge 48h Check",
            "notes": "Stage 2 smoke scenario",
            "inputs": inputs,
            "resultId": result_id,
        },
    )
    assert created.status_code == 201
    scn = created.json()
    assert scn["id"].startswith("scn_")
    assert scn["resultId"] == result_id

    listed = client.get("/api/scenarios")
    assert listed.status_code == 200
    assert any(item["id"] == scn["id"] for item in listed.json())

    detail = client.get(f"/api/scenarios/{scn['id']}")
    assert detail.status_code == 200
    assert detail.json()["result"]["id"] == result_id

    deleted = client.delete(f"/api/scenarios/{scn['id']}")
    assert deleted.status_code == 204
    assert client.get(f"/api/scenarios/{scn['id']}").status_code == 404


def test_analysis_job_outside_coverage_and_cancellation(client: TestClient) -> None:
    sites = client.get("/api/sites").json()
    base_site = sites[0]
    outside_inputs = {
        "site": {**base_site, "id": "custom:-80:0", "category": "custom", "latDeg": -80.0, "lonDegE": 0.0, "nameVerified": False},
        "startUtcMs": 1_798_761_600_000,
        "durationDays": 1,
        "stepSeconds": 3600,
        "observerHeightM": 2.5,
    }
    sub = client.post("/api/analyses", json={"inputs": outside_inputs})
    assert sub.status_code == 202
    job = _poll_until_terminal(client, sub.json()["job"]["id"])
    assert job["status"] == "failed"
    assert job["outsideCoverage"] is True
    assert "outside coverage" in job["errorMessage"].lower()

    # Cancellation during slow upstream Horizons call
    slow_inputs = {
        "site": {**base_site, "id": "custom:-89.1:15", "category": "custom", "latDeg": -89.1, "lonDegE": 15.0, "nameVerified": False},
        "startUtcMs": 1_830_297_600_000,
        "durationDays": 1,
        "stepSeconds": 3600,
        "observerHeightM": 2.5,
    }

    def slow_horizons(*args, **kwargs):
        time.sleep(0.35)
        raise RuntimeError("Should not complete after cancel")

    with patch("app.services.ephemeris.requests.get", side_effect=slow_horizons):
        sub_slow = client.post("/api/analyses", json={"inputs": slow_inputs})
        assert sub_slow.status_code == 202
        job_id = sub_slow.json()["job"]["id"]
        time.sleep(0.05)
        cancelled = client.post(f"/api/analysis-jobs/{job_id}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        final_job = _poll_until_terminal(client, job_id)
        assert final_job["status"] == "cancelled"
