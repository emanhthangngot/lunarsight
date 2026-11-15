# LunarSight Backend (Stage 1, 2 & 3)

FastAPI service for conditional source-derived pilot terrain, horizon and Sun/Earth visibility analysis. This is not validated landing science or evidence of a deployed backend. Public science stays separate from optional private scenario storage and provider prose.

## Run locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive OpenAPI docs: `http://127.0.0.1:8000/docs`.

To point the frontend (`web/`) at this backend:

```bash
cd web
VITE_API_BASE_URL=http://127.0.0.1:8000 pnpm dev
```

## Container (not deployment approval)

Build from the repository root so pilot DEM/ephemeris assets are bundled cleanly:

```bash
docker build -f backend/Dockerfile -t lunarsight-backend .
docker run --rm -p 8000:8000 -v lunarsight_cache:/data/cache lunarsight-backend
```

Use **one API process/worker per SQLite database/cache directory**. Jobs are in-process, not a distributed queue. Startup marks retained queued/running rows failed with an explicit restart-interruption message before accepting work. A new submission without the old idempotency key can retry; reusing an existing key preserves its terminal outcome. Do not run overlapping old/new processes against one database.

## Endpoints

### Stage 1 — Core Scientific API
- `GET /api/health` — readiness, layer/site counts, and saved scenario count.
- `GET /api/sites` — source-attributed technical observers, not verified landing points. Site01 is Connecting ridge, Site04 Shackleton rim, Site11 de Gerlache rim; the selected Site04 coordinate remains provisional.
- `POST /api/coverage/check` — preflight terrain, horizon, and ephemeris coverage check.
- `GET /api/terrain/manifest` & `GET /api/terrain/layers/{layerId}.bin` — DEM metadata and Float32 grids. Returned URLs include a startup `dataset` fingerprint and each layer's actual byte `sha256`; changed releases cannot silently reuse the same cached binary URL. A stale fingerprint gives409/reload rather than another snapshot's bytes.
- `GET /api/terrain/elevation` — bilinear point elevation lookup (`null` when outside coverage).
- `GET /api/terrain/patch` — centered cropped Float32 DEM sub-grid (`X-Dem-Meta` JSON header).
- `GET /api/horizon` — precomputed or vectorized NumPy 360° horizon mask (`404` if outside coverage).
- `GET /api/ephemeris` — fixed-height precomputed Q1 2027 series or an explicitly bounded dynamic Horizons query. Both preset paths require catalog ID/normalized-coordinate agreement (422 otherwise). Legacy celestial assets are reusable only at their recorded **1 m** observer height; other heights query the actual DEM ground plus requested height. Omitting height still means 0 m, not 1 m.

### Stage 2 — Persistence, Immutable Results & Background Jobs
- `POST /api/analyses` — 200 cached result or 202 job receipt. New receipts include optional `cancelToken`; independent active submissions are not globally coalesced. Explicit idempotency-key retries reuse the original job without revealing its capability.
- `GET /api/analysis-jobs/{jobId}` — status/progress, never a cancellation token. `POST /api/analysis-jobs/{jobId}/cancel` requires the original receipt's `X-Analysis-Cancel-Token`, or authorized administrative Bearer token. SQLite stores only the capability's SHA-256 hash; missing/wrong capability gives 403.
- Cancellation is cooperative: cancelled status prevents result publication but does not claim instantaneous interruption of blocking NumPy/network work. Queued cancellations retain their admission slot until dequeued; in-flight transport workers retain theirs until actual exit. A 90 s analysis work deadline is checked between stages and during HTTP waits, not a CPU preemption guarantee.
- `GET /api/analysis-results/{resultId}` — immutable result, 404 if absent/expired; invalid retained payloads explicitly fail with 503 rather than substituting a result.
- Scenario list/create/get/delete routes require administrative authorization. Linked saves require exact immutable input/result agreement; missing result IDs, contradictory inputs and invalid unlinked inputs give 422. Saved snapshots pin their results and are never silently evicted.

### Optional private advisor
- `POST /api/advisor-responses` requires administrative authorization even without a provider key. Deterministic numeric `summary`, `recommendations` and citations always remain authoritative.
- Provider prose, when enabled, appears only in `unverifiedProviderSummary` / `unverifiedProviderRecommendations`, with an explicit unverified limitation. Structured `facts` must retain every stored metric/null exactly; malformed or contradictory output produces a deterministic fallback. Citations do not certify free prose.

## Access and environment

All scenario CRUD and advisor routes are disabled (503) unless server-side `LUNARSIGHT_ADMIN_TOKEN` is configured with at least 32 characters. When configured, they require `Authorization: Bearer …` (403 otherwise). This is a private administrator boundary, not multi-user ownership. Never put this token in `VITE_` variables, browser code, URLs or logs. CORS is not authorization. The public demo does not use these optional endpoints.

[Settings](app/config.py) owns defaults and validation:

- `LUNARSIGHT_PILOT_PUBLIC_DIR`, `LUNARSIGHT_PILOT_SRC_DIR`: deployed numeric assets and catalog/observer registry.
- `LUNARSIGHT_CACHE_DIR`, `LUNARSIGHT_DB_PATH`: disposable science caches and retained SQLite snapshots. Use a writable private directory; retained IDs can expire under cache pressure.
- `LUNARSIGHT_CORS_ORIGINS`: allowed browser origins only.
- `LUNARSIGHT_HORIZONS_URL`, `LUNARSIGHT_HORIZONS_TIMEOUT_S`: trusted upstream URL and positive caller deadline, at most/default 30 s per target.
- `LUNARSIGHT_ADMIN_TOKEN`: optional server-only administrative authorization.
- `LUNARSIGHT_LLM_API_KEY`, `LUNARSIGHT_LLM_BASE_URL`, `LUNARSIGHT_LLM_MODEL`, `LUNARSIGHT_LLM_TIMEOUT_S`: optional trusted OpenAI-compatible provider; positive deadline at most/default 20 s. Without a key the authorized advisor is deterministic.

No credential values are supplied here. Provider call budgets reset only with the process; they are not an approved paid-service budget.

## Snapshot, provenance and resource contract

[ScienceAssets](app/services/assets.py) captures at most 128 MiB of asset bytes once at startup: DEM manifest/binaries, ephemerides, masks, catalog and complete `observerMetadata.json`. Actual bytes, scientific method source/constants and upstream identity feed persistent calculation/cache keys. Same-version changed bytes invalidate lookup after restart. Lazy terrain loading and presets use those captured bytes, never a post-fingerprint live file. Stage a consistent complete asset release before restarting; hot asset replacement is not supported.

`EphemerisSeries.observer` is optional metadata with coordinates, `observerHeightM`, nullable `groundHeightM` / `ellipsoidAltitudeKm`, `datumStatus: conditional`, and `metadataOrigin` (`legacy-pipeline-height`, `pipeline-record`, `runtime-dem-query`). Legacy registry records keep unknown historic ground/altitude null and only the known baked 1 m height. Fresh runtime queries retain the full-precision altitude actually transmitted; pipeline generation retains its actual five-decimal query altitude without inventing a different ground value. Returned legacy provenance corrects old labels without rewriting public numeric assets. Neither metadata nor software consistency establishes datum/frame or far-field convergence.

Generated packs use top-level nullable `terrainContentHashPolicy` / `terrainContentHash` fields, preserved by the terrain API. The supported policy is `pilot-terrain-f64be-sha256-v1`. Startup recomputes the dependency SHA-256 from captured binary bytes (also checking each declared layer SHA and byte length), priority-ordered geometry and coverage. Raw geometry/coverage must contain finite JSON numbers, never booleans or numeric strings; rows/cols must be numeric integers at least two. `provenance.contentHash`, version labels and query hashes are producer metadata, not dependency proof. The compact UTF-8 JSON preimage is `[policy,"pilot-validity-v1","R=1737400m",coverageHex,layers]`: coverage order is south/north/west/east; each layer is the flat array `[xMinHex,yMaxHex,spacingHex,rowsHex,colsHex,actualSha256Lower]`. Every numeric hex is the 16 lowercase hex characters of an IEEE754 Float64 big-endian value; names and URLs do not enter the digest.

Both generated horizon masks and celestial series must carry that supported policy and the actual current terrain hash. Startup rejects incompatible packs with `ValueError`, rather than downgrading them to legacy or querying upstream to repair a preset. Generated horizons also require `spherical-raymarch-25m-4percent-v1` and an observer record `{latDeg,lonDegE,groundHeightM,observerHeightsM,datumStatus:"conditional",metadataOrigin:"pipeline-record"}` whose finite, unique height set matches the canonical numeric mask keys. Both preset types must agree with catalog coordinates and actual current DEM ground; generated celestial records additionally require the recorded 1 m height, registry equality and the actual **five-decimal** pipeline altitude. Numerical mask/series validation still applies. Other requested heights can use the existing dynamic paths, but never reuse a different recorded height.

Legacy compatibility requires an unqualified manifest and preset plus `legacy-pipeline-height` observer metadata with null historical ground/altitude. Both optional dependency fields null count as unqualified; any non-null dependency claim, generated provenance marker or recorded/generated query marker requires the generated contract. Missing/unsupported generated policies, including old generated records lacking the new dependency fields, are rejected. Returned provenance distinguishes dependency-checked generated records from unchanged legacy values; both remain conditional, not scientifically validated. Existing numerical public assets are not rewritten.

Dynamic Horizons stops align to the **query start grid**, not epoch multiples. Parsed timestamps must be increasing, cadence-consistent and bracket the requested window. Out-of-support interpolation explicitly fails (502); it never silently clamps.

Bounds are deliberately small for the supported single-process runtime; [request admission](app/services/request_limits.py), [resources](app/services/resources.py), [jobs](app/services/analysis_jobs.py) and [storage](app/services/storage.py) own enforcement:

- 16 admitted HTTP requests overall; 4 direct science operations; request bodies at most 64 KiB with a 10 s body deadline (413 / 408 on violation).
- Analysis executor: 2 running workers, 4 additional admitted/queued tasks. No unbounded executor backlog.
- Horizons: 2 admitted pairs and 2 actual HTTP transport workers. Each target has a caller deadline at most 30 s, at most 8 MiB JSON, no redirects and at most 5 s socket connect/read waits. OS DNS/transport can outlive the caller, but bounded daemon workers retain occupied slots and never publish late cache/results.
- Private provider: 1 admitted call / actual transport worker, at most 32 attempts per process, 800 output tokens, 64 KiB response, 6,000-character structured content, 4,000-character prose summary and at most five 500-character suggestions. Deadline at most 20 s; abandoned transport slots remain occupied.
- Each horizon/ephemeris cache: 16 memory objects; at most 64 disk objects / 32 MiB total / 8 MiB per object. DEM views share the bounded immutable snapshot bytes. Patches are capped at 1,048,576 cells; analyses/ephemerides at 25,000 samples.
- SQLite: at most 256 jobs, 64 results, 32 saved snapshots and 64 MiB accounted payload/reservations. Old terminal jobs and unpinned results may expire; private saved snapshots do not. DELETE journaling and page limits bound the database to 128 MiB (a rollback journal can temporarily require additional disk space). An already oversized retained database is rejected, not silently rewritten.
- Non-waiting admission/storage-budget exhaustion returns 429 with `Retry-After: 1`; SQLite/filesystem unavailability returns 503. Science input conflicts give422; stale manifest/dataset identity gives409; upstream parse/support/failure gives502; missing resources give404. Accepted jobs report later scientific/upstream failures through terminal job state.

## Run tests

```bash
cd backend
pytest -v
```

**Accepted offline evidence:** test39 observed **111 tests / 31 subtests** passing with zero unmocked HTTP/socket attempts, including [generated presets](tests/test_generated_presets.py) and [pipeline reuse/publication](tests/test_pipeline_dependencies.py). Final test42 **reused**, not reran, that evidence after confirming 89 unchanged inputs/retained assets before interruption. The original test39/test42 raw artifacts were lost; these are retained observed results, not fresh pytest execution or reconstructed stdout. Test42 freshly exercised real loopback API comparison/Ground DOM; default startup and controlled Cancel reuse test39. [The acceptance handoff](../docs/handoffs/current.md#final-bounded-acceptance-round42) owns provenance/commands/limits. No live Horizons/LLM availability, hosted backend or scientific validation follows; this documentation update ran no application checks.
