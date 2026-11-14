# Current handoff

Updated: **14 November 2026**. Latest independent repair retest: **F1 and F2 CLOSED; required gates PASS**. Scientific accuracy and universal FPS readiness are not certified.

## Current implementation and authority

The user authorized the mock-first prototype on 13 November 2026 ([ADR 0002](../decisions/0002-mock-first-3d-web.md)). Work remains on `feat/3d-mock-viewer` in the shared uncommitted/untracked tree; the independent tester recorded HEAD `f4b755faf4ebee9348c26aed2ea214096a4b88f6`.

The user then explicitly authorized **coder-sol to finish the interrupted viewer repair**, superseding the old sonnet-only restriction and authentication-dependent repair route. That repair and its independent retest are complete for F1/F2; no further wait for the old prepared viewer brief or sonnet authentication is required. **Credentials were not tested or repaired**—the delivery blocker was superseded by owner transfer, not a credential fix. Coder-sol is the current authorized viewer-repair owner; tester remains **read-only**, and future code work still needs an explicit bounded scope.

The modern immersive [web workspace](../../web/src/App.tsx), panels, timeline, comparison/provenance sheets and repaired [Cesium viewer](../../web/src/viewer/LunarViewer.tsx) exist. Current independent evidence exercises Orbital/Surface at Ridge A and Rim D. Successful earlier web/data evidence was explicitly reused after non-viewer source/configuration hashes matched; the tester did not repeat the whole previous screenshot journey.

Use the existing commands from [the web guide](../../web/README.md), from `web/`; [viewer notes](../../web/src/viewer/README.md) explain streaming, clipping and rendering limits. [LunarDataProvider](../../web/src/data/contract.ts) remains the data boundary. The [terrain generator](../../web/src/data/mock/terrain.ts) and [analytic mock provider](../../web/src/data/mock/MockDataProvider.ts) remain **1.1.0**. All values/textures are mock or labelled decorative, not JPL/LOLA observations or validated lunar science.

## Latest independent verification

The round-10 current-tree retest supersedes the earlier Surface/build failure record. These are **tester-observed results**, not runtime checks re-run during this documentation task; before/after source manifests matched during the read-only retest.

| Check | Result | Evidence scope |
| --- | --- | --- |
| `pnpm typecheck` | **PASS — exit 0** | Current repaired tree. |
| `pnpm test` | **PASS — exit 0** | **6 files / 54 tests passed**, 1.63 s; four perspective-size cases added by the implementer, original contracts retained. |
| `pnpm build` | **PASS — exit 0** | 3,734 modules, 342 local Cesium items, 904 ms; existing large-chunk warning remains. Production browser execution was not separately tested. |
| **F1 — Surface exception / missing billboard registry** | **CLOSED** | Both sites survive repeated Orbital→Surface→Orbital, cursor/play/zoom/height updates. Root stays populated and viewer alive; both body primitives update. |
| **F2 — hidden minimum eye height** | **CLOSED** | Both sites at **0 / 0.25 / 2.5 m** match actual provider ground+height within **0.0001 m arithmetic tolerance**; maximum radial error **4.202e−10 m**. Mid-flight Ridge submission reaches 0.25 m; HUD agrees. Clipping does not offset the observer. |
| Network / runtime | **PASS** | **82 resources; zero external requests, failed requests, page errors or console errors** in the exercised current app. |
| Real Surface visuals and sizing | **PASS, exercised scope** | 1600/1280 views, Sun/Earth rendering, chart/instruments, FOV sizing and bounded registry/listener behavior observed. Not repeated-mount memory certification. |

Retained successful web/data evidence covers five-site selection, draft/submitted identity, comparison save/load isolation, coordinate validation/coverage/recovery, null-mask semantics, independent duration-weighted mock metrics and desktop/tablet layout. Missing remains **Unknown**, distinct from a computed **0%**; visibility is body centre above terrain horizon, not power, radio-link performance or mission success.

## Remaining limit L1 — exact centre classification

**Owner: coder-sol, current authorized viewer-repair owner.** At Ridge A cursor **533** / height 2.5 m:

- provider mask **0.666750120165°**;
- rendered-triangle skyline **0.665666162968°**;
- Sun centre **0.665799308091°**.

The model labels the centre hidden, while its actual rendered centre ray is clear by about **0.000133145°**. Skyline-minus-mask discrepancy is **−0.001083957197°**. This known boundary limitation is **not F1/F2 returning** or a newly introduced repair regression; exact binary centre agreement fails here. A partial visible limb is also compatible with centre-hidden semantics. Do not hide the physical disc or change mask semantics merely to force agreement.

The independent in-view rendered-triangle diagnostic bracketed **13/13 rays in each of four requested views**, maximum absolute residual **0.056673453°**, below the proposed **0.1°** diagnostic. This is finite sampled geometry, not direct pixel-edge, continuous 360°, off-view skyline or physical lunar certification. Numerical body/light input mapping passed; it does not erase L1.

## Performance and unverified scope

One independent shared-host Surface movement trial observed **213 actual Cesium postRender frames / 7.8688 s = 27.0689 rendered frames/s**, with actual camera-direction change and fixed observer position. Balanced defaults: 1600×1000 CSS / 1200×750 buffer, scale 0.75, SSE 16, shadow map 1024. Input/transport pacing and shared GPU load were part of the observation.

Warm orbital terrain was already cached: first Surface terrain-list frame **187.8 ms**; requested height plus three-frame `tilesLoaded` condition **9,635.6 ms**, including flight/refinement. These are not cold-start measurements or permanent LOD-settlement promises. **Universal ≥24 fps/readiness and comparative speedup remain inconclusive**: n=1, no repeated/matched experiment or exclusive-device profile.

Still unverified: physical science, exact classification near all transitions, global skyline equality, cold startup, repeated/quiet-host or other-device FPS, mobile/touch/no-WebGL behavior, repeated-mount heap retention, future real-terrain path and browser execution of the production bundle. These limits are not reopened F1/F2 blockers.

## How to resume

1. Start with [AGENTS.md](../../AGENTS.md), [project state](../project-state.md), [documentation index](../README.md), [agent workflow](../agent-workflow.md) and [testing policy](../testing-policy.md). Run only existing commands documented in the [web guide](../../web/README.md).
2. Keep F1/F2 closed for this independently retested tree; new source changes need their own affected verification. Do not restart the obsolete authentication/repair-dispatch wait.
3. Retain L1 and timing uncertainty. If a later authorized task targets them, define the decision/acceptance scope first rather than inventing exact scientific or universal FPS certification. The [task brief template](../templates/task-brief.md) supplies the existing route.
4. No real dataset is selected/acquired; real-data integration, processing, CI and deployment remain deferred without separate authorization. The illustrative 56.2 GB scenario and product choices remain unapproved ([data sources](../data-sources.md), [open decisions](../open-decisions.md)).

This is a documentation-only reconciliation: no code/test/configuration edits, dependency/authentication changes, application/runtime reruns, new ADR/docs inventory, commit or push. Current evidence is summarized here so continuation does not depend on temporary reports.
