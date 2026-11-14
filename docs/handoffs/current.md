# Current handoff

Updated: **14 November 2026**. **Local Three.js production acceptance PASS; V1 CLOSED for the requested default Ridge/Rim views.** This is bounded mock-prototype evidence, not scientific or universal-performance certification.

## Current implementation and authority

The user accepted mock-first development on 13 November and a **local Three.js 0.187.0** representation on 14 November ([ADR 0002](../decisions/0002-mock-first-3d-web.md)). The Cesium runtime/assets are removed. The modern [React workspace](../../web/src/App.tsx), scenario identity, comparisons, timeline and mock **1.1.0** scientific semantics remain; this is a finite terrain overview/Surface viewer, not a global globe.

Use the existing [web commands](../../web/README.md#run-locally). The [provider contract](../../web/src/data/contract.ts), [terrain Worker/client](../../web/src/terrain/) and [viewer notes](../../web/src/viewer/README.md) own implementation details. A processed-data adapter remains pending; no real dataset is selected or acquired.

The fixture migration and implementation handoffs are complete. The old sonnet-only/authentication-dependent repair restriction does not block user-approved work; **credentials were not tested or repaired**. Tester remained read-only. Further implementation requires its own bounded scope and ownership.

## Independent production evidence

Round 18 passed the cutover/Worker/scientific integration but failed default relief clarity (**V1**). Final round 20 tested the repaired production defaults, closed V1 and passed scoped regressions. Only viewer framing, lighting, styling and notes changed between those checks; matching source hashes justified reusing unchanged round-18 evidence rather than replaying its full matrix. These are tester-observed results, not checks rerun during documentation work.

| Check | Result and bounded scope |
| --- | --- |
| Typecheck / unit suite / production build | **PASS, exit 0 each** in round 20; **7 files / 57 tests**, 2.60 s. Production build served and exercised; existing >500 kB chunk warning retained. |
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

1. Read [project state](../project-state.md), [AGENTS.md](../../AGENTS.md), [documentation index](../README.md) and [testing policy](../testing-policy.md). Run only existing commands from the web guide when an authorized task requires them.
2. Keep V1 closed for the exercised defaults; no old fixture/authentication/repair dispatch is pending. New source changes need their affected verification, not an automatic replay of every earlier screenshot or timing matrix.
3. Retain unknowns: other sites/dates, whole-footprint framing, all coverage/threshold edges, global skyline, physical science, repeated cold startup, touch/mobile/no-WebGL, full React-unmount/heap soak and exclusive-hardware performance. Do not invent certification or start unbounded tuning.
4. Real-data acquisition/integration, processing, CI and deployment require separate authorization. The **56.2 GB** example remains unapproved ([data sources](../data-sources.md), [open decisions](../open-decisions.md)).
