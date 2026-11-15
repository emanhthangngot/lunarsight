"""Immutable startup bytes shared by every scientific service."""
from __future__ import annotations

import hashlib
import json
import math
import struct
from pathlib import Path
from types import MappingProxyType
from collections.abc import Mapping

from ..config import METHOD_VERSION, MOON_RADIUS_M, HORIZON_MAX_RANGE_M
from ..geo import validate_coordinates
from ..models import DemManifest, ObserverMetadata, Provenance, SiteSummary

MAX_ASSET_BYTES = 128 * 1024 * 1024
SCIENCE_METHODS = "bilinear-v1;spherical-horizon-1deg-25m-4pct-v1;horizons-observer-q4-startgrid-v2;linear-circular-resample-v2"
TERRAIN_HASH_POLICY = "pilot-terrain-f64be-sha256-v1"
VALIDITY_POLICY = "pilot-validity-v1"
HORIZON_METHOD = "spherical-raymarch-25m-4percent-v1"


def terrain_dependency_preimage(manifest: DemManifest, actual_hashes: Mapping[str, str]) -> bytes:
    """Encode the cross-language dependency wire, using hashes of captured bytes."""
    def numeric_hex(value: float) -> str:
        if not math.isfinite(value):
            raise ValueError("Generated terrain geometry/coverage must be finite")
        return struct.pack(">d", float(value)).hex()

    coverage = manifest.coverage
    bounds = [coverage.southDeg, coverage.northDeg, coverage.westDegE, coverage.eastDegE]
    if not (-90 <= bounds[0] <= bounds[1] <= 90 and 0 <= bounds[2] <= bounds[3] <= 360):
        raise ValueError("Invalid generated terrain coverage")
    layers = []
    if not manifest.layers:
        raise ValueError("Generated terrain requires layers")
    for layer in manifest.layers:
        if layer.rows < 2 or layer.cols < 2 or layer.spacingM <= 0:
            raise ValueError("Invalid generated terrain geometry")
        actual = actual_hashes.get(Path(layer.url).name)
        if actual is None or layer.sha256 is None or layer.sha256.lower() != actual:
            raise ValueError("Generated terrain layer checksum contradicts captured bytes")
        geometry = [layer.xMinM, layer.yMaxM, layer.spacingM, layer.rows, layer.cols]
        layers.append([*[numeric_hex(value) for value in geometry], actual])
    return json.dumps(
        [TERRAIN_HASH_POLICY, VALIDITY_POLICY, "R=1737400m",
         [numeric_hex(value) for value in bounds], layers],
        separators=(",", ":"), allow_nan=False,
    ).encode("utf-8")


def _require_numeric_geometry(record: object, fields: tuple[str, ...]) -> None:
    """Check JSON number types before Pydantic can coerce strings or booleans."""
    if not isinstance(record, dict):
        raise ValueError("Generated terrain geometry must be a numeric object")
    for field in fields:
        value = record.get(field)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"Generated terrain {field} must be a finite numeric value")
        try:
            finite = math.isfinite(value)
        except OverflowError as exc:
            raise ValueError(f"Generated terrain {field} exceeds Float64 numeric range") from exc
        if not finite:
            raise ValueError(f"Generated terrain {field} must be a finite numeric value")


def has_generated_claim(raw: dict) -> bool:
    """An incomplete generated record must never fall back to legacy acceptance."""
    if not isinstance(raw, dict):
        raise ValueError("Scientific asset must be a JSON object")
    provenance = raw.get("provenance") or {}
    observer = raw.get("observer") or {}
    if not isinstance(provenance, dict) or not isinstance(observer, dict):
        raise ValueError("Scientific asset provenance/observer must be objects")
    return (
        any(raw.get(key) is not None for key in (
            "terrainContentHashPolicy", "terrainContentHash", "contentHash", "queryHash", "horizonMethod"))
        or any(provenance.get(key) is not None for key in ("method", "contentHash"))
        or observer.get("metadataOrigin") in ("pipeline-record", "runtime-dem-query")
    )


class ScienceAssets:
    """Capture bytes once; changing a deployment requires a new process/snapshot."""

    def __init__(self, public_dir: Path, src_dir: Path | None = None) -> None:
        captured: dict[str, bytes] = {}
        total = 0
        # Public numerical assets take precedence; catalog/registry live in src.
        for directory in (public_dir, src_dir):
            if directory is None:
                continue
            paths = sorted({*directory.glob("terrain_*.bin"), *directory.glob("terrain_manifest.json"),
                            *directory.glob("ephemeris_*.json"), *directory.glob("horizon_*.json"),
                            *directory.glob("sites.json"), *directory.glob("observerMetadata.json")})
            for path in paths:
                if path.name in captured:
                    continue
                if path.stat().st_size > MAX_ASSET_BYTES - total:
                    raise ValueError("Scientific startup assets exceed 128 MiB")
                content = path.read_bytes()
                total += len(content)
                if total > MAX_ASSET_BYTES:
                    raise ValueError("Scientific startup assets exceed 128 MiB")
                captured[path.name] = content
        # Manifest URLs are the binary contract; a filename need not carry the
        # current generator's terrain_ prefix to participate in the snapshot.
        if "terrain_manifest.json" in captured:
            for layer in json.loads(captured["terrain_manifest.json"])["layers"]:
                filename = Path(layer["url"]).name
                if not filename.lower().endswith(".bin"):
                    raise ValueError("DEM manifest must reference binary source assets")
                if filename in captured:
                    continue
                path = public_dir / filename
                if path.stat().st_size > MAX_ASSET_BYTES - total:
                    raise ValueError("Scientific startup assets exceed 128 MiB")
                content = path.read_bytes()
                total += len(content)
                if total > MAX_ASSET_BYTES:
                    raise ValueError("Scientific startup assets exceed 128 MiB")
                captured[filename] = content
        self.bytes = MappingProxyType(captured)
        digest = hashlib.sha256()
        digest.update(f"{METHOD_VERSION};{SCIENCE_METHODS};{MOON_RADIUS_M};{HORIZON_MAX_RANGE_M}".encode())
        # Method code itself participates, not only a manually bumped public label.
        for name in ("assets.py", "terrain.py", "horizon.py", "ephemeris.py", "visibility.py", "analysis_jobs.py"):
            digest.update(name.encode() + Path(__file__).with_name(name).read_bytes())
        for name in ("geo.py", "models.py"):
            digest.update(name.encode() + Path(__file__).parent.parent.joinpath(name).read_bytes())
        content_digests = {name: hashlib.sha256(content).digest() for name, content in captured.items()}
        self.content_hashes = MappingProxyType({name: value.hex() for name, value in content_digests.items()})
        for name, value in sorted(content_digests.items()):
            digest.update(name.encode() + b"\0" + value)
        self.fingerprint = digest.hexdigest()
        self.sites = MappingProxyType({site.id: site for site in (
            SiteSummary.model_validate(item) for item in json.loads(captured.get("sites.json", b"[]"))
        )})
        registry = json.loads(captured.get("observerMetadata.json", b'{"sites":{}}'))
        if registry.get("version") not in (None, "pilot-observer-metadata-v1"):
            raise ValueError("Unsupported observer metadata registry")
        self.observers = MappingProxyType({sid: ObserverMetadata.model_validate(value)
                                          for sid, value in registry["sites"].items()})
        for sid, observer in self.observers.items():
            self.validate_site(sid, observer.latDeg, observer.lonDegE)
        if self.sites and any(name.startswith("ephemeris_") for name in captured):
            if set(self.observers) != set(self.sites):
                raise ValueError("Observer metadata must cover the complete startup catalog")
        self.terrain_content_hash: str | None = None
        manifest_raw = json.loads(captured.get("terrain_manifest.json", b"{}"))
        if has_generated_claim(manifest_raw):
            if manifest_raw.get("terrainContentHashPolicy") != TERRAIN_HASH_POLICY:
                raise ValueError("Generated terrain requires the supported terrainContentHashPolicy")
            declared_method = manifest_raw.get("provenance", {}).get("method")
            if declared_method is not None and declared_method != VALIDITY_POLICY:
                raise ValueError("Generated terrain validity method conflicts with the supported dependency policy")
            _require_numeric_geometry(
                manifest_raw.get("coverage"), ("southDeg", "northDeg", "westDegE", "eastDegE"))
            raw_layers = manifest_raw.get("layers")
            if not isinstance(raw_layers, list) or not raw_layers:
                raise ValueError("Generated terrain requires numeric layer geometry")
            for raw_layer in raw_layers:
                _require_numeric_geometry(raw_layer, ("xMinM", "yMaxM", "spacingM", "rows", "cols"))
                if any(value < 2 or not float(value).is_integer()
                       for value in (raw_layer["rows"], raw_layer["cols"])):
                    raise ValueError("Generated terrain rows/cols must be numeric integers >= 2")
            manifest = DemManifest.model_validate(manifest_raw)
            for layer in manifest.layers:
                if len(captured[Path(layer.url).name]) != layer.rows * layer.cols * 4:
                    raise ValueError("Generated terrain binary size disagrees with geometry")
            actual = hashlib.sha256(terrain_dependency_preimage(manifest, self.content_hashes)).hexdigest()
            if manifest.terrainContentHash != actual:
                raise ValueError("Generated terrainContentHash contradicts actual captured terrain")
            self.terrain_content_hash = actual

    def validate_preset_dependency(
        self, raw: dict, observer: ObserverMetadata | None = None,
    ) -> bool:
        generated = (self.terrain_content_hash is not None or has_generated_claim(raw)
                     or (observer is not None and observer.metadataOrigin != "legacy-pipeline-height"))
        if generated:
            if (self.terrain_content_hash is None
                    or raw.get("terrainContentHashPolicy") != TERRAIN_HASH_POLICY
                    or raw.get("terrainContentHash") != self.terrain_content_hash):
                raise ValueError("Generated preset terrain dependency does not match current captured terrain")
        elif observer is None or (
            observer.metadataOrigin != "legacy-pipeline-height"
            or observer.groundHeightM is not None or observer.ellipsoidAltitudeKm is not None
        ):
            raise ValueError("Legacy preset requires unknown historical observer ground/altitude")
        return generated

    def validate_site(self, site_id: str | None, lat: float, lon: float) -> None:
        if site_id is None or site_id.startswith("custom:"):
            return
        site = self.sites.get(site_id)
        if site is None:
            raise ValueError(f"Unknown catalog siteId '{site_id}'")
        if not self.coordinates_match(lat, lon, site.latDeg, site.lonDegE):
            raise ValueError("siteId coordinates do not match the canonical catalog observer")

    @staticmethod
    def coordinates_match(lat: float, lon: float, other_lat: float, other_lon: float) -> bool:
        actual = validate_coordinates(lat, lon)
        canonical = validate_coordinates(other_lat, other_lon)
        # Floating-point longitude wrap roundoff only, not a geographic tolerance.
        return actual[0] == canonical[0] and abs(actual[1] - canonical[1]) <= 8 * math.ulp(360.0)

    def provenance(self, raw: Provenance, site_id: str, *, generated: bool = False) -> Provenance:
        site = self.sites.get(site_id)
        if site is None:
            return raw.model_copy(deep=True)
        status = ("Generated numerical asset; terrain dependency checked against captured bytes; "
                  "see recorded observer metadata." if generated else
                  "Legacy numerical asset retained unchanged; see observer metadata.")
        return raw.model_copy(update={
            "source": raw.source,
            "notes": (f"{site.name} ({site_id}); canonical technical observer ({site.latDeg}, {site.lonDegE} E). "
                      "Conditional datum/frame and finite horizon; not independently validated. "
                      f"{status}"),
        })
