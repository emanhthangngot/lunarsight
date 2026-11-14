# Current handoff

Updated: **14 November 2026**. **Public Vercel Production healthy within the anonymous mock browser smoke scope.** Prior local Three.js acceptance remains PASS with V1 CLOSED for default Ridge/Rim; on `feat/pilot-data-pipeline`, offline pilot assets, `PilotDataProvider`, `ApiDataProvider`, and FastAPI Stages 1–3 were added and merged with `main`'s pre-decision DE terrain/horizon reviews. Neither result is full scientific or universal-performance certification.

## Current implementation and authority

The user accepted mock-first development on 13 November and a **local Three.js 0.187.0** representation on 14 November ([ADR 0002 — web](../decisions/0002-mock-first-3d-web.md)). The Cesium runtime/assets are removed. The modern [React workspace](../../web/src/App.tsx), scenario identity, comparisons, timeline and mock **1.1.0** scientific semantics remain; this is a finite terrain overview/Surface viewer, not a global globe.

On `feat/pilot-data-pipeline`, [build_pilot_assets.py](../../scripts/pipeline/build_pilot_assets.py), 15 Artemis candidate site assets under `web/public/data/pilot/`, [PilotDataProvider](../../web/src/data/pilot/PilotDataProvider.ts), [ApiDataProvider](../../web/src/data/api/ApiDataProvider.ts), [AdvisorPanel](../../web/src/panels/AdvisorPanel.tsx), and [backend/](../../backend/README.md) (FastAPI Stages 1–3) are implemented and pass offline unit/API contract suites (`web/`: typecheck, 10 files / 67 Vitest tests, production build; `backend/`: 10/10 pytest). Formal dataset/backend ADR acceptance and live end-to-end browser verification against the backend remain pending.

Use the existing [web commands](../../web/README.md#run-locally) and [backend commands](../../backend/README.md#run-locally). The [provider contract](../../web/src/data/contract.ts), [terrain Worker/client](../../web/src/terrain/) and [viewer notes](../../web/src/viewer/README.md) own frontend implementation details.

The fixture migration and implementation handoffs are complete; the historical viewer-owner restriction no longer blocks approved work. Current hosting access is evidenced by the completed Vercel static mock deployment, not a claim that unrelated credentials were repaired. Further implementation/upload remains bounded and owner-authorized.

## Pre-decision terrain and DE reviews (`main`)

- **Pre-decision terrain review:** The [terrain notebook](../../notebooks/terrain-predecision-review.ipynb) and [team decision worksheet](../predecision-review.md) provide real PGDA 78 previews for nine reference centers (500×500 native 5 m pixels, 250,000/250,000 valid center pixels each; raw preview caches stay Git-ignored). Hillshade is synthetic, slope is a finite-difference proxy, and these crops do not validate whole ROIs or horizon coverage.
- **Pilot working agreement:** [ADR 0003](../decisions/0003-pilot-working-agreement.md), [configuration](../../config/pilot-v1.json), and [sample evidence](../../notebooks/evidence/pilot-v1-samples.json) record the revisable Site01/Site04 configuration; full ROI, datum reconciliation, horizon reproduction, and product selection remain open.
- **Pilot ROI and datum review:** See [pilot ROI/datum review](../pilot-roi-datum-review.md). Site01 ROI is inside reference preview bounds, Site04 ROI is outside; both reference points fall outside ROI. Source elevation versus Horizons ellipsoid datum remains unverified; do not convert AGL until confirmed.
- **Site04 ROI coverage & diagnostics:** [Site04 ROI coverage](../site04-roi-coverage.md) reports 526/526 finite pixels (468 LDEC zeros). [Diagnostic report](../site04-observer-diagnostic.md) and [near/far report](../site04-near-far-review.md) combine 5 m (5–1000 m) with 80 m (1–25 km) profiles; 1 km seam validation, frame/vertical datum reconciliation, and far-field convergence remain open.
- **Data-mining inventory & historical p95 warning:** [ADR 0002 — data](../decisions/0002-data-mining-feature-scope.md) records the initial feature priorities; [the pilot inventory](../data-mining-plan.md) retains candidate checks for Site01/04/07/11/20/23 and metadata-only checks for Site06/Site42/Haworth. Historical 20/25/50/131.8 km p95 reports lack per-bin reproduction evidence and must not be used directly to choose tolerances or radius until reproduced. See [candidate-site visual review notebook](../../notebooks/candidate-site-visual-review.ipynb) and the [decision packet](../open-decisions.md#terrain-horizon-comparison-decision-packet).

## Current public deployment (static mock baseline)

**[https://lunarsight.vercel.app](https://lunarsight.vercel.app)** is anonymously reachable and **healthy** in the final round-24 smoke, observed **2026-11-14 04:49:29–04:54:03 UTC** (from the `feat/3d-mock-viewer` mock baseline). Provider state is READY. Identity comes from sanitized provider/deployment receipts; the tester independently confirmed the public application, not a browser-readable Git SHA.

| Deployment field | Recorded value |
| --- | --- |
| Target | Production; project `lunarsight`, scope `emanhthangngots-projects` |
| Deployment | `dpl_DKV8zVX7bhtk6XHL7AZv1K7BbhkA` |
| Base source revision | `67677c55946390b3030ea925a382086b18168d2b` |
| Added deployment configuration SHA-256 | `f374277c5ab2b59d79061c5e2c5f39b21de0b8ee1fe8aca8cd6bbe8342faa916` |
| Cloud build | Node26.x; pinned pnpm11.3.0 frozen install; `pnpm build`; `dist`; completed successfully, existing large-chunk warning retained |

The CLI uploaded **54 files / 289,872 bytes** from an archived committed `web/` plus local `web/vercel.json`, with no `node_modules`, `dist`, tsbuildinfo or env files. This is **not** an automatic Git deployment, a local Vercel project link or a wholly committed artifact. The configuration was uncommitted at initial upload time; pushing setup/docs does not redeploy it. The upload root already contains app files, so project Root Directory is **`.`**, not `web`; a future Git-linked full repository would require deliberate root `web`. [Operations](../operations.md#vercel-static-mock-deployment) owns the reproducible clean-upload route without an expired snapshot path.

The anonymous live check confirmed readable Three.js terrain, actual active dedicated Worker/module MIME, fonts/assets, Surface, native timeline play/pause/scrub, Ridge→Rim→Ridge, **10 m preset + Apply**, and mock/provenance/display-aid labels. No page/console errors, failed requests or unexpected external application calls were observed in the recorded segments. **Exact remote cache/transfer/job counts remain unverified**: a diagnostic observer did not see private transport, so empty counters prove nothing. Prior detailed cache/transfer/cancellation evidence below remains **local**, not a new remote certification. The remote smoke did not establish a 0.25 m result.

The stable alias was public without login/bypass; unique deployment/preview protection was not disabled or bypassed, and those URLs are not certified public. No app runtime secrets or backend exist on the deployed static mock build. This initial deployment has **no earlier rollback target**; retain it as the known-good candidate for a later eligible rollback, not an exercised recovery result.

## Prior local production evidence

Round 18 passed the cutover/Worker/scientific integration but failed default relief clarity (**V1**). Final round 20 tested the repaired production defaults, closed V1 and passed scoped regressions. Only viewer framing, lighting, styling and notes changed between those checks; matching source hashes justified reusing unchanged round-18 evidence rather than replaying its full matrix. These are tester-observed results on the mock baseline.

| Check | Result and bounded scope |
| --- | --- |
| Typecheck / unit suite / production build | **PASS, exit 0 each** in round 20 (**7 files / 57 tests**, 2.60 s on mock baseline); post-merge `feat/pilot-data-pipeline` offline checks also passed (`web/`: typecheck, **10 files / 67 tests**, Vite build; `backend/`: **10 / 10 pytest**). |
| Default relief clarity, V1 | **CLOSED:** identifiable bowl/rim/ridge context at Ridge **1600×1000** and Rim **1280×900**, Jan 1 defaults, without manual camera/date correction. Not all sites/dates or whole-footprint framing. |
| Actual Worker and bounded cache | Round 18 observed `DedicatedWorkerGlobalScope`, native buffer detachment, usable identical cached arrays after GPU disposal, and terminated superseded builds without stale scene replacement. Two-entry cache; no main-thread geometry fallback. |
| Geometry / sky / observer | Actual curved uploaded mesh, valid winding/unit normals, actual ground origin and provider-driven body directions. Ridge/Rim eye positions exactly `[0,h,0]` at **0 / 0.25 / 2.5 m**; round 20 freshly confirmed 0.25 m Surface and Sun/Earth. |
| React/science flows | Submitted identity, mock metrics, three comparisons/load, time/height/mode controls and explicit missing/unknown/coverage recovery passed. Round 20 confirmed camera, Fill, time and height changes generated no mesh builds. |
| Final runtime | Actual production terrain, **zero page/console errors**, **7 recorded page resources with zero external/failed requests** in the round-20 journey. Not a deployment or all-browser guarantee. |

## Inspection lighting is not science

The accepted default uses a wider local framing and **view-relative, non-shadowing inspection light** plus faint ambient fill to make landforms legible. The visible **“Fill light · display aid”** label and toggle distinguish it from the provider-driven Sun, which remains the only shadow caster. Fill off leaves Sun-only illumination; the scientific result and geometry are unchanged. Decorative Earth texture/starfield are not measured imagery. Smooth crater floors/plains remain the mock field, not invented surface detail.

## Finite-horizon limitation

Round 18 independently intersected actual uploaded mesh triangles for **16 rays** across Ridge/Rim cases; maximum sampled mask residual was **0.061045963°**. This is neither continuous/global equality nor physical lunar accuracy. The mesh samples near terrain differently from the scientific mask.

At **Ridge cursor 533**, the authoritative mask still labels the Sun centre hidden while the finite rendered centre ray is just clear. V1's legibility fix did not repair or conceal that threshold discrepancy. Keep centre-above-mask semantics; visible limbs or dashed direction indicators are not proof of centre visibility, power, radio-link performance or mission success. Missing remains **Unknown**, not computed zero.

Old Cesium F1/F2 closures and measurements remain historical, not evidence for the new renderer. Current height/flow/geometry claims above come from actual Three.js production checks.

## Responsiveness: observations, not certification

Final round 20 first terrain-bearing production render: **616.3 ms**, one fresh local-origin observation. The moving-camera sample used **1600×1000 CSS**, **2134×1334** buffer (retained renderer ratio 1.333333), Balanced/Relief/Fill on, a shared 16-logical-CPU AMD Radeon/ANGLE host and native paced drag input. One sample recorded **291 actual render submissions over 2.2668 s**, frame-interval **p50 7.0 / p95 13.4 / worst 28.0 ms**, with no >50 ms intervals or long tasks.

Those are actual renderer calls, **not monitor-presented FPS**. Input transport/damping/scheduling and uncontrolled host GPU use are included; startup is excluded from the interaction window. Earlier Three framing/light workloads and historical Cesium geometry/buffer settings differ. There is **no matched inter-engine speedup, startup distribution, universal FPS/latency guarantee or exclusive-device profile**.

## How to resume

1. Read [project state](../project-state.md), [AGENTS.md](../../AGENTS.md), [documentation index](../README.md) and [testing policy](../testing-policy.md). Run existing commands from the web and backend guides when an authorized task requires them.
2. Keep V1 closed for the exercised mock defaults; run live browser E2E checks if validating the 15-site `PilotDataProvider` or FastAPI `ApiDataProvider` integration in a real browser.
3. Retain unknowns: datum/1 km seam/horizon convergence reconciliation (`site04-*` reports), historical p95 reproduction, other sites/dates, whole-footprint framing, touch/mobile/no-WebGL, full React-unmount/heap soak, and exclusive-hardware performance. Do not invent certification.
4. The public static Vercel mock demo is live; future static uploads/recovery use the explicit clean-source operations route, not an assumed Git integration. Formal dataset/backend/hosting ADRs remain open in [open decisions](../open-decisions.md).
