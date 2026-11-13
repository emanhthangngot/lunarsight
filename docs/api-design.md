# Candidate API contracts

**Status: proposed interface design.** No endpoint, service, authentication scheme, or API implementation exists in this documentation-only setup. Route names, transport, pagination, persistence, limits, and error codes require team review. The table below is a discussion aid, not a published API specification.

Basis: [LunarSight V2 proposal](reference/proposal-v2.md), sections 5–14. Read [architecture](architecture.md) and [domain model](domain-model.md) for responsibilities and entity meanings.

## Contract principles

- Request and response identities should connect every displayed panel to the same scenario revision and calculation.
- Return scientific values with units, source/method versions, coverage, validity, and limitations.
- Validate geography and time against the selected products as well as general input syntax.
- Keep long-running computation observable without requiring one browser request to remain open throughout processing.
- Distinguish a partial scientific result from an infrastructure failure.
- Treat read-only discovery, calculation requests, persistent project edits, and external advisor calls as different operations.

## Candidate operations

An HTTP-style interface is shown for concreteness; the team has not selected HTTP routes or a backend framework.

| Operation | Illustrative binding | Inputs | Expected response meaning |
| --- | --- | --- | --- |
| Discover sites | `GET /sites` | Search text, supported filters, optional page cursor | Catalog entries with coordinate/name provenance and defined filter meaning. |
| Inspect a site | `GET /sites/{id}` | Stable catalog identifier | Site metadata and supported dossier fields, each with availability and evidence. |
| List data layers | `GET /layers` | Area, variable or product filters | Layer metadata, spatial/time scope, native resolution, quality, and selection/acquisition status. |
| Check coverage | `POST /coverage/check` | Coordinates/area, variables, requested interval and source choices | Supported, missing, uncertain, or unselected inputs, with reasons and relevant product versions. |
| List mission profiles | `GET /mission-profiles` | Optional revision selector | Application presets with units and assumption labels. |
| Request analysis | `POST /analyses` | Scenario input snapshot and optional idempotency token | An exact cached result or a job receipt with normalized inputs and calculation identity. |
| Inspect a job | `GET /analysis-jobs/{id}` | Job identifier | Lifecycle, meaningful progress, cancellation state, and result/error references. |
| Request cancellation | `POST /analysis-jobs/{id}/cancel` | Job identifier | Cancellation requested, already terminal, or unsupported state; never an unverified claim that computation stopped. |
| Read a result | `GET /analysis-results/{id}` | Immutable result identifier | Assessment, source identities, completeness, constraints, supporting artifact references, and validation scope. |
| Read a time window | `GET /analysis-results/{id}/series` | Window and permitted display sampling | Samples from the same result; authoritative summaries retain their original calculation basis. |
| Compare results | `POST /comparisons` | Ordered result references | Metric comparison plus any incompatibilities in method, units, time basis, or data quality. |
| Request a sensitivity trial | `POST /sensitivity-trials` | Baseline revision/result and one or more explicit changes | Trial identities and analysis jobs/results, linked to the unchanged baseline. |
| Read validation evidence | `GET /validation-cases` | Method/source revision or case filters | References, outputs, residuals, tolerances, outcomes, and the exact scope of comparison. |
| Request advisor explanation | `POST /advisor-responses` | Result reference, inquiry, optional engineering assumptions | Evidence-linked explanation or a recoverable provider error; deterministic results remain usable. |
| Prepare an assessment report | `POST /assessment-reports` | Result reference, language, proposed export format | A reproducible snapshot or report job with its generation and schema metadata. |

Tile or terrain-geometry delivery needs a separate contract once the map engine and storage format are selected. Saved projects, user accounts, shared workspaces, and arbitrary comparison sizes are also open decisions; they are not implicitly implemented by this route sketch.

## Analysis request semantics

A request should specify a catalog reference or explicit lunar coordinates, the ground-height source or user assumption, mast height, explicit UTC interval, requested cadence, profile/threshold values, source choices, and model settings relevant to the result.

Defaults should be returned as resolved values. The server should not silently adopt a newly edited profile, use a different source resolution, substitute another location, or extend the time window. A suggested fallback can be presented explicitly for the user to select.

A request for information outside the selected products can return a useful coverage assessment without launching expensive computation. Requiring a terrain-derived result when terrain is absent should produce an unsupported-input outcome rather than fabricated values.

## Job and retry semantics

A long-running analysis may return a receipt and a status location. Proposed terminal states are succeeded, failed, and cancelled; cancellation requested is an intermediate state until acknowledged. Success means the intended result artifacts are available and internally linked, not that all scientific variables are supported.

An idempotency token should bind to one canonical request within a documented scope. Retrying that same request should not create duplicate expensive work. Reusing the token with different inputs should be rejected or explicitly distinguished; the exact expiry and storage behavior remain open.

After a network interruption, the client should recover a known job by identity. If cancellation races with completion, return the actual terminal state. A changed UI draft must not accept a late result as current unless its identity still matches.

For multi-user deployment, job/result access and cache reuse must follow the selected ownership model. This document does not select that model.

## Scientific response envelope

Proposed result metadata includes scenario revision, calculation identity, normalized input snapshot, source/product versions, coordinate and temporal conventions, calculation settings, completeness, generation time, and validation scope.

Each relevant value should carry its unit, evidence origin, coverage/validity state, uncertainty or unavailable reason, and references to the calculation or source that supports it. A link to a source name alone is not a complete value definition.

Reports and advisor context should reference the same result identity. A displayed timeline can be sampled more coarsely for rendering only if that display sampling is disclosed and does not redefine the assessment totals.

## Error and incomplete-result vocabulary

| Situation | Proposed handling |
| --- | --- |
| Invalid coordinate, time order, unit, or malformed input | Identify the input and expected convention; do not start analysis. |
| Longitude wrap or exact-pole coordinate | Apply the documented convention or request a supported representation; do not silently choose an arbitrary local orientation. |
| Variable unavailable or outside coverage | Return per-variable coverage reasons; allow a clearly partial assessment when its requested operations remain meaningful. |
| Source unavailable temporarily | Expose a retriable failure and any genuinely valid cache alternative with its version. |
| Unknown or inaccessible resource identifier | Return an appropriate lookup/access outcome without leaking another user's content. |
| Calculation budget or request size exceeded | State the accepted limits and a smaller supported request; avoid silently lowering fidelity. |
| Advisor provider unavailable | Preserve the numerical assessment and provide a separate recoverable advisory status. |
| Changed source/method revision | Require an explicit matching calculation identity; retain historical report identity. |

The team should map this vocabulary to transport-specific status codes after selecting the interface. Error prose must not be used as the sole machine-readable discriminator.

## Acceptance discussion before coding

Confirm which operations belong in the first release, their input limits and authorization model, immutable versus editable resources, units and result semantics, asynchronous execution behavior, and compatibility/versioning rules. Then derive an executable specification and contract tests in the implementation phase.

At the current stage, validation consists of reviewing this proposal against the product requirements and [data-quality expectations](data-quality.md). No API test suite or generated client is claimed.
