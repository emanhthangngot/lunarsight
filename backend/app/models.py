"""Pydantic schemas aligned with web/src/data/contract.ts and docs/api-design.md."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

DataKind = Literal["mock", "processed"]
SiteCategory = Literal["mock", "custom", "apollo", "clps", "artemis-candidate", "international"]


class Provenance(BaseModel):
    kind: DataKind
    source: str
    version: str
    generatedAt: str
    notes: str | None = None


class SiteSummary(BaseModel):
    id: str
    name: str
    category: SiteCategory
    latDeg: float
    lonDegE: float
    nameVerified: bool
    description: str | None = None
    provenance: Provenance


class CoverageBounds(BaseModel):
    southDeg: float
    northDeg: float
    westDegE: float
    eastDegE: float


class DemLayerMeta(BaseModel):
    id: str
    siteId: str | None = None
    url: str
    xMinM: float
    yMaxM: float
    spacingM: float
    rows: int
    cols: int
    minHeightM: float
    maxHeightM: float
    source: str


class DemManifest(BaseModel):
    version: str
    coverage: CoverageBounds
    provenance: Provenance
    layers: list[DemLayerMeta]


class HorizonMask(BaseModel):
    siteId: str
    observerHeightM: float
    azimuthsDeg: list[float]
    elevationsDeg: list[float]
    maxRangeM: float
    provenance: Provenance


class EphemerisSeries(BaseModel):
    siteId: str
    frame: Literal["MOON_ME"] = "MOON_ME"
    startUtcMs: int
    stepSeconds: int
    timesUtcMs: list[int]
    sunAzDeg: list[float]
    sunElDeg: list[float]
    earthAzDeg: list[float]
    earthElDeg: list[float]
    provenance: Provenance


class ElevationResponse(BaseModel):
    latDeg: float
    lonDegE: float
    heightM: float | None
    outsideCoverage: bool
    layerId: str | None = None
    provenance: Provenance


class CoverageCheckRequest(BaseModel):
    latDeg: float
    lonDegE: float
    startUtcMs: int | None = None
    endUtcMs: int | None = None


class LayerCoverageItem(BaseModel):
    name: str
    status: Literal["supported", "partial", "outside_coverage", "dynamic"]
    detail: str
    version: str | None = None


class CoverageCheckResponse(BaseModel):
    latDeg: float
    lonDegE: float
    terrainSupported: bool
    horizonSupported: bool
    ephemerisMode: Literal["precomputed", "dynamic_horizons", "outside_coverage"]
    groundHeightM: float | None
    layers: list[LayerCoverageItem] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "lunarsight-backend"
    stage: str = "stage-1-core-api"
    terrainLayers: int
    catalogSites: int
