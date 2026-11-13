# Proposed domain model

**Status: conceptual design, pending team decisions.** The entities below describe information the application may need. They are not implemented tables, runtime classes, stored datasets, or a frozen schema. Technology, persistence, source selection, and product scope are undecided.

Basis: [LunarSight V2 proposal](reference/proposal-v2.md), especially sections 4–14. See [architecture](architecture.md), [candidate API contracts](api-design.md), and [data quality](data-quality.md).

## Core entities

| Entity | Proposed content | Identity and interpretation |
| --- | --- | --- |
| Site | Stable catalog identifier, display name, coordinates, coordinate frame, label origin, name-audit status, optional descriptive context | A name does not prove that its supplied coordinates lie on that geographic feature. Custom sites may exist without a catalog identity. |
| Mission Profile | Name, revision, default interval/height, constraint definitions and thresholds, explanation of assumptions | Proposal presets are application choices, not official mission requirements. Copy selected values into a submitted scenario revision. |
| Scenario Revision | Location, ground-height origin, mast height, explicit time interval, cadence request, constraints, selected analysis settings, parent draft/revision | Submitted revisions should be immutable. A display name is not enough to identify a calculation. |
| Data Product Definition | Provider, product identifier/version, variable meaning, units, native resolution, footprint, time definition, frame/datum, quality documentation | A candidate product in a research catalog is not a downloaded or approved asset. |
| Source Asset | Product reference, file/resource identifier, expected size if known, checksum origin, retrieval and validation state | This future entity tracks actual acquisition separately from source discovery. No assets are claimed by defining it. |
| Coverage Evidence | Requested location/area/time, relevant product versions, available variables, validity assessment, unsupported reasons | Nominal product extent and valid local samples are separate facts. |
| Horizon Profile | Observer identity, terrain source/version, azimuth samples, obstruction angles, height, search extent, sampling method, uncertainty | Its use is limited by the documented terrain and angular sampling. |
| Time Series Result | Scenario/calculation identity, sample or interval boundaries, Sun/Earth geometry, visibility states, validity, method metadata | State meaning includes the chosen body-center/disc and occultation conventions. |
| Assessment Result | Scenario revision, calculation identity, coverage status, summary metrics, constraints, supporting result references, limitations | It is an identified preliminary assessment, not a mission-success probability. |
| Constraint Result | Constraint identifier, variable, comparator, threshold, observed/derived value, units, outcome and reason | Proposed outcomes: passed, failed, unknown, or not applicable. Missing evidence must not become a pass. |
| Scenario Comparison | Ordered references to scenario revisions/results, comparable metrics, differences in scope or method | The prototype presents three trials; any wider comparison capacity remains a product decision. |
| Sensitivity Trial | Baseline revision/result, explicitly changed parameter, trial revision/result, metric difference and interpretation | A parameter perturbation does not establish a formal global sensitivity analysis or optimizer. |
| Advisor Response | Identified scenario/result, user inquiry, evidence references, explanation, missing assumptions, provider/model metadata if used | It is explanatory output and cannot replace deterministic numerical results. |
| Assessment Report | Snapshot of inputs/results, provenance, limitations, language, generation time, export format and schema version | Reopening a report should not silently substitute a later calculation. |
| Analysis Job | Request identity, calculation identity, lifecycle state, progress meaning, result references, errors, timestamps | Execution state is separate from scientific completeness and validation status. |

## Relationships

A Scenario Revision uses a location and selected Mission Profile values. Coverage Evidence determines which parts of the requested assessment can be supported. Horizon and Time Series results refer to explicit sources and method versions; an Assessment Result references those results and evaluates the scenario's constraints.

Scenario Comparison and Sensitivity Trial reference existing revisions rather than anonymous copies of numbers. Advisor Response and Assessment Report reference an Assessment Result, preserving the evidence that was actually shown to the user.

Data Product Definitions can be proposed before any Source Asset exists. A future Source Asset may be acquired without yet satisfying quality checks. Neither state implies that all locations in its footprint are supported.

## Proposed quantity conventions

| Quantity | Proposed representation | Required qualification |
| --- | --- | --- |
| Latitude/longitude | Degrees with a stated lunar coordinate frame and longitude convention | Normalize equivalent longitudes consistently. Exact-pole longitude and local azimuth behavior need an explicit convention. |
| Ground elevation | Metres with source, datum and interpolation or observation method | Distinguish height above a reference surface from distance to the Moon's center. |
| Observer/mast height | Metres above the specified local ground | Preserve the ground value used by both horizon and celestial geometry. |
| Azimuth/elevation/slope | Degrees with definitions of origin, orientation, and measurement scale | Grid spacing does not establish physical accuracy or lander-scale safety. |
| Temperature | Kelvin and an exact physical-variable description | Surface maximum, subsurface mean, brightness temperature, and seasonal averages are different variables. |
| Hydrogen/resource evidence | Original variable and source units | Do not rename hydrogen concentration or modeled stability depth as local water-ice mass percentage. |
| Availability | Fraction internally or an explicitly named percent field | State the interval, denominator, sampling, missing-data treatment, and visibility convention. |
| Time | UTC instants and explicit start/end boundaries | Proposed interval convention is `[start, end)`. A month duration should resolve to calendar boundaries rather than an implicit fixed day count. |

These conventions are design proposals to make results interpretable. The team must confirm their bindings to selected source products and the implementation language before freezing a schema.

## Identity and versioning

Separate a stable human-facing identifier from a calculation identity derived from all relevant inputs. Source revisions, frame/kernel changes, numerical settings, and observer assumptions can change a result even when its catalog site and mission dates appear unchanged.

A result should retain a normalized input snapshot alongside its identifier. Comparisons should disclose when their results use different data or methods. Updating a catalog label should not silently move coordinates or invalidate the historical identity of an exported result.

## Missing values and evidence origin

Every scientific field should be able to carry a value, units, origin, product/method reference, validity or coverage state, resolution/cadence, and an uncertainty statement or its absence.

Suggested unavailable reasons include outside footprint, invalid source sample, unsupported variable, insufficient temporal coverage, source not selected, source not acquired, and calculation not performed. These are semantically different from a measured zero.

The provenance classification should distinguish observation, published derived product, published model, project calculation, user assumption, and illustrative demonstration. An interface may show useful context from several classes, provided the classes remain visible.

## Independent status dimensions

| Dimension | Candidate states | Why it is separate |
| --- | --- | --- |
| Team decision | Proposed, accepted, deferred, superseded | A documented suggestion does not authorize an acquisition or select a stack. |
| Acquisition | Discovered, selected, downloading, downloaded, verified, failed | Finding an endpoint is different from acquiring usable bytes. |
| Job execution | Queued, running, cancellation requested, succeeded, failed, cancelled | A successful process can still produce an explicitly partial assessment. |
| Scientific completeness | Supported, partial, unavailable | This describes evidence available for the requested variables and area. |
| Validation | Not evaluated, passed stated checks, failed stated checks | A validation status has a named test scope and tolerance; it is not universal certification. |
| UI freshness | Current, computing new revision, stale | This prevents an older result from being mistaken for a newly edited scenario. |

## Invariants for future implementation

- A result's scenario revision, source/method identity, and evidence references agree across all views and exports.
- A constraint value and threshold use compatible units and the same variable definition.
- Simultaneous visibility is derived from the intersection of the same Sun/Earth states and time basis.
- Interval summaries and contiguous-event durations handle missing samples and boundary-clipped events explicitly.
- Changing a meaningful calculation input creates or selects a different matching result.
- A demonstration value never becomes a fallback observation; an unknown constraint never improves a feasibility score.
- A job reports successful completion only after its intended artifacts are consistently available.

These are acceptance expectations to test later. No runtime implementation or passed test is implied by this document.
