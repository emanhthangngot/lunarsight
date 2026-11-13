# LunarSight V2 proposal — historical reference

Status: historical reference, not an accepted implementation or dataset specification.

Source: the team-supplied `LunarSight_Feature_Proposal (1).docx`, dated 5 November 2026. The text below is transcribed from the supplied extraction; tables and numbered section headings were reformatted for Markdown. No scientific demo value is validated by this transcription. The latest user instruction and current project state govern repository scope.

The original source labels S1–S8 refer to parts of the prototype as explained in section 17, not independent scientific citations.

---

LunarSight V2 Product Proposal

Lunar Landing Site Navigation and Mission Tradeoff Exploration


## 5 November 2026


## 1 Executive proposal

LunarSight V2 brings lunar terrain exploration, landing site screening, environmental visibility, and mission constraints into a single interactive workspace. Its central purpose is to help a user investigate how a proposed landing location and operating window affect access to sunlight, visibility of Earth, terrain hazards, and opportunities to work near potential resources.

The application connects a geographic question, “Where could we operate?”, with an operational question, “Under what conditions could this mission remain viable?” A user selects a mission profile and candidate site, examines the surrounding terrain, evaluates sunlight and Earth visibility, inspects constraint failures, compares alternatives, and prepares an assessment report. An AI advisor is included to explain the scenario and support follow-up investigation. [S1–S8]

The proposed product serves two related audiences. Students and other learners can use its visual environment to understand lunar polar conditions. Technical users can use the same workspace to perform preliminary comparisons between mission concepts. The Explorer and Planner controls reflect these two audiences, although the current Explorer experience primarily adds explanatory guidance while retaining the detailed planning panels. [S1]

The next product milestone should preserve this integrated workflow and establish a consistent, reproducible scientific basis for its outputs. The current interface includes useful planning tools, but some availability summaries and benchmark results conflict. LunarSight should therefore be positioned as a mission planning demonstrator for preliminary architectural screening until the calculations, provenance, and validation logic are reconciled. It should not be presented as flight certification, landing authorization, or proof of NASA or JPL endorsement. [S2, S6, S8]


## 2 Objectives and intended users

The product should help users identify promising landing areas, understand the consequences of local terrain, compare mission configurations, and communicate why a scenario meets or fails its selected requirements. Its decision value comes from making the relationship between assumptions and results visible.

For a mission analyst, the immediate question may be whether a site provides enough sunlight and Earth visibility during a specified operating interval. For a power engineer, the longest uninterrupted darkness period is more useful than annual illumination alone. For a communications specialist, the local horizon helps explain geometric obstruction. For a science or resource team, proximity to permanently shadowed regions must be considered alongside power, slope, and access constraints. These are proposed user roles, not separate account permissions implemented in the interface.

Educational users can explore the same relationships through the map, sky geometry, timeline, and bilingual controls. A teaching exercise might compare a ridge location with a crater floor, then ask why higher resource interest can coexist with more difficult operating conditions. The interface already provides the categories of information needed for that comparison. [S1, S3, S4]

The scope is surface site exploration and preliminary operational screening. No demonstrated capability establishes launch trajectory optimization, spacecraft command and control, orbital relay scheduling, full radio link budgets, or a complete spacecraft energy balance. Those would require additional models and explicit product scope.


## 3 Workspace and navigation

The desktop workspace uses three main columns. The left column contains mission configuration, the candidate site catalog, and overlay controls. The center contains the terrain viewer and local horizon analysis. The right column presents feasibility results, constraint explanations, analysis shortcuts, and a compact site summary. A timeline below these panels controls the displayed analysis time. [S1]

The header exposes seven navigation controls. Several open focused dialogs while the main workspace remains the common context.


| Navigation control | Main purpose |
| --- | --- |
| Interactive Map | Explore the terrain and select visualization modes. |
| Local Horizon | Inspect terrain obstruction and the displayed Sun and Earth positions. |
| Scenarios | Compare three independent landing scenarios. |
| Sensitivity | Explore changes around the current scenario. |
| JPL Tests | Review the application's provenance declarations and benchmark table. |
| AI Advisor | Request a mission debrief or ask a scenario-specific question. |
| Reports | Review the executive assessment and access export or print controls. |

This arrangement keeps the selected site, mission assumptions, and assessment visible together. A production implementation should maintain one identifiable scenario across every panel so that all results can be traced to the same inputs.


## 4 Mission configuration


### 4.1 Mission architecture profiles

The mission selector contains five profiles. Selecting a profile changes the default duration, observer or mast height, and operating constraints. These defaults were observed in the interface and are application presets, not independently established mission requirements. [S1]


| Profile | Default duration | Mast height | Intended planning emphasis |
| --- | --- | --- | --- |
| CLPS Commercial Lander | 1 month | 2.2 m | Short surface operations with strong daylight and direct Earth visibility requirements. |
| Solar-Powered Exploration Rover | 4 months | 1.2 m | Mobile exploration with attention to illumination and prolonged cold conditions. |
| Lunar Surface Science Station | 12 months | 3.5 m | Longer monitoring campaigns and continuity for scientific instruments. |
| Sustained South Pole Exploration Base | 24 months | 10.0 m | Extended surface infrastructure and elevated solar equipment. |
| Custom Mission Configuration | 6 months | 2.0 m | User-defined mission concepts and experimental payload assumptions. |

The descriptive text adds context for each profile. For example, the lander description refers to short missions of approximately 14–28 days, while its actual duration control initializes to one month. The base description refers to a multiyear concept, while the visible duration control permits up to 36 months. Exact start and end timestamps should resolve these differences when a scenario is calculated.


### 4.2 Date duration and observer height

The user can enter a landing date in UTC and adjust a duration slider from 1 to 36 months. The mast height appears beside the configuration. Additional height controls are available in the local horizon and sensitivity modules.

These inputs establish the scenario being evaluated. Date changes alter the time interval under investigation; duration changes determine the window over which availability is summarized; observer height is intended to influence the local obstruction geometry. The interface should show the explicit end time and calculation cadence so that percentages and durations have an unambiguous denominator.


### 4.3 Profile constraint defaults

The application assesses five operational constraints. The preset values below describe the defaults exposed during the review. [S1, S2]


| Profile | Min sun | Max darkness | Min Earth visibility | Max blackout | Max slope |
| --- | --- | --- | --- | --- | --- |
| CLPS lander | 70% | 48 h | 80% | 12 h | 12° |
| Solar rover | 65% | 72 h | 60% | 48 h | 15° |
| Science station | 60% | 120 h | 75% | 36 h | 15° |
| Exploration base | 75% | 60 h | 85% | 24 h | 10° |
| Custom mission | 50% | 96 h | 50% | 48 h | 15° |

The expandable constraint panel exposes four sliders: minimum sunlight from 30% to 90%, maximum continuous darkness from 24 to 240 hours in 12-hour increments, minimum Earth visibility from 40% to 95%, and maximum landing slope from 8° to 25°. Maximum communication blackout is assessed as a fifth criterion and changes with the profile, but a separate editor for it was not visible in this panel.


## 5 Landing site discovery and custom coordinates


### 5.1 Candidate catalog

The catalog contains six predefined locations. Every card shows a site name, latitude and longitude, elevation, and a sunlight percentage. The following values reproduce the catalog display; they are reference characteristics of the demo and should not be treated as verified mission predictions. Signed latitude is used here to avoid repeating a negative sign and an S suffix. [S1, S3]


| Candidate | Latitude and longitude | Elevation | Catalog sunlight |
| --- | --- | --- | --- |
| Site A — Shackleton Rim | −89.24°, 32.40° E | 1,280 m | 92.4% |
| Site B — Shackleton–de Gerlache Connecting Ridge | −88.82°, 12.10° E | 740 m | 78.6% |
| Site C — Faustini Crater Floor | −89.62°, 178.30° E | −3,850 m | 34.2% |
| Site D — Malapert Mountain Massif | −85.91°, 12.92° E | 4,950 m | 89.2% |
| Site E — Nobile Crater Rim | −85.22°, 36.12° E | 620 m | 74.5% |
| Shiv Shakti — Chandrayaan-3 landing point | −69.37°, 32.32° E | −1,200 m | 50.1% |

Selecting a site updates the selected-site annotations, horizon information, feasibility results, and site summary. The interface includes the catalog labels “VIPER Target” and other mission associations; those labels should be reviewed separately before being used as statements about current mission plans.


### 5.2 Search and category filters

Users can search through the catalog using a field labeled for craters, peaks, or coordinates. Category controls include All Sites, Artemis, CLPS Targets, and Historical. Name search for Faustini and the Historical filter were observed to narrow the list. Coordinate interpretation and matching rules remain a detail to validate before describing the search as a geocoding service.

The category filters support discovery without requiring users to remember every location name. They should also make the origin and meaning of each category clear, especially where a catalog association could be mistaken for an official landing decision.


### 5.3 Custom landing sites

The Custom Site control opens an Add Custom Landing Coordinates form. It collects a site label, latitude between −90° and −60°, longitude between 0° and 360° east, and estimated elevation in meters. Latitude and longitude inputs expose 0.01° increments. Cancel closes the form; Create & Calculate is the submission action. [S1]

This workflow is intended to let users investigate locations outside the predefined catalog. A complete implementation should validate the coordinate convention, handle equivalent 0° and 360° longitude values, and show whether the selected location lies inside the available terrain coverage. Elevation entered by the user must be identified as an assumption. Submission, storage, and persistence of a new site were not verified during this review.


## 6 Interactive terrain and scientific layers


### 6.1 Terrain viewer and camera controls

The central viewer displays a three-dimensional lunar terrain scene with craters, ridges, a selected-site annotation, a distance scale, and scientific context labels. Orbital View presents the scene from above, while Surface View changes to a low viewing position. Mouse-wheel interaction changes the camera distance. Switching the camera and terrain display modes produced visible changes. [S1]

The viewer includes a source label referring to NASA LRO LOLA PDS data, a region label for the lunar south pole, sub-solar latitude, and Earth libration. These labels make the intended scientific context visible. Their presence does not establish that the rendered terrain or celestial calculations were generated from the stated products.


### 6.2 Visualization modes

Six display modes are available. Their product purpose is to help users examine different aspects of the same geographic context. [S1]


| Mode | Intended interpretation |
| --- | --- |
| 3D Terrain | Inspect the shape of craters, rims, ridges, and surrounding relief. |
| 2D Polar Contours | Examine a contour-style representation of elevation changes. In the inspected view, contours remained displayed on the terrain scene. |
| Solar Illumination | Inspect the application's illumination representation. |
| Cryogenic Thermal | View a color-coded thermal representation of the terrain. |
| Water Ice ISRU | Explore the displayed resource distribution for in-situ resource utilization. |
| Slope greater than 15° Hazard | Highlight terrain identified by the display as exceeding the stated slope threshold. |

The fixed 15° visualization threshold is distinct from the configurable maximum landing slope used by the feasibility assessment. A site can therefore be evaluated against a 12° mission limit while the map layer highlights areas above 15°. These two thresholds should be labeled clearly.


### 6.3 Independent overlays

The Scientific Overlays panel exposes six independent checkboxes: Site Markers, Water Ice wt%, PSR Traps, Peaks & Ridges, Slope > 15°, and Rover Traverse. They allow the user to control which thematic elements are requested on the map.

PSR means permanently shadowed region. ISRU refers to using resources available at the destination. The resource and cold-trap overlays give context for considering science value alongside operational difficulty. The Rover Traverse control indicates a route overlay; no waypoint editor, route solver, or autonomous path planner was demonstrated.

For a production release, every scientific color scale should identify its units, range, data version, spatial coverage, and whether values are measurements, inferences, or illustrative estimates. Resource layers should preserve the distinction between hydrogen enrichment and confirmed extractable water ice.


## 7 Local horizon and celestial visibility

The 360° Local Horizon and Celestial Sky Explorer connects terrain shape with the visibility of the Sun and Earth. It presents azimuth from 0° to 360°, cardinal directions, obstacle elevation, a true-horizontal reference, and a labeled solar polar grazing zone. The Sun and Earth appear with numerical elevation and azimuth values. [S4]

The interface offers mast-height presets of 1.2 m, 2.5 m, and 10 m. These represent alternative observing or equipment heights. The current mission profile can use a different height, such as the lander's 2.2 m, so the selected height must remain visible beside the chart.

Two explanatory status panels translate the geometry into operating conditions. Solar Illumination State describes whether the Sun is hidden by local terrain and gives the relevant solar elevation and obstruction angle. Earth Line-of-Sight State describes direct Earth visibility or terrain blockage and identifies the potential need for a relay.

For example, the inspected Site A scenario displayed the Sun at −2.09° elevation and a local ridge at approximately +1.14° along the relevant azimuth. The panel reported terrain shadow. It also displayed Earth at −6.1° elevation with a terrain obstruction of approximately +0.51°, alongside a direct-to-Earth blackout message. These numbers are examples of the application's explanations, not independently validated astronomical results.

The proposed value is diagnostic: users can see why a state occurs instead of receiving only a percentage. The scientific implementation must document observer coordinates, height datum, terrain sampling, coordinate transformations, and whether visibility refers to a body's center or limb. Geometric Earth visibility should remain distinct from a fully available radio link, which requires additional antenna, ground-station, and link-budget assumptions.


## 8 Feasibility assessment and mission timeline


### 8.1 Operational screening

The Mission Feasibility Assessment panel presents an overall status, a count of passed constraints, numerical availability metrics, and explanations for failed requirements. It covers minimum sunlight, maximum uninterrupted darkness, minimum Earth visibility, maximum communication blackout, and maximum landing slope. [S2]

Its principal outputs are sunlight percentage and hours, longest continuous shadow, Earth visibility percentage and hours, simultaneous Sun and Earth availability, and the relevant failure thresholds. An expandable editor allows adjustment of four limits. Shortcuts open scenario comparison, sensitivity analysis, and full site telemetry.

A failure explanation pairs an actual result with its required threshold. For the inspected CLPS scenario at Site A, the dashboard showed 1 of 5 constraints passing, 0% calculated sunlight, a 736.1-hour maximum shadow, and 43.1% Earth visibility. The report later displayed a score of 20%. These observations support describing the score as constraint coverage in that example. They do not support interpreting it as a probability that a mission will succeed.

The interface also presents Next Sunlight Loss and Next Earth Blackout indicators. Their timing should be derived from the same state sequence as the timeline and summary metrics. The current labels require correction or clarification where they conflict with shadow or blackout states.


### 8.2 Synchronized timeline

The Mission Timeline and Synchronized Operational Windows panel displays the selected site, a UTC timestamp, and Julian Date. It offers playback speed controls of 1x, 5x, 20x, and 60x, a Play control, seven-day backward and forward steps, a jump to the next sunset or sunrise event, and a scrubber. A lunar synodic-day reference of approximately 29.5 days is also displayed. [S4]

Three tracks represent solar illumination, Earth direct line of sight, and simultaneous availability. Individual timeline elements expose dated status information and, for the solar and Earth tracks, displayed angular values. This supports inspecting both an overall operating window and a particular moment within it.

The seven-day step was observed to change the displayed UTC timestamp and the Sun and Earth angles in the horizon view. This establishes an interactive connection between time navigation and the sky display. It does not independently validate the calculation model or every playback and event-navigation control.

Timeline percentages must be tied to a clearly defined interval. Annual catalog statistics, current scenario totals, and instantaneous states should have distinct labels. The current implementation displays conflicting totals, which are addressed in the readiness section.


## 9 Scenario comparison and sensitivity analysis


### 9.1 Three scenario comparison

The Scenarios control opens a Multi-Scenario Landing Comparison dialog containing three independent trials. Each trial exposes a landing-site selector, a landing-date selector, a duration slider, a pass or fail result, and a Load Scenario into Workspace action. [S5]

The displayed date options are 1 January, 1 April, 1 July, and 1 October 2026, plus 1 January 2027. The interface attaches seasonal or mission labels to these dates. Those labels should be treated as demo presets until checked against the intended astronomical convention and current mission information.

Each trial presents illumination percentage and hours, maximum darkness, Earth visibility, simultaneous availability percentage and hours, and landing slope. These metrics let a user compare alternatives without repeatedly replacing the main workspace configuration. An explanatory analysis note describes the intended seasonal and site tradeoffs.

The load action is designed to transfer a selected trial into the main workspace for further inspection. The dialog demonstrates a fixed three-trial comparison; it does not establish saved scenario libraries, arbitrary numbers of trials, independent project storage, or automatic optimization. The per-trial controls observed were site, date, and duration. Separate per-trial constraint editors were not displayed.


### 9.2 Parametric sensitivity explorer

The Sensitivity dialog investigates changes around the current site and mission assumptions. It displays baseline and current sunlight, longest shadow, feasibility status, passed-constraint count, numerical differences, and a textual Primary Sensitivity Driver. [S5]


| Parameter | Visible range | Input step |
| --- | --- | --- |
| Landing-date shift | −30 to +30 days | 1 day |
| Observer or solar mast height | 1 to 15 m | 0.5 m |
| Latitude offset | −0.20° to +0.20° | 0.01° |
| Longitude offset | −1.00° to +1.00° | 0.05° |

Reset returns the sensitivity controls to their baseline. Done closes the analysis dialog. Shifting the date to +30 days updated the offset and driver explanation during inspection; Reset returned the offset to zero. The interface should describe this as exploration of selected parameter changes. The existence of a driver explanation does not establish a formal global sensitivity method, uncertainty propagation, or an optimizer.

The product purpose is to help users ask focused questions: Does a different date improve operating windows? Does increased mast height help with a local obstruction? Is an apparent advantage robust to a small location change? Results should include clear units and baseline references so that a small numerical difference is not overstated.


## 10 Site telemetry and scientific provenance


### 10.1 Detailed site dossier

Full Telemetry opens a detailed dossier for the selected site. It includes the site and region names, coordinates, elevation, narrative description, annual illumination, reference maximum shadow, Earth visibility, water-ice-equivalent percentage, distance to a PSR, thermal extremes, and a 360° horizon profile. It also presents Mission Advantages, Engineering Bottlenecks, and Data Provenance and Instrument Reference sections. [S3]

For Site A, the dossier displays 92.4% annual illumination, a 54-hour reference maximum shadow, 98.2% Earth visibility, 0.8 wt% water-ice equivalent, a 2.1 km PSR distance, and a 110–285 K thermal range. For Site C, it displays a different resource and operating profile, including 5.6 wt% water-ice equivalent and a 38–160 K thermal range. These are catalog figures shown by the app; they require traceable site-specific sources before scientific use.

The dossier helps communicate why a site can be attractive while still imposing engineering difficulties. Its narrative sections should remain distinguishable from computed scenario results. “Full Telemetry” currently refers to a rich site-information view; it does not demonstrate a connection to a live spacecraft telemetry feed.


### 10.2 Provenance and JPL benchmark view

The JPL Tests control opens the Scientific Provenance and Validation Suite. Its source declarations reference NASA LRO LOLA terrain products, JPL Horizons and DE440/DE441 ephemerides, Diviner thermal data, and LEND spectrometry. The panel also lists a coordinate-frame label, lunar reference radius, obliquity and libration parameters, and stated dataset sampling characteristics. [S6]

The terrain declaration includes LDEM_80S_20M, coverage labeled 80°S to 90°S, a stated 20 m horizontal grid, and a stated vertical accuracy claim. These are the application's declarations. Grid spacing, effective resolution, and positional or vertical accuracy should be documented separately. The catalog includes locations north of 80°S, and the custom form extends to 60°S, so the product needs an explicit coverage check and appropriate additional terrain sources.

The benchmark table includes three reference epochs. It displays residual columns for sub-solar latitude, sub-solar longitude, and Earth libration latitude, each with a stated ±0.25° tolerance, along with a per-row result and overall result. This is a useful validation interface, but the current pass logic does not agree with several displayed residuals. The product should retain this transparency while correcting the calculation or labeling before claiming verified accuracy.


## 11 AI mission advisor

The AI Mission Science Advisor and Flight Rule Debrief dialog is labeled Gemini 2.5 Flash. It is presented as a context-aware assistant grounded in the current mission metrics and terrain analysis. Opening it initiates a debrief attempt. A Regenerate Debrief control is also available. [S7]

A context strip identifies the selected site, feasibility status, sunlight, maximum shadow, and Earth visibility. Four suggested inquiry buttons cover why the mission passes or fails, the energy-storage implications of darkness, how crater rims affect Earth communication, and the effect of shifting a January scenario to July. A free-text field accepts additional questions through Inquire.

The advisor's proposed role is to explain the numerical evidence, identify operational implications, and guide the next investigation. It should cite the scenario settings and metrics used in each answer. Where a question requires inputs that the application does not contain, the answer should request or explicitly state those assumptions.

Battery-capacity advice is a relevant example. Darkness duration alone does not determine a defensible capacity in kWh. The advisor would also need load demand, heater requirements, usable battery fraction, efficiency, degradation, and reserve assumptions. The interface should guide the user through those inputs before presenting an engineering recommendation.

During the review, the automatic debrief returned a service-unavailable error with code 503. The advisor interface and context display were observed, but a successful answer and its grounding quality were not verified. A complete release should handle this condition with a readable message and retry option while leaving deterministic analysis usable.


## 12 Reports and language support


### 12.1 Executive assessment

Reports opens an Executive Lunar Mission Assessment Report. It contains the operational screening result, critical-issue count, a score, the site identity, coordinates, landing date and duration, elevation and slope, sunlight and Earth availability, simultaneous availability, maximum shadow, and maximum blackout. [S8]

The report includes provenance language and a disclaimer positioning it as preliminary architectural screening. This framing should be retained. A report should explain which constraints passed, which failed, and why, while preserving the assumptions behind each value.

Export JSON and Print controls are available. The JSON action is intended to support structured reuse of the assessment. Print provides a route to a printable document; saving to PDF would depend on the browser or operating system's print destination. The download payload and print layout were not verified, so a native PDF-generation feature should not be claimed from the button alone.

A production export should contain a scenario identifier, explicit start and end times, all constraint thresholds, observer height, terrain and ephemeris versions, units, calculation settings, result metrics, validation status, and generation timestamp. This would allow another user to reproduce the report instead of receiving an isolated score.


### 12.2 Explorer and Planner experiences

Planner is the technical interface presented in the inspected initial state. Explorer activates an educational message about lunar polar illumination and cold traps and offers a Switch to Technical Planner action. The detailed configuration, horizon, feasibility, and timeline panels remained available in Explorer. [S1]

The present distinction is therefore an educational layer over the shared workspace. A later learning experience could introduce guided exercises and simpler explanations, but these should be specified as additions rather than described as already implemented.


### 12.3 English and Vietnamese

The EN and VI control switches interface language. Navigation labels, mission configuration, profile descriptions, overlay labels, and parts of the horizon interface changed during inspection. Some technical labels, site descriptions, and controls remained in English. The product supports English and Vietnamese interface switching, with further translation work needed for complete consistency. [S1]

The dark dashboard uses cyan and other accent colors for controls and scientific indicators. Textual statuses such as FAIL and written explanations help users interpret outcomes without relying solely on color. Formal accessibility, narrow-screen behavior, keyboard operation, and chart alternatives still need dedicated validation.


## 13 End to end user journey

1. Choose Explorer or Planner and select a preferred interface language.

2. Select a mission profile, landing date, and operating duration. Review the height and constraint defaults.

3. Search or filter the site catalog, select a candidate, or open the custom-coordinate form.

4. Inspect the terrain from orbital or surface perspective. Select the relevant display mode and overlays.

5. Examine the local horizon to understand terrain obstruction of sunlight and Earth visibility.

6. Move through time to inspect changing angles and the displayed operating windows.

7. Review overall feasibility and the actual values behind each failed requirement.

8. Compare three alternatives and examine parameter sensitivity around a promising scenario.

9. Consult the site dossier and provenance view before relying on the scientific interpretation.

10. Use the AI advisor for explanation when available, then review and export or print an assessment.

This journey produces a reasoned preliminary comparison. It should preserve a traceable connection between every recommendation and the assumptions that produced it.


## 14 Proposed technical structure

The following structure is a development proposal, not a verified description of the deployed backend. Its purpose is to make the existing feature set consistent and maintainable.

A scenario model should hold the site, coordinates, terrain reference, landing interval, observer height, and constraints. A data layer should provide catalog records, terrain samples, horizon masks, celestial inputs, thermal layers, and resource information with explicit provenance and coverage.

A deterministic analysis service should produce time-indexed Sun and Earth geometry, visibility states, contiguous shadow and blackout intervals, summary metrics, and constraint results. The map, horizon, timeline, scenario comparison, sensitivity dialog, and report should all consume these outputs. This avoids separate panels silently calculating incompatible answers.

The AI advisor should receive the same identified result object and relevant explanations. It should interpret calculated evidence and disclose missing assumptions. It should not independently invent replacement values for the numerical engine. The reporting layer should serialize the same scenario and result object, along with model and data versions.

The core entities are a Site, Mission Profile, Scenario, Horizon Profile, Time Series, Constraint Result, Scenario Comparison, Sensitivity Trial, Advisor Response, and Assessment Report. Persistent projects, user accounts, shared workspaces, version history, and collaboration can be considered later; their implementation was not established by the current interface.


## 15 Readiness findings and corrective priorities


### 15.1 Align availability metrics

For the inspected Site A scenario beginning 1 January 2026 with a one-month duration, the feasibility panel and timeline displayed different values. The discrepancy must be explained by clearly different windows or corrected at the data source. [S2, S4]


| Metric | Feasibility panel | Timeline summary |
| --- | --- | --- |
| Sunlight | 0% | 92.4% |
| Earth visibility | 43.1% | 98.2% |
| Simultaneous availability | 0% | 85% |

Annual catalog values can legitimately differ from a mission-specific interval, but they must not appear as if they summarize the same timeline. If the timeline's 92.4% sunlight and 98.2% Earth visibility refer to the same interval and sampling basis, their overlap must be at least 90.6%. The displayed 85% therefore cannot represent that intersection under the same definition.

Point-level tooltips and event labels also need reconciliation. The review observed shadow labels alongside simultaneous-active labels, and a Continuous link event message while other panels reported Earth obstruction. One calculation source should determine the summaries, tracks, tooltips, and next-event labels.


### 15.2 Correct benchmark status

The JPL Tests page displayed all three benchmarks as passing while showing longitude residuals of 62.341°, 71.033°, and 119.573° against a ±0.25° tolerance. Earth libration residuals also exceeded the stated tolerance in all three rows. [S6]

If these columns contain residuals in degrees, the pass labels are incorrect. If they contain absolute coordinates, the labels and residual calculation are incorrect or incomplete. Either case prevents an evidence-based accuracy claim. Every test should show reference value, computed value, residual definition, units, tolerance, and a status calculated from those quantities.


### 15.3 Establish source coverage and uncertainty

Every scientific layer needs an exact product identifier, version, coverage, frame, height datum, units, and processing description. The 80°S–90°S terrain declaration must be reconciled with the more northern catalog entry and the custom form's wider allowed latitude range. [S1, S6]

Thermal and resource figures need site-specific provenance and uncertainty. Geometric Earth visibility must be distinguished from operational communication availability. A rendered slope layer must identify its terrain sampling scale. Source names and “verified” badges should describe demonstrated evidence rather than stand in for it.


### 15.4 Complete reliability and output checks

The AI service needs graceful handling of unavailability. JSON export and print output need end-to-end checks. Custom-site creation, scenario loading, and storage behavior need clear acceptance tests. Language support needs a completeness review. These are focused completion tasks for the existing product, not a reason to replace its core idea.


## 16 Acceptance criteria and delivery stages

The next release should meet the following criteria before it is described as a scientifically validated screening tool.

1. Every result exposes the same scenario identity, explicit start and end timestamps, observer height, constraints, and data or model versions.

2. Availability percentages agree with the displayed state sequence and duration totals. Simultaneous availability is computed from the intersection of sunlight and Earth-visibility states.

3. Event detection handles scenarios that begin in shadow or blackout, have no transition, or have an event outside the selected interval.

4. Horizon results identify the geometry and obstruction angles used to determine visibility.

5. Constraint counts, failures, and report scores agree, and no requirement-coverage score is labeled as mission success probability.

6. Each benchmark status follows the displayed residual and tolerance, with documented angular conventions.

7. Custom coordinates are validated against both input rules and actual dataset coverage. Assumed elevation is labeled.

8. Loading a comparison trial transfers its advertised settings consistently. Sensitivity Reset restores the documented baseline.

9. Report exports preserve inputs, outputs, units, provenance, and validation status, and remain readable when printed.

10. AI answers use the identified scenario results, surface missing engineering inputs, and handle errors without blocking the rest of the application.

Delivery should begin by unifying calculations and correcting validation status. The second stage should establish source traceability, coverage checks, and reproducible exports. The third stage should complete advisory reliability, bilingual coverage, accessibility, and guided educational use. A later stage can evaluate saved projects, collaboration, uncertainty analysis, and formal optimization if those capabilities fit the intended audience.

This sequence preserves LunarSight's original feature set while turning its strongest idea into a dependable product: an understandable connection between a lunar location, a mission configuration, and the operational tradeoffs that follow.


## 17 Source register and terminology

Primary application: LunarSight — Mission Planning and Trade-off Explorer, Google AI Studio preview, inspected 5 November 2026.

Open the LunarSight application preview

The source labels below refer to areas of the same application. They are navigation references for the observations in this proposal, not independent scientific corroboration.


| Source | Application area |
| --- | --- |
| S1 | Main workspace, mission profiles, site controls, map modes, Explorer and Planner, language switch. |
| S2 | Feasibility assessment and expanded constraint controls. |
| S3 | Full Telemetry site dossiers, including Site A and Site C. |
| S4 | Local horizon, celestial status panels, and mission timeline. |
| S5 | Multi-Scenario Landing Comparison and Parametric Mission Sensitivity Explorer. |
| S6 | Scientific Provenance and Validation Suite opened through JPL Tests. |
| S7 | AI Mission Science Advisor interface and observed service error. |
| S8 | Executive Lunar Mission Assessment Report and output controls. |

Terms: DEM = digital elevation model; LOS = line of sight; PSR = permanently shadowed region; ISRU = in-situ resource utilization; wt% = mass percentage.
