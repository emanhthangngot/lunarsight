"""Evidence-linked AI Advisor bound to immutable AnalysisResultModel records."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import requests
import threading

from ..config import Settings
from ..models import AdvisorCitation, AdvisorRequest, AdvisorResponse, AnalysisResultModel
from .storage import SQLiteStorage
from .resources import Admission, BoundedHttp, CapacityError


def _fmt_pct(value: float | None) -> str:
    return "Unknown" if value is None else f"{value:.1f}%"


def _fmt_hours(value: float | None) -> str:
    return "Unknown" if value is None else f"{value:.1f} h"


def _utc_iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def _build_citations(result: AnalysisResultModel) -> list[AdvisorCitation]:
    m = result.analysis.metrics
    src = result.ephemeris.provenance.source
    return [
        AdvisorCitation(
            label="Site & coordinates",
            value=f"{result.inputs.site.name} ({result.inputs.site.latDeg:.4f}°, {result.inputs.site.lonDegE:.4f}° E)",
            source=result.inputs.site.provenance.source,
        ),
        AdvisorCitation(
            label="Mission window",
            value=f"{_utc_iso(result.inputs.startUtcMs)} · {m.windowHours:.1f} h (step {result.inputs.stepSeconds} s, mast {result.inputs.observerHeightM} m)",
            source=f"resultId={result.id}",
        ),
        AdvisorCitation(
            label="Sunlit availability",
            value=f"{_fmt_pct(m.sunlitPercent)} ({_fmt_hours(m.sunlitHours)}), max darkness {_fmt_hours(m.longestDarknessHours)}",
            source=src,
        ),
        AdvisorCitation(
            label="Earth-visible availability",
            value=f"{_fmt_pct(m.earthVisiblePercent)} ({_fmt_hours(m.earthVisibleHours)}), max blackout {_fmt_hours(m.longestEarthBlackoutHours)}",
            source=src,
        ),
        AdvisorCitation(
            label="Simultaneous Sun + Earth",
            value=f"{_fmt_pct(m.bothPercent)} ({_fmt_hours(m.bothHours)})",
            source=src,
        ),
    ]


def _build_deterministic_advice(result: AnalysisResultModel, language: str) -> tuple[str, list[str], list[str]]:
    m = result.analysis.metrics
    site = result.inputs.site
    unknown = result.mask is None or any(value is None for value in m.model_dump().values())

    if language == "vi":
        if unknown:
            summary = (
                f"Kết quả {result.id} tại {site.name} ({site.latDeg:.4f}°, {site.lonDegE:.4f}° E) "
                f"trong cửa sổ {m.windowHours:.1f} giờ hiện có trạng thái tầm nhìn KHÔNG XÁC ĐỊNH (Unknown) "
                f"vì một phần bằng chứng địa hình/tầm nhìn không có sẵn."
            )
            recommendations = [
                "Không dùng giá trị 0 thay thế cho dữ liệu thiếu; kiểm tra vùng phủ và mẫu nguồn.",
                "Kiểm tra phạm vi hữu hạn của horizon mask; không suy diễn an toàn hạ cánh.",
            ]
        else:
            sun_pct = m.sunlitPercent or 0.0
            earth_pct = m.earthVisiblePercent or 0.0
            dark_h = m.longestDarknessHours or 0.0
            blackout_h = m.longestEarthBlackoutHours or 0.0
            summary = (
                f"Tại {site.name} (cao độ quan sát {result.inputs.observerHeightM} m AGL, cửa sổ {m.windowHours:.1f} giờ), "
                f"Mặt Trời chiếu sáng {sun_pct:.1f}% ({_fmt_hours(m.sunlitHours)}) với chuỗi tối liên tục dài nhất {dark_h:.1f} giờ; "
                f"Trái Đất nhìn thấy {earth_pct:.1f}% ({_fmt_hours(m.earthVisibleHours)}) với chuỗi khuất liên tục dài nhất {blackout_h:.1f} giờ; "
                f"cả hai cùng hiện diện {_fmt_pct(m.bothPercent)}."
            )
            recommendations = []
            if dark_h >= 72.0:
                recommendations.append(
                    f"Chuỗi tối dài nhất đạt {dark_h:.1f} giờ: cần đánh giá riêng dự trữ pin/sưởi ấm sinh tồn (phân tích này chỉ đo tầm nhìn hình học)."
                )
            else:
                recommendations.append(
                    f"Chuỗi tối tối đa {dark_h:.1f} giờ tương đối thuận lợi về mặt hình học chiếu sáng; nên kiểm tra thêm ở các độ cao mast khác (0.25 m / 1 m / 10 m)."
                )
            if blackout_h >= 48.0:
                recommendations.append(
                    f"Chuỗi khuất Trái Đất dài nhất {blackout_h:.1f} giờ: cần phương án lưu trữ dữ liệu cục bộ hoặc relay liên lạc khi mất đường ngắm trực tiếp."
                )
            if not site.nameVerified:
                recommendations.append(
                    "Observer/catalog identity is source-derived and provisional; assess local slope and surface hazards independently."
                )
        limitations = [
            "Chỉ phản ánh tầm nhìn tâm Mặt Trời/Trái Đất trên địa hình PGDA (không bao gồm khúc xạ, công suất điện pin mặt trời hay suy hao RF).",
            f"Bước đầu ra {result.inputs.stepSeconds} giây không xác lập độ chính xác chuyển tiếp; cần xét bước nguồn và nội suy.",
            "Không phải chứng nhận an toàn hạ cánh hay dữ liệu bay chính thức.",
        ]
        return summary, recommendations, limitations

    # English
    if unknown:
        summary = (
            f"Result {result.id} for {site.name} ({site.latDeg:.4f}°, {site.lonDegE:.4f}° E) "
            f"over {m.windowHours:.1f} h has UNKNOWN visibility because some terrain/visibility evidence is unavailable."
        )
        recommendations = [
            "Do not treat unknown intervals as zero; inspect terrain coverage and source samples.",
            "Inspect the finite horizon extent; do not infer landing safety.",
        ]
    else:
        sun_pct = m.sunlitPercent or 0.0
        earth_pct = m.earthVisiblePercent or 0.0
        dark_h = m.longestDarknessHours or 0.0
        blackout_h = m.longestEarthBlackoutHours or 0.0
        summary = (
            f"At {site.name} ({result.inputs.observerHeightM} m AGL over {m.windowHours:.1f} h), "
            f"Sun centre is visible {sun_pct:.1f}% ({_fmt_hours(m.sunlitHours)}) with longest darkness {dark_h:.1f} h; "
            f"Earth centre is visible {earth_pct:.1f}% ({_fmt_hours(m.earthVisibleHours)}) with longest blackout {blackout_h:.1f} h; "
            f"both are simultaneously visible {_fmt_pct(m.bothPercent)}."
        )
        recommendations = []
        if dark_h >= 72.0:
            recommendations.append(
                f"Longest darkness reaches {dark_h:.1f} h: evaluate battery/thermal survival separately (visibility is not electrical power)."
            )
        else:
            recommendations.append(
                f"Longest darkness is {dark_h:.1f} h; compare sensitivity across 0.25 m / 1 m / 10 m observer heights."
            )
        if blackout_h >= 48.0:
            recommendations.append(
                f"Longest Earth blackout is {blackout_h:.1f} h: plan store-and-forward or relay comms during LOS gaps."
            )
        if not site.nameVerified:
            recommendations.append(
                "Observer/catalog identity is source-derived and provisional; assess local slope and surface hazards independently."
            )
    limitations = [
        "Geometric centre-above-terrain visibility only; does not model solar power output, RF link margin, or atmospheric/penumbral effects.",
        f"Output step {result.inputs.stepSeconds} s does not establish transition accuracy; source cadence/interpolation also limit it.",
        "Preliminary screening only; not flight-certified.",
    ]
    return summary, recommendations, limitations


class AdvisorService:
    """Keep deterministic facts authoritative and optional private prose explicitly unverified."""

    def __init__(self, settings: Settings, storage: SQLiteStorage) -> None:
        self._settings = settings
        self._storage = storage
        self._admission = Admission(1)
        self._budget_lock = threading.Lock()
        self._provider_calls = 0
        self._http = BoundedHttp(1)

    def advise(self, req: AdvisorRequest) -> AdvisorResponse | None:
        result = self._storage.get_result_by_id(req.resultId)
        if result is None:
            return None

        citations = _build_citations(result)
        det_summary, det_recs, det_limits = _build_deterministic_advice(result, req.language)

        if not self._settings.llm_api_key:
            return AdvisorResponse(
                resultId=result.id,
                mode="deterministic",
                summary=det_summary,
                recommendations=det_recs,
                limitations=det_limits,
                citations=citations,
                providerUnavailable=False,
                providerError=None,
            )

        with self._admission.enter():
            with self._budget_lock:
                if self._provider_calls >= 32:
                    raise CapacityError("Private advisor lifetime budget exhausted (32 calls per process)")
                self._provider_calls += 1
            try:
                llm_summary, llm_recs = self._call_llm(result, citations, req.question, req.language)
                return AdvisorResponse(
                    resultId=result.id, mode="llm",
                    summary=det_summary, recommendations=det_recs,
                    limitations=[*det_limits, "External provider prose is unverified, not evidence; citations support only deterministic facts."],
                    citations=citations,
                    unverifiedProviderSummary=llm_summary,
                    unverifiedProviderRecommendations=llm_recs,
                )
            except CapacityError:
                raise
            except (requests.RequestException, ValueError, KeyError, IndexError, TypeError, TimeoutError, RuntimeError):
                return AdvisorResponse(
                    resultId=result.id, mode="deterministic_fallback",
                    summary=det_summary, recommendations=det_recs, limitations=det_limits,
                    citations=citations, providerUnavailable=True,
                    providerError="External provider unavailable or invalid; deterministic summary preserved.",
                )

    def _call_llm(
        self,
        result: AnalysisResultModel,
        citations: list[AdvisorCitation],
        question: str,
        language: str,
    ) -> tuple[str, list[str]]:
        context = {
            "resultId": result.id,
            "calcHash": result.calcHash,
            "provenance": result.ephemeris.provenance.model_dump(mode="json"),
            "inputs": {
                "site": result.inputs.site.name,
                "latDeg": result.inputs.site.latDeg,
                "lonDegE": result.inputs.site.lonDegE,
                "observerHeightM": result.inputs.observerHeightM,
                "startUtcMs": result.inputs.startUtcMs,
                "durationDays": result.inputs.durationDays,
                "stepSeconds": result.inputs.stepSeconds,
            },
            "metrics": result.analysis.metrics.model_dump(mode="json"),
            "citations": [c.model_dump(mode="json") for c in citations],
        }
        system_prompt = (
            "You are the LunarSight Mission Advisor. Answer ONLY using the exact JSON metrics and "
            "provenance supplied. Never invent numbers, never fill null/unknown values with 0, and "
            "never claim visibility equals electrical power, radio link margin, or flight certification. "
            f"Respond in {'Vietnamese' if language == 'vi' else 'English'} as JSON with keys "
            '{"summary": string, "recommendations": string[], "facts": exact supplied metrics object}. '
            "Facts must retain every null and number unchanged. Free prose is unverified."
        )
        payload = self._http.request(
            requests.post,
            f"{self._settings.llm_base_url}/chat/completions",
            headers={
                "Authorization": f"Bearer {self._settings.llm_api_key}",
                "Content-Type": "application/json",
                "Accept-Encoding": "identity",
            },
            json={
                "model": self._settings.llm_model,
                "temperature": 0.2,
                "response_format": {"type": "json_object"},
                "max_tokens": 800,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {
                        "role": "user",
                        "content": f"Question: {question}\n\nStored conditional result JSON:\n{json.dumps(context)}",
                    },
                ],
            },
            timeout_s=self._settings.llm_timeout_s,
            max_bytes=65_536,
        )
        if not isinstance(payload, dict):
            raise ValueError("Provider response must be an object")
        content = payload["choices"][0]["message"]["content"]
        if not isinstance(content, str) or len(content) > 6000:
            raise ValueError("Invalid provider content")
        parsed = json.loads(content)
        if not isinstance(parsed, dict) or set(parsed) != {"summary", "recommendations", "facts"}:
            raise ValueError("Invalid structured provider fields")
        expected = result.analysis.metrics.model_dump(mode="json")
        facts = parsed["facts"]
        if (not isinstance(facts, dict) or set(facts) != set(expected)
                or any((facts[k] is not None if v is None else
                        type(facts[k]) not in (int, float) or facts[k] != v)
                       for k, v in expected.items())):
            raise ValueError("Provider facts contradict stored metrics")
        summary, recs = parsed["summary"], parsed["recommendations"]
        if not isinstance(summary, str) or not summary.strip() or len(summary) > 4000:
            raise ValueError("Invalid provider summary")
        if (not isinstance(recs, list) or len(recs) > 5
                or any(not isinstance(item, str) or not item.strip() or len(item) > 500 for item in recs)):
            raise ValueError("Invalid provider recommendations")
        return summary.strip(), [item.strip() for item in recs]
