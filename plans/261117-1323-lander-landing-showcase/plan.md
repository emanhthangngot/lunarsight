# Lander landing showcase and UI polish

Status: in progress. Tracking issue: #14. Branch: `feat/lander-landing-showcase`.

## Outcome

An original lander model with a data-driven landing showcase in the local Three.js viewer, a layout-preserving UI polish pass, merged to `main` and deployed as the static build.

## Acceptance criteria

See issue #14 "Done means". Out of scope: landing physics, layout redesign, data/pipeline/backend/contract changes, validation claims.

## Pieces and ownership

| Piece | Owner | Owned paths | Depends on |
| --- | --- | --- | --- |
| A. Lander model | subagent | `web/scripts/build-lander-model.mjs`, `web/public/models/lander.glb` | none |
| B. UI audit and polish | subagent | `web/src/styles.css`, `web/src/theme/`, `web/src/panels/`, `web/src/components/`, `web/src/App.tsx` (markup only), `plans/reports/ui-audit-261117-1323/` | none |
| C. Landing scene and viewer integration | orchestrator | `web/src/viewer/`, `web/src/analysis/landingMoment.ts`, App wiring after B merges | A (model contract), B (App.tsx) |
| D. Docs | orchestrator | `web/src/viewer/README.md`, `docs/handoffs/current.md`, `docs/project-state.md` | C |
| E. Isolated review, PR, merge, deploy | fresh reviewer + orchestrator | none | all |

## Model contract (A to C)

`lander.glb`: metres, +Y up, origin at the centre of the footpad contact plane (y = 0), about 4 m tall and 5 m across the legs, untextured PBR materials, under 300 KB. Named empty nodes: `EngineNozzle` (nozzle exit, exhaust toward −Y) and `AntennaTip` (radio link origin).

## Viewer design (C)

- `landerScene.ts` owns the model, enlarged-scale rule for Site overview, descent path, flame, dust, Sun ray and radio link. Rays read the `visible` state already supplied in `sun` / `earth` props: visible reaches the body, hidden stops short with a blocked marker, unknown is dashed and labelled.
- A temporary animation loop runs only during the descent and link pulses stop with the showcase; idle rendering stays on-demand.
- `landingMoment.ts`: first sample index where `analysis.both` is true; none means stay at the current cursor.
- Sun disc enlarged only as a labelled display aid.

## Validation

`pnpm typecheck`, `pnpm test`, `pnpm build` in `web/`; scripted browser captures of the local production build; anonymous check of the production alias after deploy.

## Rollback

Revert the merge commit; redeploy or promote the prior deployment recorded in `docs/handoffs/current.md`.
