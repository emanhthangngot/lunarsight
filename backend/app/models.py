"""Pydantic schemas aligned with web/src/data/contract.ts, visibility.ts, and docs/api-design.md."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field

DataKind = Literal["mock", "processed"]
SiteCategory = Literal["mock", "custom", "apollo", "clps", "artemis-candidate", "international"]
JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]


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


class WindowMetrics(BaseModel):
    windowHours: float
    sunlitPercent: float | None
    earthVisiblePercent: float | None
    bothPercent: float | None
    sunlitHours: float | None
    earthVisibleHours: float | None
    bothHours: float | None
    longestDarknessHours: float | None
    longestEarthBlackoutHours: float | None


class VisibilityAnalysis(BaseModel):
    sunVisible: list[bool | None]
    earthVisible: list[bool | None]
    both: list[bool | None]
    metrics: WindowMetrics


class ScenarioInputsModel(BaseModel):
    site: SiteSummary
    startUtcMs: int
    durationDays: float
    stepSeconds: int
    observerHeightM: float


class AnalysisResultModel(BaseModel):
    id: str
    calcHash: str
    inputs: ScenarioInputsModel
    ephemeris: EphemerisSeries
    mask: HorizonMask | None
    analysis: VisibilityAnalysis
    createdAt: str


class AnalysisRequest(BaseModel):
    inputs: ScenarioInputsModel
    idempotencyKey: str | None = None


class AnalysisJobModel(BaseModel):
    id: str
    calcHash: str
    status: JobStatus
    progress: float
    resultId: str | None = None
    errorMessage: str | None = None
    outsideCoverage: bool = False
    createdAt: str
    updatedAt: str


class AnalysisSubmitResponse(BaseModel):
    status: Literal["cached", "accepted"]
    result: AnalysisResultModel | None = None
    job: AnalysisJobModel | None = None


class SaveScenarioRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
    inputs: ScenarioInputsModel
    resultId: str | None = None


class SavedScenarioSummary(BaseModel):
    id: str
    title: str
    notes: str | None = None
    inputs: ScenarioInputsModel
    resultId: str | None = None
    metrics: WindowMetrics | None = None
    createdAt: str


class SavedScenarioDetail(BaseModel):
    id: str
    title: str
    notes: str | None = None
    inputs: ScenarioInputsModel
    result: AnalysisResultModel | None = None
    createdAt: str


class AdvisorRequest(BaseModel):
    resultId: str = Field(..., min_length=1)
    question: str = Field(
        default="Summarize solar illumination, Earth visibility, and key operational risks for this site.",
        min_length=1,
        max_length=1000,
    )
    language: Literal["en", "vi"] = "vi"


class AdvisorCitation(BaseModel):
    label: str
    value: str
    source: str


class AdvisorResponse(BaseModel):
    resultId: str
    mode: Literal["llm", "deterministic", "deterministic_fallback"]
    summary: str
    recommendations: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    citations: list[AdvisorCitation] = Field(default_factory=list)
    providerUnavailable: bool = False
    providerError: str | None = None


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "lunarsight-backend"
    stage: str = "stage-3-advisor-packaging"
    terrainLayers: int
    catalogSites: int
    savedScenarios: int = 0
