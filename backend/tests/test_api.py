"""Integration and scientific contract tests for the Stage 1 FastAPI backend."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import patch
from fastapi.testclient import TestClient
import numpy as np
import pytest

from app.config import Settings, load_settings
from app.main import create_app


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


def test_health_and_sites(client: TestClient) -> None:
    health = client.get("/api/health")
    assert health.status_code == 200
    body = health.json()
    assert body["status"] == "ok"
    assert body["terrainLayers"] >= 31
    assert body["catalogSites"] >= 15

    sites = client.get("/api/sites")
    assert sites.status_code == 200
    items = sites.json()
    assert len(items) >= 15
    ids = {s["id"] for s in items}
    assert {"site-01", "site-04", "site-23", "dm2", "amundsen-rim"}.issubset(ids)
    assert all(s["provenance"]["kind"] == "processed" for s in items)


def test_terrain_manifest_binary_elevation_and_patch(client: TestClient) -> None:
    manifest_resp = client.get("/api/terrain/manifest")
    assert manifest_resp.status_code == 200
    manifest = manifest_resp.json()
    assert manifest["layers"][0]["url"].startswith("/api/terrain/layers/")

    first_layer = manifest["layers"][0]
    bin_resp = client.get(first_layer["url"])
    assert bin_resp.status_code == 200
    arr = np.frombuffer(bin_resp.content, dtype=np.float32)
    assert arr.size == first_layer["rows"] * first_layer["cols"]

    # Retained processed Site04 elevation regression (~1737.18 m), not datum validation.
    elev_ok = client.get("/api/terrain/elevation", params={"latDeg": -89.785092, "lonDegE": 204.018283})
    assert elev_ok.status_code == 200
    assert elev_ok.json()["outsideCoverage"] is False
    assert elev_ok.json()["heightM"] == pytest.approx(1737.178, abs=0.2)

    # Outside -78 deg coverage returns explicit null, never 0
    elev_out = client.get("/api/terrain/elevation", params={"latDeg": -75.0, "lonDegE": 0.0})
    assert elev_out.status_code == 200
    assert elev_out.json()["outsideCoverage"] is True
    assert elev_out.json()["heightM"] is None

    # Cropped patch around Site 04
    patch_resp = client.get(
        "/api/terrain/patch",
        params={"latDeg": -89.785092, "lonDegE": 204.018283, "radiusM": 500},
    )
    assert patch_resp.status_code == 200
    patch_meta = json.loads(patch_resp.headers["X-Dem-Meta"])
    patch_arr = np.frombuffer(patch_resp.content, dtype=np.float32)
    assert patch_arr.size == patch_meta["rows"] * patch_meta["cols"]
    assert patch_meta["spacingM"] == 5.0


def test_horizon_preset_dynamic_and_outside_coverage(client: TestClient) -> None:
    # Preset Site 01 at 2.5 m
    preset = client.get(
        "/api/horizon",
        params={"siteId": "site-01", "latDeg": -89.4632, "lonDegE": 222.51, "observerHeightM": 2.5},
    )
    assert preset.status_code == 200
    preset_json = preset.json()
    assert len(preset_json["azimuthsDeg"]) == 360
    assert preset_json["maxRangeM"] == 150_000

    # Dynamic custom height at Site 01 (ray-marched on PGDA DEM + cached)
    custom_h = client.get(
        "/api/horizon",
        params={"siteId": "site-01", "latDeg": -89.4632, "lonDegE": 222.51, "observerHeightM": 4.2},
    )
    assert custom_h.status_code == 200
    custom_json = custom_h.json()
    assert len(custom_json["elevationsDeg"]) == 360
    # Taller observer yields <= obstruction at every azimuth than 2.5 m
    assert all(
        c <= p + 1e-4 for c, p in zip(custom_json["elevationsDeg"], preset_json["elevationsDeg"])
    )

    # Outside DEM coverage returns 404 instead of fabricated zero mask
    outside = client.get(
        "/api/horizon",
        params={"latDeg": -74.0, "lonDegE": 10.0, "observerHeightM": 2.0},
    )
    assert outside.status_code == 404


def test_ephemeris_precomputed_and_dynamic_horizons_cached(client: TestClient) -> None:
    # Fast-path precomputed Q1 2027
    start_ms = 1_798_761_600_000  # 2027-01-01T00:00:00Z
    end_ms = start_ms + 3 * 3_600_000
    pre = client.get(
        "/api/ephemeris",
        params={
            "siteId": "site-04",
            "latDeg": -89.785092,
            "lonDegE": 204.018283,
            "startUtcMs": start_ms,
            "endUtcMs": end_ms,
            "stepSeconds": 3600,
            "observerHeightM": 1,
        },
    )
    assert pre.status_code == 200
    pre_json = pre.json()
    assert pre_json["frame"] == "MOON_ME"
    assert len(pre_json["timesUtcMs"]) == 4

    # Dynamic custom coordinate & date queries JPL Horizons once, then hits cache
    fake_horizons = {
        "result": (
            "$$SOE\n"
            "2028-Jan-01 00:00, , , 120.5000, 1.2500\n"
            "2028-Jan-01 01:00, , , 121.0000, 1.3000\n"
            "2028-Jan-01 02:00, , , 121.5000, 1.3500\n"
            "$$EOE\n"
        )
    }

    class FakeResp:
        def raise_for_status(self) -> None:
            return None

        def iter_content(self, chunk_size: int):
            yield json.dumps(fake_horizons).encode()

        def close(self) -> None:
            pass

    dyn_start = 1_830_297_600_000  # 2028-01-01T00:00:00Z
    dyn_end = dyn_start + 2 * 3_600_000

    with patch("app.services.ephemeris.requests.get", return_value=FakeResp()) as mock_get:
        first = client.get(
            "/api/ephemeris",
            params={
                "latDeg": -89.2,
                "lonDegE": 45.0,
                "startUtcMs": dyn_start,
                "endUtcMs": dyn_end,
                "stepSeconds": 3600,
            },
        )
        assert first.status_code == 200
        assert mock_get.call_count == 2  # Sun (10) + Earth (399)
        body = first.json()
        assert body["sunAzDeg"] == [120.5, 121.0, 121.5]
        assert body["provenance"]["kind"] == "processed"

        # Second call hits cache -> zero extra HTTP calls
        second = client.get(
            "/api/ephemeris",
            params={
                "latDeg": -89.2,
                "lonDegE": 45.0,
                "startUtcMs": dyn_start,
                "endUtcMs": dyn_end,
                "stepSeconds": 3600,
            },
        )
        assert second.status_code == 200
        assert mock_get.call_count == 2

    # Outside DEM coverage returns 422 outside coverage
    out = client.get(
        "/api/ephemeris",
        params={
            "latDeg": -74.0,
            "lonDegE": 0.0,
            "startUtcMs": dyn_start,
            "endUtcMs": dyn_end,
            "stepSeconds": 3600,
        },
    )
    assert out.status_code == 422
    assert "outside coverage" in out.json()["detail"].lower()


def test_coverage_check(client: TestClient) -> None:
    inside = client.post("/api/coverage/check", json={"latDeg": -89.5, "lonDegE": 120.0})
    assert inside.status_code == 200
    assert inside.json()["terrainSupported"] is True
    assert inside.json()["horizonSupported"] is True
    assert inside.json()["ephemerisMode"] == "dynamic_horizons"

    outside = client.post("/api/coverage/check", json={"latDeg": -75.0, "lonDegE": 120.0})
    assert outside.status_code == 200
    assert outside.json()["terrainSupported"] is False
    assert outside.json()["groundHeightM"] is None
    assert outside.json()["ephemerisMode"] == "outside_coverage"
