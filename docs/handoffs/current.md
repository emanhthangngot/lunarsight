# Current handoff

Updated after **final round42 acceptance: PASS for the requested bounded PR13 software scope**. G1, production static/API comparison DOM and native Ground proof are closed. Original gate logs were lost; retained observations and explicitly reused evidence are qualified below. This is not scientific certification, a GitHub PR13 merge claim or a deployment of the repaired source.

**Uncommitted, not deployed — site-name labels (15 November 2026, user instruction):** map labels and the site search now show the plain site name; the "· name unverified" suffix is removed there (mock sites keep "· mock"). The Mission site list states the name source instead: **"Name per PGDA 78"** where the retained site description cites a PGDA 78 label (Site04, Site01, Site11), otherwise the previous "Name not catalog-verified". The coordinate/landing caveat stays in the site description (list tooltip) and Data provenance. Changed: [LunarViewer](../../web/src/viewer/LunarViewer.tsx), [SiteCommand](../../web/src/components/SiteCommand.tsx), [SitePanel](../../web/src/panels/SitePanel.tsx). `nameVerified`, `sites.json`, the pipeline catalog and all numeric assets are unchanged. Checked: `pnpm typecheck` and `pnpm build` exited 0; the local production preview was exercised by a scripted browser capture. `pnpm test` was not run. Production still shows the old labels until an authorized upload.

## Current implementation and authority

The user accepted mock-first development on 13 November and a **local Three.js 0.187.0** representation on 14 November ([ADR 0002 — web](../decisions/0002-mock-first-3d-web.md)). The Cesium runtime/assets are removed. The modern [React workspace](../../web/src/App.tsx), scenario identity, comparisons, timeline and mock **1.1.0** scientific semantics remain; this is a finite terrain overview/Surface viewer, not a global globe.

This source integrates reviewed PR13 repairs across [the offline pipeline](../../scripts/pipeline/build_pilot_assets.py), fifteen retained candidate sites, [PilotDataProvider](../../web/src/data/pilot/PilotDataProvider.ts)/[observer metadata](../../web/src/data/pilot/observerMetadata.json), [ApiDataProvider](../../web/src/data/api/ApiDataProvider.ts) and [FastAPI](../../backend/README.md), plus the focused two-site UX. Site01 is Connecting ridge and Site04 Shackleton rim; selected coordinates/numeric assets are unchanged. The UI retains larger text/contrast, three primary Summary metrics, automatic matching site/metric updates, common-window/cadence/height A/B and a finite local south-polar camera. Public advisor/server-library controls are removed; optional private APIs remain restricted. Legacy static science is recorded 1 m with unknown historical ground/altitude null, not reconstructed from today's terrain.

Use the existing [web commands](../../web/README.md#run-locally) and [backend commands](../../backend/README.md#run-locally). The [provider contract](../../web/src/data/contract.ts), [terrain Worker/client](../../web/src/terrain/) and [viewer notes](../../web/src/viewer/README.md) own frontend implementation details.

Research PRs **7, 8, 11 and 12 are already merged**. Preserve both research histories and their reproduction pointers below. PR13 GitHub freshness/merge is boss-owned; “source integrates reviewed repairs” does not assert that PR13 has merged and remains true after a normal merge.

The user authorizes the bounded existing-source repairs, two-site UX and ready-PR merges; boss owns Git/account/deployment actions. No fresh raster acquisition, regenerated science, hosted backend, CI/DNS/paid services, global-viewer redesign or scientific certification is implied by acceptance. The repository has **no CI**. Published Vercel still serves the older mock snapshot; pushing or merging this source does not redeploy it.

### Final bounded acceptance (round42)

Evidence owner: independent final `test-42.md`, delivered at `/tmp/omp-herd/herd-lunarsight-20261113-205928/test-42.md` (temporary session report, not a permanent log archive). The run directory vanished during continuation; source survived. Original task42 gate stdout/manifests and earlier test37/test39 raw artifacts were lost. The commands/results below had already been observed in actual tool output; they were **not rerun merely to replace logs**, and no reconstruction is presented as original stdout.

From `web/`, with sanitized environment, `NPM_CONFIG_USERCONFIG=/dev/null` and separate configurations inheriting repository settings:

| Observed command / evidence | Result and qualification |
| --- | --- |
| `pnpm typecheck` | PASS, exit0, observed before interruption. |
| `pnpm test --config <task42-scratch>/vite-static.config.mjs` | PASS, exit0; **13 files / 105 tests**, including **15 generated registry/preset cases**; original raw log lost. |
| `pnpm build --config <task42-scratch>/vite-static.config.mjs` | PASS, exit0; `tsc -b && vite build`, observed before interruption. No compiler relaxation, excluded tests or changed scientific tolerances. |
| Test39 offline backend runner | **Reused, not rerun:** **111 tests / 31 subtests**, zero unmocked HTTP/socket attempts. Before the loss, 89 unchanged source/config/test inputs and retained public assets matched test39; post-recovery 91-input fingerprint verification also passed. |

`<task42-scratch>` was `/tmp/omp-herd/herd-lunarsight-20261113-205928/tester-scratch-42`; its paths describe the observed run, not a new required permanent configuration. Only missing runtime bundles/scratch tools were recovered. The following **Vite-only** artifact recreation commands exited0; no typecheck, Vitest, pytest or `pnpm build` was repeated:

```text
VITE_API_BASE_URL='' pnpm exec vite build --config <task42-scratch>/vite-static.config.mjs
VITE_API_BASE_URL=http://127.0.0.1:8420 pnpm exec vite build --config <task42-scratch>/vite-api.config.mjs
```

Separate static/API caches and outputs, disabled `.env` loading and fresh browser contexts avoided shared development-server artifacts. G1's generated registry/series agreement, actual-byte terrain dependency, current-ground/rounded-altitude rejection and qualified legacy cases passed as synthetic software-consistency checks, not real generated-data publication.

**Fresh production DOM and Ground:** static **1600×1000** and API **1280×900**, using actual retained assets and the real loopback backend, passed. Selecting Site01 applied the edited seven-day window and matching metrics **without another Apply click**; header, Summary and timeline agreed. The actual A/B dialog used **2027-01-01 00:00 → 2027-01-08 00:00 UTC, 1 h cadence, 1 m eye height** in both modes:

| Primary DOM metric, hours | Site01 A | Site04 B | B−A |
| --- | ---: | ---: | ---: |
| Sunlit time | 90 | 168 | +78 |
| Longest darkness | 78 | 0 | −78 |
| Earth-visible time | 0 | 0 | 0 |

Actual DOM tables supplied those values/deltas; both A/B screenshots were readable. Native Ground was pressed with visible terrain and the real Ridge readout `-89.463° 222.510°E · ground +1945 m · eye +1 m`. Ground evidence used `canvas.lunar-viewer__gl`, not the compass canvas; the scratch selector correction repeated only that observation on existing pages. Relief/Elev/Labels/Fill/HD/Legend remained enabled; Fill is a labelled inspection aid, not sunlight science. Four useful screenshots were inspected. No exact identity was established for the two buttons in the original chat images; only the exercised native controls are claimed.

**Explicit reuse:** unchanged-renderer exact 1 m camera coordinates `[0,1,0]` come from test37, not a new private camera diagnostic. Test39 supplies successful fresh production default API Worker/science/terrain startup and the controlled actual Cancel proof: pending/controls recovered, the old poll aborted and delayed results could not overwrite the prior result. Server work had already succeeded, not been instantly interrupted. These original raw artifacts were lost; reuse is a retained observation with pre-loss input identity, not a new execution or newly available raw log.

The earlier development-server import stall has **no established root cause**. Production F2 acceptance is closed for its exercised path, not a diagnosis of that stall. Task42 recorded zero page/console errors, failed requests, HTTP>=400, unexpected external requests and upstream attempts. No live upstream availability was tested. No task42 FAIL/BLOCKED criterion remains; owned tester contexts/services were closed/stopped. Physical datum/frame/convergence, real regenerated science, hosted backend, universal FPS and deployment remain outside this acceptance.


## Pre-decision terrain and DE reviews (`main`)

- **Pre-decision terrain review:** The [terrain notebook](../../notebooks/terrain-predecision-review.ipynb) and [team decision worksheet](../predecision-review.md) provide real PGDA 78 previews for nine reference centers (500×500 native 5 m pixels, 250,000/250,000 valid center pixels each; raw preview caches stay Git-ignored). Hillshade is synthetic, slope is a finite-difference proxy, and these crops do not validate whole ROIs or horizon coverage.
- **Pilot working agreement:** [ADR 0003](../decisions/0003-pilot-working-agreement.md), [configuration](../../config/pilot-v1.json), and [sample evidence](../../notebooks/evidence/pilot-v1-samples.json) record the revisable Site01/Site04 configuration; full ROI, datum reconciliation, horizon reproduction, and product selection remain open.
- **Pilot ROI and datum review:** See [pilot ROI/datum review](../pilot-roi-datum-review.md). Site01 ROI is inside reference preview bounds, Site04 ROI is outside; both reference points fall outside ROI. Source elevation versus Horizons ellipsoid datum remains unverified; do not convert AGL until confirmed.
- **Site04 ROI coverage & diagnostics:** [Site04 ROI coverage](../site04-roi-coverage.md) reports 526/526 finite pixels (468 LDEC zeros). [Diagnostic report](../site04-observer-diagnostic.md) and [near/far report](../site04-near-far-review.md) combine 5 m (5–1000 m) with 80 m (1–25 km) profiles; 1 km seam validation, frame/vertical datum reconciliation, and far-field convergence remain open.
- **Data-mining inventory & historical p95 warning:** [ADR 0002 — data](../decisions/0002-data-mining-feature-scope.md) records the initial feature priorities; [the pilot inventory](../data-mining-plan.md) retains candidate checks for Site01/04/07/11/20/23 and metadata-only checks for Site06/Site42/Haworth. Historical 20/25/50/131.8 km p95 reports lack per-bin reproduction evidence and must not be used directly to choose tolerances or radius until reproduced. See [candidate-site visual review notebook](../../notebooks/candidate-site-visual-review.ipynb) and the [decision packet](../open-decisions.md#terrain-horizon-comparison-decision-packet).

The following paragraphs retain the chronological research record. Their intermediate “next” steps are historical context, not authority for fresh source reads or a declaration that datum/frame or convergence questions are resolved.

### Tái lập Site04 ROI

Notebook [site04-roi-reproduction](../../notebooks/site04-roi-reproduction.ipynb) cung cấp quy trình tự chạy lại các cửa sổ raster có kiểm soát, mask, thống kê và lựa chọn điểm kỹ thuật; nguồn/cache được kiểm tra hash với evidence đã review. Không áp dụng giả định này cho datum đứng hay horizon.

### Site04 observer and datum audit

See [observer/datum audit](../site04-observer-datum-audit.md). The inside-ROI point is only a provisional technical observer; LOLA LDEM_64 documentation supports a 1737.4 km reference sphere but is not direct vertical-datum metadata for PGDA 78. At that audit stage, Horizons and horizon reproduction had not been run for this point because datum confirmation was missing. The later conditional diagnostics below do not settle that datum.

### Site04 conditional observer diagnostic

[Diagnostic report](../site04-observer-diagnostic.md) records a provisional ROI-pixel observer and explicit 1737.4 km sphere assumption. Horizons returned 745 hourly rows per target including both endpoints (744 in the pilot closed-open interval). An 80 m 1–25 km far-field-only horizon was reproduced for nested radii; all cells valid and maxima nondecreasing, but 82/360 maxima fall in the outer 10%. It omits the near 1 km, uses grid north, and is not mission visibility. Direct PGDA 78 vertical datum and ROI frame identity are not independently settled; config remains unchanged. Next: independently validate datum/method, integrate 5 m near-field and test horizon convergence before any derived visibility.

### Site04 near/far diagnostic

[Near/far report](../site04-near-far-review.md) combines 5 m at 5–1000 m with the conditional 80 m 1–25 km profile by 1° grid-azimuth bin. All 125,608 sampled near-field cells were valid; 360/360 combined bins available. The near component exceeds far in 186 bins. This is not full visibility or convergence: <5 m omitted, different within-bin directions and unvalidated 1 km seam, 82 prior far-field peaks near 25 km edge, frame/vertical datum still conditional. A preliminary nearest-cell overlap check in the 800–975 m annulus has 153/153 valid pairs, median Z5−Z80 −0.208 m and maximum absolute difference 9.563 m; it is not a matched-resolution or datum validation. Next assess seam at comparable effective resolution and validate datum/reference before operational use.

### Site04 seam / 50 km review

[Seam and convergence review](../site04-seam-convergence-review.md): 111 area-weighted 80 m footprints have median 5 m minus 80 m −0.258 m and max absolute difference 1.739 m; GDAL average cross-check matched within 0.000061 m. This matches geometric support, not proven effective resolution or datum. At 50 km all 1,226,698 far cells are valid; 80/360 far peaks are in the outer 10%, including 55 which dominate the combined profile. Combined 25→50 km changes 134 bins; convergence is not established. Spherical-vector comparison is only an alternate formula on the same source, not an external scientific reference.

### Historical Site04 seam quality and pipeline roadmap

This research was originally recorded as local-only on `de/site04-seam-quality`, without push/PR authority at that stage; the current bounded repair/ready-PR merge instruction supersedes that historical restriction. [Seam quality](../site04-seam-quality-review.md) records five bounded quality layers in 111 overlap footprints. PGDA 90 EFFRES is a sampling-gap metric, not a PSF/kernel; 5 m average RMS is not uncertainty of the aggregate. [DE roadmap](../de-pipeline-roadmap.md) describes three milestones to an input pipeline and separates science validation. The [100 km report](../site04-100km-review.md) records one successful bounded read: all 4,908,236 far-field cells valid, 70 far peaks in the outer 10%, and 106/360 combined bins changed from 50 km. The 50 km raster window matched an exact subset of 100 km; the full 100 km read has not been independently repeated.


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
| Typecheck / unit suite / production build | **Historical mock baseline:** round 20 exited 0 (**7 files / 57 tests**, 2.60 s). Earlier PR13 teammate reports list web typecheck/**10 files / 67 tests**/build and backend **10 / 10 pytest**; these are not current repair gates or independently established results for this merged tree. |
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
2. Review the accepted two-site workflow with the user and agree the next explicit product/science/hosting task. Do not replay completed gates merely to recreate lost logs; retain the qualifications above. Boss owns final Git/PR freshness and merge actions; no GitHub PR13 merge is asserted here.
3. Retain unknowns: datum/1 km seam/horizon convergence reconciliation (`site04-*` reports), historical p95 reproduction, other sites/dates, whole-footprint framing, touch/mobile/no-WebGL, full React-unmount/heap soak, and exclusive-hardware performance. Do not invent certification.
4. The public static Vercel mock demo is live; future static uploads/recovery use the explicit clean-source operations route, not an assumed Git integration. Formal dataset/backend/hosting ADRs remain open in [open decisions](../open-decisions.md).
