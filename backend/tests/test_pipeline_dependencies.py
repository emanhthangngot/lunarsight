"""Synthetic task38 dependency regressions, not lunar accuracy evidence.

Authority: task38-dependency-policy.md and the explicit ground/rounded-altitude
reuse requirement. Existing validity tests protect masks and arithmetic, but not
mixed generated packs. These small offline producer-boundary fixtures protect
publication/reuse and an independently spelled cross-language wire preimage.
No raster reader, upstream request, or production asset is used.
"""
from __future__ import annotations

from contextlib import ExitStack
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
PIPELINE = ROOT / "scripts" / "pipeline"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load offline fixture module: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


validity = load_module("pilot_dependency_validity_fixture", PIPELINE / "validity.py")
with patch.dict(sys.modules, {"validity": validity}):
    builder = load_module("pilot_dependency_builder_fixture", PIPELINE / "build_pilot_assets.py")


def digest(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


class TerrainDependencyWireTests(unittest.TestCase):
    def test_independent_big_endian_wire_and_nonsemantic_metadata(self):
        sha = hashlib.sha256(b"synthetic actual grid bytes").hexdigest()
        coverage = {"southDeg": -90, "northDeg": -78, "westDegE": 0, "eastDegE": 360}
        layer = {"xMinM": 0, "yMaxM": 2, "spacingM": 1, "rows": 2, "cols": 2, "sha256": sha}
        # Literal IEEE754 values and flat layer ordering come from the agreed wire,
        # not from production's float encoder or manifest hash helper.
        wire = [
            "pilot-terrain-f64be-sha256-v1", "pilot-validity-v1", "R=1737400m",
            ["c056800000000000", "c053800000000000", "0000000000000000", "4076800000000000"],
            [["0000000000000000", "4000000000000000", "3ff0000000000000", "4000000000000000", "4000000000000000", sha]],
        ]
        expected = hashlib.sha256(json.dumps(wire, separators=(",", ":")).encode("utf-8")).hexdigest()
        self.assertEqual(validity.terrain_content_hash(coverage, [layer], [sha]), expected)
        renamed = {**layer, "id": "renamed", "url": "/different.bin", "source": "changed producer note"}
        self.assertEqual(validity.terrain_content_hash(coverage, [renamed], [sha]), expected)
        for changed in ({**layer, "xMinM": 1}, {**layer, "spacingM": 2}):
            self.assertNotEqual(validity.terrain_content_hash(coverage, [changed], [sha]), expected)
        self.assertNotEqual(validity.terrain_content_hash({**coverage, "northDeg": -79}, [layer], [sha]), expected)
        other_sha = hashlib.sha256(b"changed validity/mask bytes").hexdigest()
        other = {**layer, "sha256": other_sha}
        self.assertNotEqual(
            validity.terrain_content_hash(coverage, [layer, other], [sha, other_sha]),
            validity.terrain_content_hash(coverage, [other, layer], [other_sha, sha]),
        )
        with self.assertRaisesRegex(ValueError, "actual layer SHA256"):
            validity.terrain_content_hash(coverage, [layer], [other_sha])
        for changed in ({**layer, "rows": 1}, {**layer, "cols": 2.5}, {**layer, "spacingM": 0}, {**layer, "xMinM": float("nan")}):
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                validity.terrain_content_hash(coverage, [changed], [sha])


class GeneratedPipelineDependencyTests(unittest.TestCase):
    def setUp(self):
        stack = ExitStack()
        self.addCleanup(stack.close)
        root = Path(stack.enter_context(TemporaryDirectory()))
        self.public, self.src, self.cache = root / "public", root / "src", root / "cache"
        for directory in (self.public, self.src, self.cache):
            directory.mkdir()
        self.site = {
            "id": "fixture-site", "slug": "fixture", "latDeg": -89.0, "lonDegE": 0.0,
            "name": "Synthetic site", "category": "synthetic", "description": "Offline fixture",
            "pgdaSourceLabel": "Synthetic grid, not NASA data", "demType": "pgda_5m",
        }
        self.catalog_path = root / "catalog.json"
        self.save(self.catalog_path, [self.site])
        for key, value in (
            ("PUBLIC_DIR", self.public), ("SRC_DIR", self.src), ("CACHE_DIR", self.cache),
            ("CATALOG_PATH", self.catalog_path), ("START_TIME", "2027-01-01 00:00"),
            ("STOP_TIME", "2027-01-01 01:00"), ("HORIZON_MAX_RANGE_M", 25.0),
        ):
            stack.enter_context(patch.object(builder, key, value))
        # Four-by-four flat grids cover every 25 m ray around this observer.
        # The decimal ground is exactly representable as float32.
        self.ground = 1000.28125
        _, sy = builder.south_polar_forward(-89.0, 0.0)
        self.grid = np.full((4, 4), self.ground, dtype="<f4")
        provenance = {"policy": {"policyVersion": "pilot-validity-v1"}, "queryHash": digest("synthetic window")}
        self.layers = []
        for layer_id, name in (
            ("local-fine", "terrain_fixture_5m.bin"), ("local-coarse", "terrain_fixture_40m.bin"),
            ("regional", "terrain_south_pole_480m.bin"),
        ):
            self.grid.tofile(self.public / name)
            self.layers.append(builder.layer_metadata_from_bin(
                layer_id, self.site["id"], name, -200.0, float(sy) + 200.0, 100.0, 4, 4,
                self.grid, "synthetic flat grid", provenance,
            ))
        self.save(self.cache / "site_layers_index.json", {self.site["id"]: self.layers[:2]})
        self.coverage = {"southDeg": -90.0, "northDeg": -78.0, "westDegE": 0.0, "eastDegE": 360.0}
        self.identity = self.current_identity()
        self.observer = {
            "latDeg": -89.0, "lonDegE": 0.0, "observerHeightM": 1, "groundHeightM": 1000.28125,
            "ellipsoidAltitudeKm": 1.00128, "datumStatus": "conditional", "metadataOrigin": "pipeline-record",
        }
        self.registry = {"version": "pilot-observer-metadata-v1", "sites": {self.site["id"]: self.observer}}
        self.horizon = self.horizon_record()
        self.ephemeris = self.ephemeris_record()
        self.save_records()
        self.manifest_path = self.public / "terrain_manifest.json"
        self.manifest_path.write_text("previous manifest stays until complete", encoding="utf-8")
        # Guard all external/raster boundaries. Horizon arithmetic remains real.
        stack.enter_context(patch.object(builder, "_http_session", return_value=object()))
        stack.enter_context(patch.object(builder, "load_or_fetch_regional_480m", return_value=self.layers[-1]))
        stack.enter_context(patch.object(builder, "load_site_near_dem", side_effect=AssertionError("Raster boundary must not run")))
        stack.enter_context(patch.object(builder, "fetch_horizons_series", side_effect=AssertionError("Upstream must not run")))

    @staticmethod
    def save(path: Path, value: object):
        path.write_text(json.dumps(value), encoding="utf-8")

    def current_identity(self):
        ordered = sorted(self.layers[:2], key=lambda layer: (layer["spacingM"], layer["id"])) + self.layers[2:]
        return validity.terrain_content_hash(self.coverage, ordered, [
            hashlib.sha256((self.public / Path(layer["url"]).name).read_bytes()).hexdigest() for layer in ordered
        ])

    def horizon_record(self):
        heights = {key: [0.0] * 360 for key in ("0", "0.25", "1", "2.5", "10")}
        query = {
            "latDeg": -89.0, "lonDegE": 0.0, "groundHeightM": 1000.28125,
            "observerHeightsM": [0.0, 0.25, 1.0, 2.5, 10.0], "maxRangeM": 25.0,
            "method": "spherical-raymarch-25m-4percent-v1",
            "terrainContentHashPolicy": "pilot-terrain-f64be-sha256-v1", "terrainContentHash": self.identity,
        }
        return {
            "siteId": self.site["id"], "azimuthsDeg": list(range(360)), "maxRangeM": 25,
            "heights": heights, "observer": {
                "latDeg": -89.0, "lonDegE": 0.0, "groundHeightM": 1000.28125,
                "observerHeightsM": [0.0, 0.25, 1.0, 2.5, 10.0],
                "datumStatus": "conditional", "metadataOrigin": "pipeline-record",
            },
            "horizonMethod": "spherical-raymarch-25m-4percent-v1",
            "terrainContentHashPolicy": "pilot-terrain-f64be-sha256-v1", "terrainContentHash": self.identity,
            "queryHash": digest(query), "contentHash": digest(heights),
        }

    def ephemeris_record(self):
        queries = {}
        for body, target in (("sun", "10"), ("earth", "399")):
            query = {
                "format": "json", "COMMAND": target, "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
                "EPHEM_TYPE": "OBSERVER", "CENTER": "coord@301", "COORD_TYPE": "GEODETIC",
                "SITE_COORD": "0.000000,-89.000000,1.00128", "START_TIME": "2027-01-01 00:00",
                "STOP_TIME": "2027-01-01 01:00", "STEP_SIZE": "60 m", "QUANTITIES": "4", "CSV_FORMAT": "YES",
            }
            queries[body] = {
                "query": query, "queryHash": digest({"url": "https://ssd.jpl.nasa.gov/api/horizons.api", "params": query}),
                "responseHash": digest(f"synthetic {body} response"),
            }
        record = {
            "siteId": self.site["id"], "frame": "MOON_ME", "startUtcMs": 1798761600000,
            "stepSeconds": 3600, "timesUtcMs": [1798761600000, 1798765200000],
            "sunAzDeg": [0, 90], "sunElDeg": [1, 2], "earthAzDeg": [180, 270], "earthElDeg": [-1, -2],
            "observer": deepcopy(self.observer), "queries": queries,
            "queryHash": digest([queries["sun"]["queryHash"], queries["earth"]["queryHash"]]),
            "sourceHash": digest({"sunResponseHash": queries["sun"]["responseHash"], "earthResponseHash": queries["earth"]["responseHash"]}),
            "terrainContentHashPolicy": "pilot-terrain-f64be-sha256-v1", "terrainContentHash": self.identity,
        }
        self.refresh_ephemeris_content(record)
        return record

    @staticmethod
    def refresh_ephemeris_content(record):
        record["contentHash"] = digest({key: record[key] for key in (
            "observer", "timesUtcMs", "sunAzDeg", "sunElDeg", "earthAzDeg", "earthElDeg", "queryHash",
        )})

    def save_records(self):
        self.save(self.public / f"horizon_{self.site['id']}.json", self.horizon)
        self.save(self.public / f"ephemeris_{self.site['id']}.json", self.ephemeris)
        self.save(self.src / "observerMetadata.json", self.registry)

    def run_main(self, *flags):
        with patch.object(sys, "argv", ["build_pilot_assets.py", *flags]):
            builder.main()

    def assert_unpublished(self):
        self.assertEqual(self.manifest_path.read_text(), "previous manifest stays until complete")
        self.assertFalse((self.src / "sites.json").exists())

    def test_matching_generated_pack_skips_science_and_publishes_separate_identities(self):
        with patch.object(builder, "compute_horizon_masks", side_effect=AssertionError("Matching horizon must be retained")):
            self.run_main("--skip-existing")
        manifest = json.loads(self.manifest_path.read_text())
        self.assertEqual(manifest["terrainContentHashPolicy"], "pilot-terrain-f64be-sha256-v1")
        self.assertEqual(manifest["terrainContentHash"], self.identity)
        self.assertNotEqual(manifest["provenance"]["contentHash"], self.identity)
        self.assertEqual(manifest["provenance"]["contentHash"], digest({
            "method": "pilot-validity-v1", "layers": manifest["layers"],
        }))
        self.assertEqual(json.loads((self.public / f"horizon_{self.site['id']}.json").read_text()), self.horizon)
        self.assertEqual(json.loads((self.public / f"ephemeris_{self.site['id']}.json").read_text()), self.ephemeris)
        self.assertEqual(json.loads((self.src / "observerMetadata.json").read_text())["sites"][self.site["id"]], self.observer)

    def test_changed_terrain_retained_horizon_is_recomputed_offline(self):
        old_identity = self.identity
        changed = self.grid.copy()
        changed[0, 0] += 4  # Distant bytes change while the observer ground stays equal.
        path = self.public / "terrain_south_pole_480m.bin"
        changed.tofile(path)
        self.layers[-1]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        self.identity = self.current_identity()
        self.assertNotEqual(self.identity, old_identity)
        # The celestial fixture is already generated for the new pack; only the
        # old horizon is retained. No retrospective legacy metadata is invented.
        self.ephemeris["terrainContentHash"] = self.identity
        self.save_records()
        self.run_main("--skip-existing")
        horizon = json.loads((self.public / f"horizon_{self.site['id']}.json").read_text())
        self.assertEqual(horizon["terrainContentHash"], self.identity)
        self.assertEqual(horizon["horizonMethod"], "spherical-raymarch-25m-4percent-v1")
        # Independent flat, 25 m-ray expectations rounded to four decimals:
        # curvature alone = -0.0004 deg; adding 1 m = -2.2910 deg.
        self.assertEqual(horizon["heights"]["0"], [-0.0004] * 360)
        self.assertEqual(horizon["heights"]["1"], [-2.291] * 360)

    def test_skip_and_recompute_reject_original_ground_or_altitude_even_at_one_meter(self):
        for flag in ("--skip-existing", "--recompute-horizons"):
            for key, value in (("groundHeightM", 1000.28225), ("ellipsoidAltitudeKm", 1.00129)):
                with self.subTest(flag=flag, field=key):
                    record = deepcopy(self.ephemeris)
                    record["observer"][key] = value
                    self.refresh_ephemeris_content(record)
                    self.save(self.public / f"ephemeris_{self.site['id']}.json", record)
                    with self.assertRaisesRegex(ValueError, "Cached ephemeris.*observer/ground/transmitted altitude"):
                        self.run_main(flag)
                    self.assert_unpublished()

    def test_cached_celestial_changed_terrain_rejects_before_upstream_or_manifest(self):
        path = self.public / "terrain_south_pole_480m.bin"
        changed = self.grid.copy()
        changed[0, 0] += 4
        changed.tofile(path)
        self.layers[-1]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        with self.assertRaisesRegex(ValueError, "Cached ephemeris.*terrain dependency"):
            self.run_main("--skip-existing")
        self.assert_unpublished()

    def test_registry_or_query_mismatch_is_not_silently_skipped(self):
        registry = deepcopy(self.registry)
        registry["sites"][self.site["id"]]["ellipsoidAltitudeKm"] = 1.00129
        self.save(self.src / "observerMetadata.json", registry)
        with self.assertRaisesRegex(ValueError, "Cached ephemeris.*Observer registry"):
            self.run_main("--skip-existing")
        self.assert_unpublished()
        self.save(self.src / "observerMetadata.json", self.registry)
        for key, value in (("SITE_COORD", "0.000000,-89.000000,1.00129"), ("STEP_SIZE", "30 m"), ("QUANTITIES", "1")):
            with self.subTest(setting=key):
                record = deepcopy(self.ephemeris)
                record["queries"]["sun"]["query"][key] = value
                # Even self-consistent producer hashes cannot bless wrong inputs.
                record["queries"]["sun"]["queryHash"] = digest({
                    "url": "https://ssd.jpl.nasa.gov/api/horizons.api", "params": record["queries"]["sun"]["query"],
                })
                record["queryHash"] = digest([record["queries"][body]["queryHash"] for body in ("sun", "earth")])
                self.refresh_ephemeris_content(record)
                self.save(self.public / f"ephemeris_{self.site['id']}.json", record)
                with self.assertRaisesRegex(ValueError, "Cached ephemeris.*sun query"):
                    self.run_main("--skip-existing")
                self.assert_unpublished()

    def test_horizon_observer_method_or_height_mismatch_recomputes_offline(self):
        for change in ("observer", "method", "heights"):
            with self.subTest(change=change):
                record = deepcopy(self.horizon)
                if change == "observer":
                    record["observer"]["lonDegE"] = 1.0
                elif change == "method":
                    record["horizonMethod"] = "unsupported-method"
                else:
                    record["heights"].pop("10")
                    record["contentHash"] = digest(record["heights"])
                self.save(self.public / f"horizon_{self.site['id']}.json", record)
                self.run_main("--skip-existing")
                result = json.loads((self.public / f"horizon_{self.site['id']}.json").read_text())
                self.assertEqual(result["observer"]["lonDegE"], 0.0)
                self.assertEqual(result["horizonMethod"], "spherical-raymarch-25m-4percent-v1")
                self.assertEqual(set(result["heights"]), {"0", "0.25", "1", "2.5", "10"})
                self.assertEqual(result["heights"]["0"], [-0.0004] * 360)

    def test_non_target_legacy_is_not_promoted_and_blocks_manifest_publication(self):
        other = {**self.site, "id": "legacy-other-site", "slug": "legacy-other"}
        self.save(self.catalog_path, [self.site, other])
        legacy = deepcopy(self.ephemeris)
        legacy["siteId"] = other["id"]
        legacy.pop("terrainContentHash")
        legacy.pop("terrainContentHashPolicy")
        legacy.pop("queries")
        for key in ("queryHash", "sourceHash", "contentHash"):
            legacy.pop(key)
        legacy["observer"].update({"groundHeightM": None, "ellipsoidAltitudeKm": None, "metadataOrigin": "legacy-pipeline-height"})
        self.save(self.public / f"ephemeris_{other['id']}.json", legacy)
        with self.assertRaisesRegex(ValueError, "Cached ephemeris for legacy-other-site.*legacy is not promoted"):
            self.run_main("--skip-existing", "--sites", self.site["id"])
        self.assert_unpublished()
        self.assertEqual(json.loads((self.public / f"horizon_{self.site['id']}.json").read_text()), self.horizon)

    def test_final_publication_revalidates_dependencies_before_any_record_write(self):
        ordered = sorted(self.layers[:2], key=lambda layer: (layer["spacingM"], layer["id"])) + self.layers[2:]
        manifest = {
            "coverage": self.coverage, "layers": ordered,
            "terrainContentHashPolicy": "pilot-terrain-f64be-sha256-v1", "terrainContentHash": self.identity,
        }
        horizon = deepcopy(self.horizon)
        horizon.pop("terrainContentHashPolicy")
        with self.assertRaisesRegex(ValueError, "legacy is not promoted"):
            builder.publish_generated_pack(
                manifest, [self.site], builder.load_served_mosaic(ordered), self.registry,
                {self.site["id"]: horizon}, {self.site["id"]: self.ephemeris}, [],
            )
        self.assert_unpublished()
        self.assertEqual(json.loads((self.public / f"horizon_{self.site['id']}.json").read_text()), self.horizon)


if __name__ == "__main__":
    unittest.main()
