"""Offline task34 B1–B9 counterexamples; synthetic values are not lunar references.

Existing API/visibility tests retain the numerical oracles. These fixtures protect
identity, resource/security boundaries and untrusted input, which they did not cover.
"""
from __future__ import annotations

from dataclasses import replace
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import threading
from unittest.mock import patch

from fastapi.testclient import TestClient
import numpy as np
import pytest

from app.config import Settings
from app.main import create_app
from app.models import AnalysisRequest, EphemerisSeries, ObserverMetadata, SaveScenarioRequest
from app.services.assets import ScienceAssets
from app.services.ephemeris import UpstreamEphemerisError, _resample_series
from app.services.resources import Admission, BoundedHttp, CapacityError, JsonCache
from app.services.storage import SQLiteStorage

START = 1_798_761_600_000
ADMIN = "offline-only-administrator-capability-32chars"


@pytest.fixture(autouse=True)
def deny_unmocked_network():
    with patch("requests.get", side_effect=AssertionError("Unmocked upstream I/O is forbidden")), \
         patch("requests.post", side_effect=AssertionError("Unmocked provider I/O is forbidden")):
        yield

@pytest.fixture()
def settings(tmp_path: Path) -> Settings:
    public, src = tmp_path / "public", tmp_path / "src"
    public.mkdir()
    src.mkdir()
    provenance = {"kind": "processed", "source": "synthetic offline fixture", "version": "same-version",
                  "generatedAt": "2026-01-01T00:00:00Z", "notes": "Site 04 — Connecting Ridge (legacy wrong label)"}
    site = {"id": "site-04", "name": "Site 04 — Shackleton rim", "category": "artemis-candidate",
            "latDeg": -89.785092, "lonDegE": 204.018283, "nameVerified": False, "provenance": provenance}
    (src / "sites.json").write_text(json.dumps([site]))
    observer = {"latDeg": site["latDeg"], "lonDegE": site["lonDegE"], "observerHeightM": 1,
                "groundHeightM": None, "ellipsoidAltitudeKm": None, "datumStatus": "conditional",
                "metadataOrigin": "legacy-pipeline-height"}
    (src / "observerMetadata.json").write_text(json.dumps({"version": "pilot-observer-metadata-v1", "sites": {"site-04": observer}}))
    layer = {"id": "synthetic", "url": "synthetic.bin", "xMinM": -10_000, "yMaxM": 10_000,
             "spacingM": 1000, "rows": 20, "cols": 20, "minHeightM": 100, "maxHeightM": 100,
             "source": "synthetic constant ground"}
    layer["url"] = "terrain_synthetic.bin"
    (public / "terrain_synthetic.bin").write_bytes(np.full((20, 20), 100, dtype="<f4").tobytes())
    (public / "terrain_manifest.json").write_text(json.dumps({"version": "same-version", "provenance": provenance,
        "coverage": {"southDeg": -90, "northDeg": -78, "westDegE": 0, "eastDegE": 360}, "layers": [layer]}))
    (public / "ephemeris_site-04.json").write_text(json.dumps({"siteId": "site-04", "frame": "MOON_ME",
        "startUtcMs": START, "stepSeconds": 3600, "timesUtcMs": [START, START + 3_600_000, START + 7_200_000],
        "sunAzDeg": [350, 10, 30], "sunElDeg": [1, 2, 3], "earthAzDeg": [0, 10, 20], "earthElDeg": [2, 3, 4],
        "provenance": provenance}))
    (public / "horizon_site-04.json").write_text(json.dumps({"siteId": "site-04", "azimuthsDeg": [0, 90, 180, 270],
        "heights": {"1": [0, 0, 0, 0], "2.5": [0, 0, 0, 0]}, "maxRangeM": 150_000, "provenance": provenance}))
    return Settings(public, src, tmp_path / "cache", tmp_path / "cache" / "test.db", (), "https://offline.invalid", 1,
                    admin_token=ADMIN)


def inputs(client: TestClient) -> dict:
    return {"site": client.get("/api/sites").json()[0], "startUtcMs": START, "durationDays": 1 / 24,
            "stepSeconds": 3600, "observerHeightM": 1}


def params() -> dict:
    return {"siteId": "site-04", "latDeg": -89.785092, "lonDegE": 204.018283,
            "observerHeightM": 1, "startUtcMs": START, "endUtcMs": START + 3_600_000, "stepSeconds": 3600}

def finish_job(services, receipt) -> None:
    with services.jobs._lock:
        active = services.jobs._active.get(receipt.job.id)
    if active is not None:
        active[0].result(timeout=5)
    assert services.jobs.get_job(receipt.job.id).status == "succeeded"



class JsonResponse:
    def __init__(self, payload):
        self.payload = payload
        self.closed = False

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size):
        yield json.dumps(self.payload).encode()

    def close(self):
        self.closed = True


def test_catalog_coordinates_checked_before_presets(settings):
    with TestClient(create_app(settings)) as client, patch("app.services.ephemeris.requests.get") as upstream:
        for endpoint in ("horizon", "ephemeris"):
            response = client.get(f"/api/{endpoint}", params={**params(), "latDeg": 0, "lonDegE": 0})
            assert response.status_code == 422
            assert "canonical" in response.json()["detail"]
        assert not upstream.called
        # Normalized negative longitude is the same observer, not another site.
        response = client.get("/api/ephemeris", params={**params(), "lonDegE": 204.018283 - 360})
        assert response.status_code == 200
        series = response.json()
        assert series["observer"]["observerHeightM"] == 1
        assert series["observer"]["groundHeightM"] is None
        assert series["observer"]["ellipsoidAltitudeKm"] is None
        assert "Connecting Ridge" not in series["provenance"]["notes"]
        assert "Shackleton rim" in series["provenance"]["notes"]
        assert not upstream.called
        request = inputs(client)
        request["site"]["latDeg"] = 0
        assert client.post("/api/analyses", json={"inputs": request}).status_code == 422


def test_other_height_queries_actual_ground_plus_height(settings):
    response = JsonResponse({"result": "$$SOE\n2027-Jan-01 00:00, , , 20, 4\n2027-Jan-01 01:00, , , 30, 5\n$$EOE"})
    with TestClient(create_app(settings)) as client, patch("app.services.ephemeris.requests.get", return_value=response) as get:
        result = client.get("/api/ephemeris", params={**params(), "observerHeightM": 10})
        assert result.status_code == 200
        assert get.call_count == 2
        coordinate = get.call_args.kwargs["params"]["SITE_COORD"]
        assert float(coordinate.split(",")[2]) == pytest.approx(0.110)
        observer = result.json()["observer"]
        assert observer["observerHeightM"] == 10
        assert observer["groundHeightM"] == pytest.approx(100)
        assert observer["ellipsoidAltitudeKm"] == pytest.approx(0.110)
        assert observer["metadataOrigin"] == "runtime-dem-query"
        assert client.get("/api/ephemeris", params={**params(), "observerHeightM": 10}).status_code == 200
        assert get.call_count == 2


@pytest.mark.parametrize("asset", ["terrain_synthetic.bin", "ephemeris_site-04.json", "horizon_site-04.json", "terrain_manifest.json", "sites.json", "observerMetadata.json"])
def test_same_version_changed_bytes_change_snapshot_identity(settings, asset):
    before = ScienceAssets(settings.pilot_public_dir, settings.pilot_src_dir)
    directory = settings.pilot_src_dir if asset in {"sites.json", "observerMetadata.json"} else settings.pilot_public_dir
    path = directory / asset
    original = path.read_bytes()
    changed = (np.full((20, 20), 101, dtype="<f4").tobytes() if asset.endswith(".bin") else original + b"\n")
    path.write_bytes(changed)
    after = ScienceAssets(settings.pilot_public_dir, settings.pilot_src_dir)
    assert before.fingerprint != after.fingerprint
    assert before.bytes[asset] == original
    assert after.bytes[asset] == changed


def test_lazy_terrain_and_ephemeris_never_read_changed_live_bytes(settings):
    app = create_app(settings)
    (settings.pilot_public_dir / "terrain_synthetic.bin").write_bytes(np.full((20, 20), 999, dtype="<f4").tobytes())
    payload = json.loads((settings.pilot_public_dir / "ephemeris_site-04.json").read_text())
    payload["sunElDeg"] = [50, 50, 50]
    (settings.pilot_public_dir / "ephemeris_site-04.json").write_text(json.dumps(payload))
    with TestClient(app) as client:
        assert client.get("/api/terrain/elevation", params=params()).json()["heightM"] == 100
        assert client.get("/api/ephemeris", params=params()).json()["sunElDeg"] == [1, 2]


def test_persistent_result_and_horizon_cache_invalidate_on_asset_rollover(settings):
    with TestClient(create_app(settings)) as client:
        services = client.app.state.services
        request = AnalysisRequest(inputs=inputs(client))
        # Synchronous invocation here keeps the storage rollover fixture deterministic.
        receipt = services.jobs.submit_analysis(request)
        finish_job(services, receipt)
        first = services.jobs.get_job(receipt.job.id)
        assert first.status == "succeeded"
        old_result = services.storage.get_result_by_id(first.resultId)
        with patch.object(services.horizon, "_ray_march", return_value=old_result.mask.model_copy(update={"observerHeightM": 4.2})) as march:
            services.horizon.get_horizon_mask(-89.785092, 204.018283, 4.2, "site-04")
            assert march.called
    path = settings.pilot_public_dir / "ephemeris_site-04.json"
    doc = json.loads(path.read_text())
    doc["sunElDeg"] = [7, 8, 9]
    path.write_text(json.dumps(doc))
    with TestClient(create_app(settings)) as client:
        services = client.app.state.services
        receipt = services.jobs.submit_analysis(AnalysisRequest(inputs=inputs(client)))
        assert receipt.status == "accepted"
        finish_job(services, receipt)
        result = services.storage.get_result_by_id(services.jobs.get_job(receipt.job.id).resultId)
        assert result.calcHash != old_result.calcHash
        assert result.ephemeris.sunElDeg == [7, 8]
        with patch.object(services.horizon, "_ray_march", return_value=result.mask.model_copy(update={"observerHeightM": 4.2})) as march:
            services.horizon.get_horizon_mask(-89.785092, 204.018283, 4.2, "site-04")
            assert march.called


def test_restart_reconciles_queued_and_running_rows(settings):
    storage = SQLiteStorage(settings.db_path)
    queued = storage.create_job("old-a", "old-key")
    running = storage.create_job("old-b")
    storage.update_job(running.id, status="running")
    storage.close()
    with TestClient(create_app(settings)) as client:
        for job in (queued, running):
            row = client.get(f"/api/analysis-jobs/{job.id}").json()
            assert row["status"] == "failed"
            assert "restart" in row["errorMessage"]


def test_independent_admission_and_cancellation_capabilities(settings):
    app = create_app(settings)
    blocked = threading.Event()
    release = threading.Event()
    entered = 0
    lock = threading.Lock()
    def hold(*args, **kwargs):
        nonlocal entered
        with lock:
            entered += 1
            if entered == 2:
                blocked.set()
        assert release.wait(5), "Test must release workers"
        return None
    with TestClient(app) as client, patch.object(app.state.services.horizon, "get_horizon_mask", side_effect=hold):
        try:
            request = inputs(client)
            receipts = [client.post("/api/analyses", json={"inputs": request, "idempotencyKey": "owner-key"}).json()]
            receipts += [client.post("/api/analyses", json={"inputs": request}).json() for _ in range(5)]
            assert blocked.wait(5)
            assert len({r["job"]["id"] for r in receipts}) == 6
            first, second = receipts[:2]
            job_id = first["job"]["id"]
            polled = client.get(f"/api/analysis-jobs/{job_id}").json()
            assert "cancelToken" not in polled
            retry = client.post("/api/analyses", json={"inputs": request, "idempotencyKey": "owner-key"}).json()
            assert retry["job"]["id"] == job_id and retry["cancelToken"] is None
            assert client.post(f"/api/analysis-jobs/{job_id}/cancel").status_code == 403
            assert client.post(f"/api/analysis-jobs/{job_id}/cancel", headers={"X-Analysis-Cancel-Token": second["cancelToken"]}).status_code == 403
            cancelled = client.post(f"/api/analysis-jobs/{job_id}/cancel", headers={"X-Analysis-Cancel-Token": first["cancelToken"]})
            assert cancelled.status_code == 200 and cancelled.json()["status"] == "cancelled"
            assert client.get(f"/api/analysis-jobs/{second['job']['id']}").json()["status"] == "running"
            # Cancellation cannot pretend that blocked work has released executor capacity.
            assert client.post("/api/analyses", json={"inputs": request}).status_code == 429
            with sqlite3.connect(settings.db_path) as db:
                stored = db.execute("SELECT cancel_token_hash FROM analysis_jobs WHERE id=?", (job_id,)).fetchone()[0]
                assert stored != first["cancelToken"] and len(stored) == 64
        finally:
            release.set()


@pytest.mark.parametrize("configured,expected", [(False, 503), (True, 403)])
def test_optional_endpoints_deny_unauthorized_requests(settings, configured, expected):
    with TestClient(create_app(replace(settings, admin_token=ADMIN if configured else None))) as client:
        assert client.get("/api/scenarios").status_code == expected
        assert client.post("/api/advisor-responses", json={"resultId": "missing"}).status_code == expected
        assert client.delete("/api/scenarios/not-yours").status_code == expected
        assert client.get("/api/health").status_code == 200


def test_saved_input_result_identity_and_unlinked_validation(settings):
    with TestClient(create_app(settings)) as client:
        services = client.app.state.services
        request = inputs(client)
        receipt = services.jobs.submit_analysis(AnalysisRequest(inputs=request))
        finish_job(services, receipt)
        result_id = services.jobs.get_job(receipt.job.id).resultId
        client.headers["Authorization"] = f"Bearer {ADMIN}"
        body = {"title": "private fixture", "inputs": request, "resultId": result_id}
        assert client.post("/api/scenarios", json=body).status_code == 201
        mismatch = {**request, "durationDays": 2 / 24}
        assert client.post("/api/scenarios", json={**body, "inputs": mismatch}).status_code == 422
        assert client.post("/api/scenarios", json={**body, "resultId": "missing"}).status_code == 422
        assert client.post("/api/scenarios", json={**body, "resultId": None, "inputs": {**request, "durationDays": -1}}).status_code == 422


def test_nonminute_start_uses_start_relative_source_bracket(settings):
    start = int(datetime(2028, 1, 1, 0, 1, 30, tzinfo=timezone.utc).timestamp() * 1000)
    response = JsonResponse({"result": "$$SOE\n2028-Jan-01 00:01, , , 10, 0\n2028-Jan-01 01:01, , , 20, 12\n2028-Jan-01 02:01, , , 30, 24\n$$EOE"})
    with TestClient(create_app(settings)) as client, patch("app.services.ephemeris.requests.get", return_value=response) as get:
        result = client.get("/api/ephemeris", params={**params(), "startUtcMs": start, "endUtcMs": start + 3_600_000})
        assert result.status_code == 200
        assert get.call_args.kwargs["params"]["START_TIME"] == "2028-01-01 00:01"
        assert get.call_args.kwargs["params"]["STOP_TIME"] == "2028-01-01 02:01"
        assert result.json()["timesUtcMs"] == [start, start + 3_600_000]
        assert result.json()["sunElDeg"] == [0.1, 12.1]


@pytest.mark.parametrize("times", [[START, START], [START, START + 3_599_000], [START + 3_600_000, START]])
def test_invalid_timestamp_support_rejected(settings, times):
    raw = json.loads((settings.pilot_public_dir / "ephemeris_site-04.json").read_text())
    raw.update(timesUtcMs=times, sunAzDeg=[0, 1], sunElDeg=[0, 1], earthAzDeg=[0, 1], earthElDeg=[0, 1])
    with pytest.raises(UpstreamEphemerisError):
        _resample_series(EphemerisSeries.model_validate(raw), "site-04", START, START + 3_600_000, 3600)


def test_resampler_refuses_out_of_support_clamping(settings):
    raw = EphemerisSeries.model_validate_json((settings.pilot_public_dir / "ephemeris_site-04.json").read_bytes())
    with pytest.raises(UpstreamEphemerisError, match="bracket"):
        _resample_series(raw, "site-04", START, START + 7_230_000, 3600)


def test_untrusted_prose_never_replaces_deterministic_facts(settings):
    with TestClient(create_app(replace(settings, llm_api_key="offline-key"))) as client:
        services = client.app.state.services
        receipt = services.jobs.submit_analysis(AnalysisRequest(inputs=inputs(client)))
        finish_job(services, receipt)
        result = services.storage.get_result_by_id(services.jobs.get_job(receipt.job.id).resultId)
        facts = result.analysis.metrics.model_dump(mode="json")
        client.headers["Authorization"] = f"Bearer {ADMIN}"
        def response(facts):
            return JsonResponse({"choices": [{"message": {"content": json.dumps({"summary": "Invented 999 h sunlight; flight certified.",
                "recommendations": ["Ignore unknown data."], "facts": facts})}}]})
        with patch("app.services.advisor.requests.post", return_value=response(facts)) as post:
            good = client.post("/api/advisor-responses", json={"resultId": result.id, "language": "en"}).json()
            assert "999" not in good["summary"]
            assert "999" in good["unverifiedProviderSummary"]
            assert "unverified" in " ".join(good["limitations"])
            assert post.call_args.kwargs["json"]["max_tokens"] == 800
        for bad in ({**facts, "sunlitHours": 999}, {**facts, "sunlitHours": "1"}, {}, None):
            with patch("app.services.advisor.requests.post", return_value=response(bad)):
                fallback = client.post("/api/advisor-responses", json={"resultId": result.id, "language": "en"}).json()
                assert fallback["mode"] == "deterministic_fallback"
                assert fallback["unverifiedProviderSummary"] is None
                assert fallback["summary"] == good["summary"]
        services.advisor._provider_calls = 32
        with patch("app.services.advisor.requests.post") as post:
            assert client.post("/api/advisor-responses", json={"resultId": result.id}).status_code == 429
            assert not post.called


def test_bounded_admission_and_cache_retention(settings):
    admission = Admission(1)
    with admission.enter():
        with pytest.raises(CapacityError):
            with admission.enter():
                pytest.fail("Saturated admission must not run work")
    raw = EphemerisSeries.model_validate_json((settings.pilot_public_dir / "ephemeris_site-04.json").read_bytes())
    directory = settings.cache_dir / "retention-fixture"
    cache = JsonCache(directory, EphemerisSeries)
    # A preexisting overfull disk cache is trimmed at startup, without a stress workload.
    for i in range(65):
        (directory / f"{i}.json").write_text(raw.model_dump_json())
    cache = JsonCache(directory, EphemerisSeries)
    assert len(list(directory.glob("*.json"))) == 64
    for i in range(17):
        cache.put(f"memory-{i}", raw)
    assert len(cache._memory) == 16
    assert len(list(directory.glob("*.json"))) <= 64


def test_legacy_observer_cannot_invent_queried_ground_or_height():
    with pytest.raises(ValueError):
        ObserverMetadata(latDeg=-89, lonDegE=0, observerHeightM=10, groundHeightM=100,
                         ellipsoidAltitudeKm=0.110, metadataOrigin="legacy-pipeline-height")


def test_sqlite_row_and_payload_admission_bounds(settings, monkeypatch):
    monkeypatch.setattr("app.services.storage.MAX_JOBS", 2)
    storage = SQLiteStorage(settings.db_path)
    try:
        first = storage.create_job("a")
        second = storage.create_job("b")
        with pytest.raises(CapacityError, match="row"):
            storage.create_job("c")
        assert storage.get_job(first.id).status == "queued"
        assert storage.get_job(second.id).status == "queued"
        storage.update_job(first.id, status="failed")
        third = storage.create_job("c")
        assert storage.get_job(first.id) is None
        assert storage.get_job(second.id) is not None
        assert storage.get_job(third.id) is not None
        monkeypatch.setattr("app.services.storage.MAX_JOBS", 3)
        monkeypatch.setattr("app.services.storage.MAX_PAYLOAD_BYTES", 8191)
        with pytest.raises(CapacityError, match="payload"):
            storage.create_job("d")
    finally:
        storage.close()


def test_saved_snapshots_are_not_silently_evicted(settings, monkeypatch):
    monkeypatch.setattr("app.services.storage.MAX_SCENARIOS", 1)
    with TestClient(create_app(settings)) as client:
        request = inputs(client)
        client.headers["Authorization"] = f"Bearer {ADMIN}"
        first = client.post("/api/scenarios", json={"title": "Retain this", "inputs": request})
        assert first.status_code == 201
        second = client.post("/api/scenarios", json={"title": "No room", "inputs": request})
        assert second.status_code == 429
        assert client.get(f"/api/scenarios/{first.json()['id']}").status_code == 200


def test_result_rows_evict_only_unpinned_results(settings, monkeypatch):
    monkeypatch.setattr("app.services.storage.MAX_RESULTS", 1)
    with TestClient(create_app(settings)) as client:
        services = client.app.state.services
        receipt = services.jobs.submit_analysis(AnalysisRequest(inputs=inputs(client)))
        finish_job(services, receipt)
        original = services.storage.get_result_by_id(services.jobs.get_job(receipt.job.id).resultId)
        replacement = original.model_copy(update={"id": "res_second", "calcHash": "second-hash"})
        services.storage.save_result_idempotent(replacement)
        assert services.storage.get_result_by_id(original.id) is None
        services.storage.create_scenario(SaveScenarioRequest(title="Pin", inputs=replacement.inputs, resultId=replacement.id))
        with pytest.raises(CapacityError, match="row"):
            services.storage.save_result_idempotent(original)
        assert services.storage.get_result_by_id(replacement.id).id == "res_second"


def test_disk_cache_bytes_and_object_budget(settings, monkeypatch):
    monkeypatch.setattr("app.services.resources.CACHE_DISK_BYTES", 1500)
    monkeypatch.setattr("app.services.resources.CACHE_OBJECT_BYTES", 1000)
    raw = EphemerisSeries.model_validate_json((settings.pilot_public_dir / "ephemeris_site-04.json").read_bytes())
    cache = JsonCache(settings.cache_dir / "bytes", EphemerisSeries)
    for key in ("a", "b", "c"):
        cache.put(key, raw)
    assert sum(path.stat().st_size for path in cache.directory.glob("*.json")) <= 1500
    large = raw.model_copy(deep=True)
    large.provenance.notes = "x" * 1001
    with pytest.raises(CapacityError):
        cache.put("too-large", large)
    assert not (cache.directory / "too-large.json").exists()


def test_transport_timeout_does_not_recycle_abandoned_io_slot():
    transport = BoundedHttp(1)
    release, closed = threading.Event(), threading.Event()
    class Response(JsonResponse):
        def close(self):
            super().close()
            closed.set()
    def stalled(*args, **kwargs):
        assert release.wait(5)
        return Response({"result": "synthetic"})
    try:
        with pytest.raises(TimeoutError):
            transport.request(stalled, "https://offline.invalid", timeout_s=0.01, max_bytes=100)
        with pytest.raises(CapacityError):
            transport.request(stalled, "https://offline.invalid", timeout_s=0.01, max_bytes=100)
    finally:
        release.set()
        assert closed.wait(5)


def test_direct_science_requests_have_nonwaiting_admission(settings):
    app = create_app(settings)
    release, all_started = threading.Event(), threading.Event()
    lock = threading.Lock()
    started = 0
    real_elevation = app.state.services.terrain.query_elevation
    def held(lat, lon):
        nonlocal started
        with lock:
            started += 1
            if started == 4:
                all_started.set()
        assert release.wait(5)
        return real_elevation(lat, lon)
    with TestClient(app) as client, patch.object(app.state.services.terrain, "query_elevation", side_effect=held), ThreadPoolExecutor(max_workers=4) as pool:
        calls = []
        try:
            calls = [pool.submit(client.get, "/api/terrain/elevation", params=params()) for _ in range(4)]
            assert all_started.wait(5)
            rejected = client.get("/api/terrain/elevation", params=params())
            assert rejected.status_code == 429
        finally:
            release.set()
        assert all(future.result(timeout=5).status_code == 200 for future in calls)


def test_upstream_missing_terminal_timestamp_is_explicit_failure(settings):
    start = int(datetime(2028, 1, 1, 0, 1, 30, tzinfo=timezone.utc).timestamp() * 1000)
    response = JsonResponse({"result": "$$SOE\n2028-Jan-01 00:01, , , 10, 0\n2028-Jan-01 01:01, , , 20, 12\n$$EOE"})
    with TestClient(create_app(settings)) as client, patch("app.services.ephemeris.requests.get", return_value=response):
        result = client.get("/api/ephemeris", params={**params(), "startUtcMs": start, "endUtcMs": start + 3_600_000})
        assert result.status_code == 502
        assert "timestamp support" in result.json()["detail"]
        assert response.closed


def test_oversized_request_is_rejected_before_job_admission(settings):
    with TestClient(create_app(settings)) as client:
        response = client.post("/api/analyses", content=b"x" * 65_537, headers={"Content-Type": "application/json"})
        assert response.status_code == 413
        with sqlite3.connect(settings.db_path) as db:
            assert db.execute("SELECT count(*) FROM analysis_jobs").fetchone()[0] == 0


def test_cancelled_analysis_does_not_publish_late_result(settings):
    app = create_app(settings)
    entered, release = threading.Event(), threading.Event()
    from app.services.visibility import analyze_visibility as real_analysis
    def held_analysis(series, mask):
        entered.set()
        assert release.wait(5)
        return real_analysis(series, mask)
    with TestClient(app) as client, patch("app.services.analysis_jobs.analyze_visibility", side_effect=held_analysis):
        try:
            receipt = client.post("/api/analyses", json={"inputs": inputs(client)}).json()
            assert entered.wait(5)
            job_id = receipt["job"]["id"]
            response = client.post(f"/api/analysis-jobs/{job_id}/cancel",
                                   headers={"X-Analysis-Cancel-Token": receipt["cancelToken"]})
            assert response.json()["status"] == "cancelled"
            with app.state.services.jobs._lock:
                future = app.state.services.jobs._active[job_id][0]
        finally:
            release.set()
        future.result(timeout=5)
        assert app.state.services.storage.get_result_by_hash(receipt["job"]["calcHash"]) is None


def test_invalid_retained_result_payload_is_explicit(settings):
    with TestClient(create_app(settings)) as client:
        services = client.app.state.services
        receipt = services.jobs.submit_analysis(AnalysisRequest(inputs=inputs(client)))
        finish_job(services, receipt)
        result_id = services.jobs.get_job(receipt.job.id).resultId
        with sqlite3.connect(settings.db_path) as db:
            db.execute("UPDATE analysis_results SET payload_json='{}' WHERE id=?", (result_id,))
        response = client.get(f"/api/analysis-results/{result_id}")
        assert response.status_code == 503
        assert "invalid" in response.json()["detail"]


def test_worker_exit_cannot_leave_a_nonterminal_poll_target(settings):
    app = create_app(settings)
    entered, release = threading.Event(), threading.Event()
    def broken_worker(*args):
        entered.set()
        assert release.wait(5)
        raise RuntimeError("Synthetic worker exit before normal terminal update")
    with TestClient(app) as client, patch.object(app.state.services.jobs, "_run_job", side_effect=broken_worker):
        try:
            receipt = client.post("/api/analyses", json={"inputs": inputs(client)}).json()
            job_id = receipt["job"]["id"]
            assert entered.wait(5)
            with app.state.services.jobs._lock:
                future = app.state.services.jobs._active[job_id][0]
        finally:
            release.set()
        with pytest.raises(RuntimeError, match="Synthetic"):
            future.result(timeout=5)
        # A completed Future's callback may still be acquiring the coordinator
        # lock; removing it here models that completed callback deterministically.
        app.state.services.jobs._release(job_id)
        response = client.get(f"/api/analysis-jobs/{job_id}")
        assert response.status_code == 200
        assert response.json()["status"] == "failed"
        assert "worker exited" in response.json()["errorMessage"]


def test_early_admission_errors_remain_visible_to_allowed_browser_origin(settings):
    with TestClient(create_app(replace(settings, cors_origins=("https://offline-browser.invalid",)))) as client:
        response = client.post("/api/analyses", content=b"x" * 65_537,
                               headers={"Origin": "https://offline-browser.invalid"})
        assert response.status_code == 413
        assert response.headers["Access-Control-Allow-Origin"] == "https://offline-browser.invalid"


def test_observer_identity_preserves_pipeline_query_precision_without_reconstructing_legacy_ground():
    fields = dict(latDeg=-89, lonDegE=0, observerHeightM=1, groundHeightM=1500.126)
    # Pipeline query 1.501126 km is explicitly formatted as 1.50113 km.
    pipeline = ObserverMetadata(**fields, ellipsoidAltitudeKm=1.50113, metadataOrigin="pipeline-record")
    assert pipeline.groundHeightM == 1500.126
    assert pipeline.ellipsoidAltitudeKm == 1.50113
    runtime = ObserverMetadata(**fields, ellipsoidAltitudeKm=1.501126, metadataOrigin="runtime-dem-query")
    assert runtime.ellipsoidAltitudeKm == 1.501126
    with pytest.raises(ValueError):
        ObserverMetadata(**fields, ellipsoidAltitudeKm=1.50114, metadataOrigin="pipeline-record")
    with pytest.raises(ValueError):
        ObserverMetadata(**fields, ellipsoidAltitudeKm=1.50113, metadataOrigin="runtime-dem-query")


def test_manifest_urls_and_checksums_pin_same_version_bytes_across_restart(settings):
    with TestClient(create_app(settings)) as client:
        manifest = client.get("/api/terrain/manifest").json()
        layer = manifest["layers"][0]
        old_url, old_sha = layer["url"], layer["sha256"]
        assert "?dataset=" in old_url
        assert client.get(old_url).content == np.full((20, 20), 100, dtype="<f4").tobytes()
    # Same manifest version and geometry, but a different actual source release.
    (settings.pilot_public_dir / "terrain_synthetic.bin").write_bytes(np.full((20, 20), 200, dtype="<f4").tobytes())
    with TestClient(create_app(settings)) as client:
        layer = client.get("/api/terrain/manifest").json()["layers"][0]
        assert layer["url"] != old_url
        assert layer["sha256"] != old_sha
        assert client.get(layer["url"]).content == np.full((20, 20), 200, dtype="<f4").tobytes()
        stale = client.get(old_url)
        assert stale.status_code == 409
        assert "reload" in stale.json()["detail"].lower()


def test_snapshot_captures_manifest_referenced_binary_without_generator_filename_prefix(settings):
    original = settings.pilot_public_dir / "terrain_synthetic.bin"
    renamed = settings.pilot_public_dir / "source-window.bin"
    original.rename(renamed)
    manifest_path = settings.pilot_public_dir / "terrain_manifest.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["layers"][0]["url"] = "source-window.bin"
    manifest_path.write_text(json.dumps(manifest))
    with TestClient(create_app(settings)) as client:
        elevation = client.get("/api/terrain/elevation", params={"latDeg": -89.785092, "lonDegE": 204.018283})
        assert elevation.status_code == 200
        assert elevation.json()["heightM"] == pytest.approx(100)
