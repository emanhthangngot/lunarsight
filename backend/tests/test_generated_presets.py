"""Task38 offline synthetic pack coherence, not independent lunar science.

The retained task34 suite protects snapshot/cache identity and runtime height
precision, but not generated presets against a newly published terrain pack.
These consumer-constructor cases close that gap at the lowest reliable layer.
The golden byte fixture independently specifies the cross-language wire codec.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import socket
import struct
from unittest.mock import patch

import pytest

from app.geo import south_polar_forward
from app.models import DemManifest
from app.services.assets import ScienceAssets, terrain_dependency_preimage
from app.services.ephemeris import EphemerisService
from app.services.horizon import HorizonService
from app.services.terrain import TerrainService

POLICY = "pilot-terrain-f64be-sha256-v1"
GROUND = 1500.1259765625  # Exactly representable Float32; pipeline altitude = 1.50113 km.
START = 1_798_761_600_000


@pytest.fixture(autouse=True)
def deny_network():
    with patch("requests.get", side_effect=AssertionError("No upstream HTTP permitted")), \
         patch("requests.post", side_effect=AssertionError("No upstream HTTP permitted")), \
         patch.object(socket.socket, "connect", side_effect=AssertionError("No sockets permitted")), \
         patch("socket.create_connection", side_effect=AssertionError("No sockets permitted")):
        yield


def write_json(path: Path, value: dict | list) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def rewrite_manifest(root: Path) -> dict:
    """Independent fixture producer: hash actual bytes and the specified wire."""
    path = root / "terrain_manifest.json"
    manifest = json.loads(path.read_text())
    layers = []
    for layer in manifest["layers"]:
        actual = hashlib.sha256((root / layer["url"]).read_bytes()).hexdigest()
        layer["sha256"] = actual
        layers.append([
            *[struct.pack(">d", float(layer[key])).hex()
              for key in ("xMinM", "yMaxM", "spacingM", "rows", "cols")], actual,
        ])
    wire = [POLICY, "pilot-validity-v1", "R=1737400m",
            ["c056800000000000", "c053800000000000", "0000000000000000", "4076800000000000"], layers]
    manifest["terrainContentHashPolicy"] = POLICY
    manifest["terrainContentHash"] = hashlib.sha256(json.dumps(wire, separators=(",", ":")).encode()).hexdigest()
    write_json(path, manifest)
    return manifest


@pytest.fixture()
def pack(tmp_path: Path) -> Path:
    provenance = {"kind": "processed", "source": "synthetic offline fixture", "version": "same-version",
                  "generatedAt": "2026-01-01T00:00:00Z"}
    site = {"id": "site-04", "name": "Synthetic technical observer", "category": "artemis-candidate",
            "latDeg": -89, "lonDegE": 0, "nameVerified": False, "provenance": provenance}
    write_json(tmp_path / "sites.json", [site])
    # Place the observer exactly at the grid centre; constant cells give the hand-known ground.
    _, y = south_polar_forward(-89, 0)
    layer = {"id": "synthetic", "url": "terrain_synthetic.bin", "xMinM": -1, "yMaxM": y + 1,
             "spacingM": 1, "rows": 2, "cols": 2, "minHeightM": GROUND, "maxHeightM": GROUND,
             "source": "synthetic Float32 ground"}
    (tmp_path / layer["url"]).write_bytes(struct.pack("<4f", *([GROUND] * 4)))
    write_json(tmp_path / "terrain_manifest.json", {
        "version": "same-version", "coverage": {"southDeg": -90, "northDeg": -78, "westDegE": 0, "eastDegE": 360},
        "layers": [layer], "provenance": {**provenance, "method": "pilot-validity-v1", "contentHash": "producer-metadata-only"},
    })
    manifest = rewrite_manifest(tmp_path)
    dependency = {key: manifest[key] for key in ("terrainContentHashPolicy", "terrainContentHash")}
    observer = {"latDeg": -89, "lonDegE": 0, "observerHeightM": 1, "groundHeightM": GROUND,
                "ellipsoidAltitudeKm": 1.50113, "datumStatus": "conditional", "metadataOrigin": "pipeline-record"}
    write_json(tmp_path / "observerMetadata.json", {"version": "pilot-observer-metadata-v1", "sites": {"site-04": observer}})
    write_json(tmp_path / "ephemeris_site-04.json", {
        "siteId": "site-04", "frame": "MOON_ME", "startUtcMs": START, "stepSeconds": 3600,
        "timesUtcMs": [START, START + 3_600_000], "sunAzDeg": [350, 10], "sunElDeg": [1, 3],
        "earthAzDeg": [20, 40], "earthElDeg": [-1, 1], "provenance": provenance, "observer": observer,
        "queryHash": "synthetic-query-metadata", **dependency,
    })
    write_json(tmp_path / "horizon_site-04.json", {
        "siteId": "site-04", "azimuthsDeg": [0, 90, 180, 270], "heights": {"1": [0, 1, 2, 3]},
        "maxRangeM": 150_000, "provenance": provenance, **dependency,
        "horizonMethod": "spherical-raymarch-25m-4percent-v1",
        "observer": {"latDeg": -89, "lonDegE": 0, "groundHeightM": GROUND, "observerHeightsM": [1],
                     "datumStatus": "conditional", "metadataOrigin": "pipeline-record"},
    })
    return tmp_path


def services(root: Path) -> tuple[TerrainService, HorizonService, EphemerisService]:
    assets = ScienceAssets(root)
    terrain = TerrainService(root, assets)
    horizon = HorizonService(root, root / "cache", terrain, assets=assets)
    ephemeris = EphemerisService(root, root / "cache", terrain, "https://offline.invalid", assets=assets)
    return terrain, horizon, ephemeris


def test_golden_wire_preimage_is_exact():
    digest = "0" * 64
    manifest = DemManifest.model_validate({
        "version": "synthetic", "coverage": {"southDeg": -90, "northDeg": -78, "westDegE": 0, "eastDegE": 360},
        "provenance": {"kind": "processed", "source": "synthetic", "version": "v1", "generatedAt": "2026-01-01"},
        "layers": [{"id": "irrelevant-name", "url": "fixture.bin", "xMinM": 0, "yMaxM": 1, "spacingM": 1,
                    "rows": 2, "cols": 2, "minHeightM": 0, "maxHeightM": 0, "source": "synthetic", "sha256": digest}],
    })
    expected = (
        b'["pilot-terrain-f64be-sha256-v1","pilot-validity-v1","R=1737400m",'
        b'["c056800000000000","c053800000000000","0000000000000000","4076800000000000"],'
        b'[["0000000000000000","3ff0000000000000","3ff0000000000000","4000000000000000","4000000000000000","'
        + b"0" * 64 + b'"]]]'
    )
    assert terrain_dependency_preimage(manifest, {"fixture.bin": digest}) == expected


def test_matching_generated_pack_is_reused_with_conditional_provenance(pack):
    terrain, horizon, ephemeris = services(pack)
    manifest = terrain.get_manifest().model_dump()
    assert manifest["terrainContentHashPolicy"] == POLICY
    assert manifest["terrainContentHash"] == json.loads((pack / "terrain_manifest.json").read_text())["terrainContentHash"]
    assert terrain.height_at(-89, 0)[0] == GROUND
    mask = horizon.get_horizon_mask(-89, -360, 1, "site-04")
    series = ephemeris.get_ephemeris(-89, -360, START, START + 3_600_000, 3600, 1, "site-04")
    assert mask.elevationsDeg == [0, 1, 2, 3]
    assert series.sunElDeg == [1, 3]
    assert series.observer.groundHeightM == GROUND
    assert series.observer.ellipsoidAltitudeKm == 1.50113
    for result in (mask, series):
        assert "Generated" in result.provenance.notes
        assert "dependency checked" in result.provenance.notes
        assert "not independently validated" in result.provenance.notes
        assert "Legacy numerical" not in result.provenance.notes


@pytest.mark.parametrize("consumer", ["horizon", "ephemeris"])
def test_updated_terrain_manifest_rejects_retained_generated_presets(pack, consumer):
    (pack / "terrain_synthetic.bin").write_bytes(struct.pack("<4f", *([GROUND + 1] * 4)))
    rewrite_manifest(pack)
    assets = ScienceAssets(pack)
    terrain = TerrainService(pack, assets)
    with pytest.raises(ValueError, match="dependency"):
        if consumer == "horizon":
            HorizonService(pack, pack / "cache", terrain, assets=assets)
        else:
            EphemerisService(pack, pack / "cache", terrain, "https://offline.invalid", assets=assets)


@pytest.mark.parametrize("target", ["manifest", "horizon", "ephemeris"])
@pytest.mark.parametrize("policy", [None, "pilot-terrain-v0"])
def test_missing_or_unsupported_generated_policy_never_downgrades(pack, target, policy):
    filename = {"manifest": "terrain_manifest.json", "horizon": "horizon_site-04.json",
                "ephemeris": "ephemeris_site-04.json"}[target]
    path = pack / filename
    raw = json.loads(path.read_text())
    if policy is None:
        raw.pop("terrainContentHashPolicy")
    else:
        raw["terrainContentHashPolicy"] = policy
    write_json(path, raw)
    with pytest.raises(ValueError, match="policy|Policy|dependency"):
        services(pack)


@pytest.mark.parametrize("invalid", ["bytes", "geometry", "coverage", "checksum", "length", "source"])
def test_generated_terrain_claim_requires_actual_source_and_geometry(pack, invalid):
    path = pack / "terrain_manifest.json"
    raw = json.loads(path.read_text())
    if invalid == "bytes":
        (pack / "terrain_synthetic.bin").write_bytes(struct.pack("<4f", *([GROUND + 1] * 4)))
    elif invalid == "geometry":
        raw["layers"][0]["xMinM"] += 1
    elif invalid == "coverage":
        raw["coverage"]["northDeg"] = -79
    elif invalid == "checksum":
        raw["layers"][0]["sha256"] = "0" * 64
    elif invalid == "length":
        (pack / "terrain_synthetic.bin").write_bytes(b"short")
    else:
        raw["layers"][0]["url"] = "not-a-binary.json"
    write_json(path, raw)
    with pytest.raises(ValueError):
        services(pack)


@pytest.mark.parametrize("target", ["horizon", "ephemeris"])
@pytest.mark.parametrize("field", ["ground", "coordinates", "height", "origin"])
def test_generated_observer_must_match_current_ground_and_canonical_identity(pack, target, field):
    path = pack / f"{target}_site-04.json"
    raw = json.loads(path.read_text())
    observer = raw["observer"]
    if field == "ground":
        observer["groundHeightM"] += 1
        if target == "ephemeris":
            observer["ellipsoidAltitudeKm"] = 1.50213
    elif field == "coordinates":
        observer["latDeg"] = -88
    elif field == "height":
        observer["observerHeightsM" if target == "horizon" else "observerHeightM"] = [2] if target == "horizon" else 2
        if target == "ephemeris":
            observer["ellipsoidAltitudeKm"] = 1.50213
    else:
        observer["metadataOrigin"] = "legacy-pipeline-height"
        observer["groundHeightM"] = None
        if target == "ephemeris":
            observer["ellipsoidAltitudeKm"] = None
    write_json(path, raw)
    # Change the registry too: a self-consistent stale generation record still
    # must be checked against actual current terrain/canonical height policy.
    if target == "ephemeris":
        write_json(pack / "observerMetadata.json", {"version": "pilot-observer-metadata-v1", "sites": {"site-04": observer}})
    with pytest.raises(ValueError):
        services(pack)


def test_five_decimal_pipeline_altitude_and_registry_must_agree(pack):
    path = pack / "ephemeris_site-04.json"
    raw = json.loads(path.read_text())
    raw["observer"]["ellipsoidAltitudeKm"] = (GROUND + 1) / 1000
    write_json(path, raw)
    with pytest.raises(ValueError, match="precision"):
        services(pack)
    raw["observer"]["ellipsoidAltitudeKm"] = 1.50113
    write_json(path, raw)
    registry_path = pack / "observerMetadata.json"
    registry = json.loads(registry_path.read_text())
    registry["sites"]["site-04"]["groundHeightM"] += 1
    registry["sites"]["site-04"]["ellipsoidAltitudeKm"] = 1.50213
    write_json(registry_path, registry)
    with pytest.raises(ValueError, match="registry"):
        services(pack)


@pytest.mark.parametrize("target", ["horizon", "ephemeris"])
def test_invalid_generated_numerical_samples_are_not_reused(pack, target):
    path = pack / f"{target}_site-04.json"
    raw = json.loads(path.read_text())
    if target == "horizon":
        raw["heights"]["1"] = [0, 1]
    else:
        raw["sunElDeg"] = [0, 91]
    write_json(path, raw)
    with pytest.raises(ValueError):
        services(pack)


def test_unqualified_legacy_pack_retains_null_observer_and_conditional_provenance(pack):
    for filename in ("terrain_manifest.json", "horizon_site-04.json", "ephemeris_site-04.json"):
        path = pack / filename
        raw = json.loads(path.read_text())
        for key in ("terrainContentHashPolicy", "terrainContentHash", "horizonMethod", "queryHash", "observer"):
            raw.pop(key, None)
        raw["provenance"].pop("method", None)
        raw["provenance"].pop("contentHash", None)
        write_json(path, raw)
    legacy = {"latDeg": -89, "lonDegE": 0, "observerHeightM": 1, "groundHeightM": None,
              "ellipsoidAltitudeKm": None, "datumStatus": "conditional", "metadataOrigin": "legacy-pipeline-height"}
    write_json(pack / "observerMetadata.json", {"version": "pilot-observer-metadata-v1", "sites": {"site-04": legacy}})
    terrain, horizon, ephemeris = services(pack)
    assert terrain.get_manifest().model_dump()["terrainContentHash"] is None
    mask = horizon.get_horizon_mask(-89, 0, 1, "site-04")
    series = ephemeris.get_ephemeris(-89, 0, START, START + 3_600_000, 3600, 1, "site-04")
    assert mask.elevationsDeg == [0, 1, 2, 3]
    assert series.sunElDeg == [1, 3]
    assert series.observer.groundHeightM is None
    assert series.observer.ellipsoidAltitudeKm is None
    assert series.observer.metadataOrigin == "legacy-pipeline-height"
    assert "Legacy numerical asset retained unchanged" in mask.provenance.notes
    assert "Legacy numerical asset retained unchanged" in series.provenance.notes


@pytest.mark.parametrize("target", ["manifest", "horizon", "ephemeris"])
def test_old_generated_markers_without_dependency_fields_are_not_legacy(pack, target):
    filename = {"manifest": "terrain_manifest.json", "horizon": "horizon_site-04.json",
                "ephemeris": "ephemeris_site-04.json"}[target]
    path = pack / filename
    raw = json.loads(path.read_text())
    raw.pop("terrainContentHashPolicy")
    raw.pop("terrainContentHash")
    write_json(path, raw)
    with pytest.raises(ValueError, match="policy|Policy|dependency"):
        services(pack)


def test_actual_nodata_at_generated_observer_is_rejected(pack):
    (pack / "terrain_synthetic.bin").write_bytes(struct.pack("<4f", *([float("nan")] * 4)))
    manifest = rewrite_manifest(pack)
    # Supply the correct new dependency identity, so rejection must come from
    # unavailable actual ground, not an earlier checksum/dependency mismatch.
    for filename in ("horizon_site-04.json", "ephemeris_site-04.json"):
        path = pack / filename
        raw = json.loads(path.read_text())
        raw["terrainContentHash"] = manifest["terrainContentHash"]
        write_json(path, raw)
    with pytest.raises(ValueError, match="ground"):
        services(pack)


@pytest.mark.parametrize("section,field", [("coverage", "westDegE"), ("layer", "spacingM"), ("layer", "rows")])
@pytest.mark.parametrize("value", [True, "2", None])
def test_generated_geometry_rejects_non_json_numbers_before_coercion(pack, section, field, value):
    path = pack / "terrain_manifest.json"
    raw = json.loads(path.read_text())
    target = raw["coverage"] if section == "coverage" else raw["layers"][0]
    target[field] = value
    write_json(path, raw)
    with pytest.raises(ValueError, match="numeric"):
        ScienceAssets(pack)


@pytest.mark.parametrize("value", [1, 2.5])
def test_generated_dimensions_require_numeric_integers_at_least_two(pack, value):
    path = pack / "terrain_manifest.json"
    raw = json.loads(path.read_text())
    raw["layers"][0]["rows"] = value
    write_json(path, raw)
    with pytest.raises(ValueError, match="integers >= 2"):
        ScienceAssets(pack)


def test_generated_manifest_cannot_claim_a_conflicting_validity_method(pack):
    path = pack / "terrain_manifest.json"
    manifest = json.loads(path.read_text())
    manifest["provenance"]["method"] = "unsupported-validity-method"
    write_json(path, manifest)
    with pytest.raises(ValueError, match="validity method"):
        ScienceAssets(pack)
