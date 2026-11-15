"""Synthetic/offline task34 regressions, not measured lunar reference evidence.

The missing protection is at the input boundary: finite fill values, raw nodata,
scale/offset and incomplete blocks must not become qualified observations. Pure
NumPy tests protect arithmetic/policy; a synthetic raster reader fixture exercises
the real ingestion path without importing rasterio or reading any raster.
"""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
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


validity = load_module("pilot_validity_fixture", PIPELINE / "validity.py")

# The builder supports direct-script imports. Bind only its local helper, leaving
# requests and the actual numerical implementation real; no main/I/O is invoked.
with patch.dict(sys.modules, {"validity": validity}):
    builder = load_module("pilot_builder_fixture", PIPELINE / "build_pilot_assets.py")


LUNAR_CRS = {
    "proj": "stere", "lat_0": -90.0, "lat_ts": -90.0, "lon_0": 0.0,
    "a": 1737400.0, "b": 1737400.0, "units": "m", "x_0": 0.0, "y_0": 0.0,
}
TRANSFORM = (5.0, 0.0, -10.0, 0.0, -5.0, 10.0)


class PipelineValidityTests(unittest.TestCase):
    def test_mask_and_raw_nodata_precede_scale_and_preserve_real_zero(self):
        raw = np.array([[0, 2, -9999], [4, 8, 10]], dtype=np.int16)
        mask = np.array([[255, 255, 255], [0, 255, 255]], dtype=np.uint8)
        actual = validity.decode_heights(raw, mask, nodata=-9999, scale=0.5, offset=-1.0)
        expected = np.array([[-1.0, 0.0, np.nan], [np.nan, 3.0, 4.0]], dtype=np.float32)
        np.testing.assert_equal(actual, expected)

    def test_nonfinite_and_overflow_values_are_unavailable(self):
        raw = np.array([[0.0, np.nan], [np.inf, 1e39]], dtype=np.float64)
        actual = validity.decode_heights(raw, np.ones((2, 2)), nodata=np.nan, scale=1.0, offset=0.0)
        np.testing.assert_equal(actual, [[0.0, np.nan], [np.nan, np.nan]])
        for scale, offset in [(0, 0), (np.inf, 0), (1, np.nan)]:
            with self.subTest(scale=scale, offset=offset), self.assertRaises(ValueError):
                validity.decode_heights(raw, np.ones((2, 2)), nodata=None, scale=scale, offset=offset)

    def test_partly_missing_blocks_never_acquire_finite_means(self):
        # Hand-worked 2x2 blocks: mean(0,2,4,6)=3; one missing pixel
        # invalidates the entire next block. Incomplete fifth column is omitted.
        grid = np.array([[0, 2, 10, 12, 900], [4, 6, 14, np.nan, 900]], dtype=np.float32)
        actual = validity.downsample_block_mean(grid, 2)
        np.testing.assert_equal(actual, [[3.0, np.nan]])
        summary = validity.validity_summary(actual)
        self.assertEqual(summary, {"validCellCount": 1, "totalCellCount": 2, "minHeightM": 3.0, "maxHeightM": 3.0})
        missing = validity.validity_summary(np.full((2, 2), np.nan))
        self.assertEqual(missing["validCellCount"], 0)
        self.assertIsNone(missing["minHeightM"])
        self.assertIsNone(missing["maxHeightM"])

    def test_documented_units_policy_is_explicit_and_datum_stays_conditional(self):
        policy = validity.validate_raster_policy(LUNAR_CRS, TRANSFORM, expected_spacing_m=5, height_unit=None)
        self.assertEqual(policy["heightUnitOrigin"], "documented-pgda-product-policy")
        self.assertEqual(policy["datumStatus"], "conditional")
        self.assertEqual(policy["transform"], list(TRANSFORM))
        declared = validity.validate_raster_policy(LUNAR_CRS, TRANSFORM, expected_spacing_m=5, height_unit="m")
        self.assertEqual(declared["heightUnitOrigin"], "band-metadata")

    def test_unsupported_projection_frame_grid_and_units_are_rejected(self):
        changes = [
            {"proj": "longlat"}, {"a": 6378137, "b": 6356752},
            {"lat_0": 90}, {"lon_0": 180}, {"lat_ts": -71},
            {"units": "km"}, {"x_0": 100}, {"k": 0.99},
            {"axis": "neu"}, {"towgs84": "0,0,0"}, {"pm": "paris"},
        ]
        for change in changes:
            with self.subTest(change=change), self.assertRaises(ValueError):
                validity.validate_raster_policy({**LUNAR_CRS, **change}, TRANSFORM, expected_spacing_m=5, height_unit="m")
        for transform in [(5, 1, -10, 0, -5, 10), (5, 0, -10, 0, 5, 10), (10, 0, -10, 0, -10, 10)]:
            with self.subTest(transform=transform), self.assertRaises(ValueError):
                validity.validate_raster_policy(LUNAR_CRS, transform, expected_spacing_m=5, height_unit="m")
        with self.assertRaises(ValueError):
            validity.validate_raster_policy(LUNAR_CRS, TRANSFORM, expected_spacing_m=5, height_unit="feet")
        with self.assertRaises(ValueError):
            validity.validate_raster_policy({}, TRANSFORM, expected_spacing_m=5, height_unit=None)

    def test_fingerprints_change_for_content_mask_query_and_method_not_dict_order(self):
        a = np.array([[0, 1], [2, 3]], dtype=np.float32)
        b = a.copy()
        b[1, 1] = np.nan
        self.assertNotEqual(validity.array_hash(a), validity.array_hash(b))
        self.assertEqual(validity.array_hash(a), validity.array_hash(a.astype(">f4")))
        self.assertEqual(validity.json_hash({"query": 1, "source": 2}), validity.json_hash({"source": 2, "query": 1}))
        baseline = {"version": "same-version", "content": validity.array_hash(a), "query": [0, 1], "method": "v1"}
        for changed in [{"content": validity.array_hash(b)}, {"query": [1, 2]}, {"method": "v2"}]:
            self.assertNotEqual(validity.json_hash(baseline), validity.json_hash({**baseline, **changed}))

    def test_generated_observer_records_only_actual_query_altitude(self):
        legacy = validity.observer_metadata(-89.785092, 204.018283, 9999.0)
        self.assertIsNone(legacy["groundHeightM"])
        self.assertIsNone(legacy["ellipsoidAltitudeKm"])
        self.assertEqual(legacy["metadataOrigin"], "legacy-pipeline-height")
        generated = validity.observer_metadata(-89.785092, 204.018283, 1500.126, generated=True)
        self.assertEqual(generated["groundHeightM"], 1500.126)
        self.assertEqual(generated["observerHeightM"], 1)
        self.assertEqual(generated["ellipsoidAltitudeKm"], 1.50113)
        query = builder.horizons_query("10", generated["lonDegE"], generated["latDeg"], generated["ellipsoidAltitudeKm"])
        self.assertEqual(query["SITE_COORD"], "204.018283,-89.785092,1.50113")
        self.assertEqual(generated["metadataOrigin"], "pipeline-record")
        self.assertEqual(generated["datumStatus"], "conditional")
        with self.assertRaises(ValueError):
            validity.observer_metadata(-89, 1, generated=True)

    def test_registry_preserves_all_canonical_observers_without_invented_legacy_altitudes(self):
        served = json.loads((ROOT / "web/src/data/pilot/sites.json").read_text())
        catalog = json.loads((PIPELINE / "sites_catalog.json").read_text())
        registry = json.loads((ROOT / "web/src/data/pilot/observerMetadata.json").read_text())
        expected_ids = {"site-04", "site-01", "site-06", "site-07", "site-11", "site-20", "site-23", "haworth", "shoemaker", "dm2", "amundsen-rim", "faustini-rim-a", "de-gerlache-rim-2", "connecting-ridge-ext", "de-gerlache-kocher"}
        self.assertEqual(set(registry["sites"]), expected_ids)
        self.assertEqual({s["id"] for s in served}, expected_ids)
        self.assertEqual({s["id"] for s in catalog}, expected_ids)
        for site in served:
            observer = registry["sites"][site["id"]]
            self.assertEqual((observer["latDeg"], observer["lonDegE"]), (site["latDeg"], site["lonDegE"]))
            self.assertEqual(observer["observerHeightM"], 1)
            self.assertIsNone(observer["groundHeightM"])
            self.assertIsNone(observer["ellipsoidAltitudeKm"])
            self.assertEqual(observer["metadataOrigin"], "legacy-pipeline-height")
            self.assertEqual(observer["datumStatus"], "conditional")
            self.assertFalse(site["nameVerified"])
        expected = {
            "site-04": ("Site 04 — Shackleton rim", -89.785092, 204.018283),
            "site-01": ("Site 01 — Connecting ridge", -89.4632, 222.51),
            "site-11": ("Site 11 — de Gerlache rim", -88.68342, 292.0679),
        }
        for entries in [served, catalog]:
            indexed = {s["id"]: s for s in entries}
            for site_id, reference in expected.items():
                site = indexed[site_id]
                self.assertEqual((site["name"], site["latDeg"], site["lonDegE"]), reference)
            self.assertEqual(indexed["site-04"]["coordinateStatus"], "provisional-technical-observer")

    def test_generated_layer_sha256_rejects_same_version_changed_bytes_and_legacy_metadata(self):
        with TemporaryDirectory() as directory, patch.object(builder, "PUBLIC_DIR", Path(directory)):
            path = Path(directory) / "fixture.bin"
            grid = np.array([[0, 2], [4, np.nan]], dtype="<f4")
            grid.tofile(path)
            input_provenance = {
                "policy": {"policyVersion": validity.POLICY_VERSION},
                "queryHash": validity.json_hash({"syntheticWindow": [0, 0, 2, 2]}),
            }
            meta = builder.layer_metadata_from_bin(
                "fixture", "fixture-site", path.name, -10, 10, 5, 2, 2,
                grid, "synthetic offline grid", input_provenance,
            )
            self.assertEqual(meta["validCellCount"], 3)
            self.assertEqual(meta["totalCellCount"], 4)
            self.assertEqual(meta["sha256"], validity.file_hash(path))
            builder.require_current_layer(meta)
            grid[0, 0] = 1
            grid.tofile(path)
            with self.assertRaisesRegex(ValueError, "bytes no longer match"):
                builder.require_current_layer(meta)
            with self.assertRaisesRegex(ValueError, "Legacy DEM"):
                builder.require_current_layer({"id": "legacy", "url": "/data/pilot/fixture.bin"})

    def test_real_raster_boundary_decodes_and_records_synthetic_source_identity(self):
        class Transform:
            c = -10.0
            f = 10.0

            def __iter__(self):
                return iter(TRANSFORM)

        class Raster:
            count = 1
            width = height = 2
            crs = SimpleNamespace(to_dict=lambda: dict(LUNAR_CRS), to_wkt=lambda: "SYNTHETIC lunar stereographic fixture")
            transform = Transform()
            units = ("m",)
            nodatavals = (-9999,)
            scales = (2.0,)
            offsets = (-2.0,)
            mask_flag_enums = ([SimpleNamespace(name="per_dataset")],)
            mask = np.array([[255, 255], [0, 255]], dtype=np.uint8)

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def read(self, band, *, window):
                return np.array([[1, -9999], [5, 3]], dtype=np.int16)

            def read_masks(self, band, *, window):
                return self.mask

        raster = Raster()
        modules = {
            "rasterio": SimpleNamespace(open=lambda path: raster),
            "rasterio.windows": SimpleNamespace(from_bounds=lambda *args: self.fail("No window requested")),
        }
        with patch.dict(sys.modules, modules):
            grid, meta = builder.read_dem("synthetic://fixture", "synthetic://source", 5.0)
            np.testing.assert_equal(grid, [[0.0, np.nan], [np.nan, 4.0]])
            aggregated = validity.downsample_block_mean(grid, 2)
            self.assertTrue(np.isnan(aggregated[0, 0]))
            evidence = meta["inputProvenance"]
            self.assertEqual(evidence["policy"]["scale"], 2)
            self.assertEqual(evidence["policy"]["offset"], -2)
            self.assertEqual(evidence["query"]["window"], [0, 0, 2, 2])
            self.assertIsNone(evidence["source"]["fileSha256"])
            self.assertEqual(evidence["source"]["checksumScope"], "queried-window-only")
            raster.mask = np.full((2, 2), 255, dtype=np.uint8)
            changed, changed_meta = builder.read_dem("synthetic://fixture", "synthetic://source", 5.0)
            self.assertEqual(changed[1, 0], 8)
            self.assertNotEqual(evidence["inputHash"], changed_meta["inputProvenance"]["inputHash"])
            self.assertNotEqual(evidence["decodedContentHash"], changed_meta["inputProvenance"]["decodedContentHash"])


if __name__ == "__main__":
    unittest.main()
