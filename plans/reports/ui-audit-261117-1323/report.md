# LunarSight web UI audit and polish pass (17 November 2026)

**Outcome:** ten display defects were fixed in `web/src/styles.css`, most of them on phone and tablet widths, and four of the six viewer HUD findings were fixed in `web/src/viewer/viewer.css`. Layout, flows, numbers, labels, provenance wording and every mock / unknown / unavailable text are unchanged.

**Method:** a production build (`pnpm build`) served by `vite preview`, static pilot provider with retained assets and no backend. A playwright-core script drove headless system Chrome (SwiftShader ANGLE) at 1600×1000, 1280×800, 768×1024 and 390×844, waiting for the result status to be ready before each capture. States captured: default, pending at load, Mission drawer, Summary drawer, both drawers, site search (with and without matches), Compare dialog with a completed result, Data provenance dialog, Local sky & horizon, timeline legend, Ground view, keyboard focus and hover. Only Chromium was checked.

## Findings fixed (`web/src/styles.css`)

| ID | Viewport | Where | Defect | Fix | Before | After |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | 390 | Command bar | Wrapped to four rows, 208 px tall | Tighter toggle padding and 40 px utility buttons at ≤600 px; three rows, 160 px | [before](01-before-command-bar-mobile.jpg) | [after](01-after-command-bar-mobile.jpg) |
| 02 | 390 | Timeline controls | Row 395 px wide in a 348 px space; first and last controls clipped | Controls wrap; event jumps take a second row with visible text | [before](02-before-timeline-controls-mobile.jpg) | [after](02-after-timeline-controls-mobile.jpg) |
| 03 | 390 | Mission / Summary drawers | Squeezed into a 223 px strip between bar and dock | Drawer uses the full width and reaches the bottom gutter | [before](03-before-drawer-mobile.jpg) | [after](03-after-drawer-mobile.jpg) |
| 04 | 768, 390 | Result-status pill | Half covered by an open drawer | Drawers start 40 px lower at ≤1199 px | [before](04-before-status-pill-under-drawer.jpg) | [after](04-after-status-pill-under-drawer.jpg) |
| 05 | all | Compare table | Value headings left-aligned above right-aligned numbers | Value headings right-aligned | [before](05-before-compare-header-alignment.jpg) | [after](05-after-compare-header-alignment.jpg) |
| 06 | 390 | Compare dialog | Table overflowed; Difference column and caption clipped | Dialog max-width override, tighter cells, numbers on one line | [before](06-before-compare-table-mobile.jpg) | [after](06-after-compare-table-mobile.jpg) |
| 07 | 390 | Provenance dialog | SHA-256 digest ran past the dialog edge | `overflow-wrap: anywhere` on record text | [before](07-before-provenance-hash-wrap.jpg) | [after](07-after-provenance-hash-wrap.jpg) |
| 08 | 1280×800, 390 | Site search dialog | Bottom ran off the viewport | Max-height accounts for the top offset; search field stays pinned | [before](08-before-search-dialog-height.jpg) | [after](08-after-search-dialog-height.jpg) |
| 09 | all | Summary "More metrics" rows | Label and timestamp split over three lines | Label stays on one line; value drops below as one right-aligned line | [before](09-before-detail-grid-wrap.jpg) | [after](09-after-detail-grid-wrap.jpg) |
| 10 | all | `<summary>` hover | Hover fill touched the text | Inline padding with matching negative margin and a radius | [before](10-before-summary-hover.jpg) | [after](10-after-summary-hover.jpg) |

Regression captures of the default state after the changes: [1600](11-after-regression-1600.jpg), [1280](11-after-regression-1280.jpg), [768](11-after-regression-768.jpg), [390](11-after-regression-390.jpg).

## Viewer HUD findings (`web/src/viewer/`)

| ID | Viewport | Defect | Resolution |
| --- | --- | --- | --- |
| V1 | 768–1600 | Toolbar drawn over site labels, leaving slivers of text beside it | Fixed: HUD surfaces are now near-opaque, so a label passing underneath is covered instead of showing through. The label is still hidden while it is under the toolbar. |
| V2 | 768, 1600 | Site labels cut off at the viewport edge | Not fixed; filed as a follow-up issue. It needs label placement logic, not styling. |
| V3 | 390, 768 | Coordinate readout truncated with an ellipsis | Fixed: the readout wraps at ≤900 px. |
| V4 | 390 | Sky & horizon caption truncated | Fixed: the caption wraps at ≤600 px. |
| V5 | 1280 | Label rendered under the bottom HUD chips | Fixed with V1 (opaque chips). |
| V6 | 390 | Toolbar oversized on phones | Partly fixed: 40 px buttons with tighter padding at ≤600 px. Collapsing secondary toggles behind an overflow control would be a layout change and was not done. |

## Checked and found fine

Text contrast (muted, mock, processed badge and disabled text meet WCAG AA), focus rings, the search empty state, the pending Summary card, the Timeline pending message, desktop drawers, and the Compare and provenance dialogs at 768 and above.

## Not exercised or not fixed

- A comparison with one failing side, the outside-coverage banner and custom coordinates were not captured.
- Only the static pilot provider was rendered; API and mock modes were not.
- In the site search, arrow-key navigation does not scroll the active option into view. This is a behaviour change and was filed as a follow-up issue.
- On a 390 px phone the viewer's safe area between the command bar and the timeline dock is about 240 px tall, so the 3D view and the landing card are cramped there. Changing that needs a layout decision.

## Verification

`pnpm typecheck`, `pnpm test` (13 files, 105 tests at the time of the audit) and `pnpm build` exited 0 after the stylesheet changes, with 0 console errors and 0 page errors across the scripted runs.
