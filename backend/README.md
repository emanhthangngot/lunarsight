# LunarSight Backend (Stage 1 & Stage 2)

Modular FastAPI service providing PGDA LOLA DEM access, server-side spherical horizon ray-marching, coverage preflight, dynamic JPL Horizons ephemeris, SQLite-persisted immutable analysis results, background analysis jobs, and saved scenarios.

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

## Endpoints

### Stage 1 — Core Scientific API
- `GET /api/health` — readiness, layer/site counts, and saved scenario count.
- `GET /api/sites` — verified candidate landing site catalog (`provenance.kind = 'processed'`).
- `POST /api/coverage/check` — preflight terrain, horizon, and ephemeris coverage check.
- `GET /api/terrain/manifest` & `GET /api/terrain/layers/{layerId}.bin` — DEM mosaic metadata and Float32 binary grids.
- `GET /api/terrain/elevation` — bilinear point elevation lookup (`null` when outside coverage).
- `GET /api/terrain/patch` — centered cropped Float32 DEM sub-grid (`X-Dem-Meta` JSON header).
- `GET /api/horizon` — precomputed or vectorized NumPy 360° horizon mask (`404` if outside coverage).
- `GET /api/ephemeris` — precomputed Q1 2027 lookup or dynamic JPL Horizons API query + cache (`MOON_ME`).

### Stage 2 — Persistence, Immutable Results & Background Jobs
- `POST /api/analyses` — returns `200` with cached immutable result by `calcHash` or `202` with background `jobId`.
- `GET /api/analysis-jobs/{jobId}` & `POST /api/analysis-jobs/{jobId}/cancel` — inspect progress or cancel an active job.
- `GET /api/analysis-results/{resultId}` — retrieve immutable analysis result (`inputs`, `ephemeris`, `mask`, `analysis`).
- `GET /api/scenarios`, `POST /api/scenarios`, `GET /api/scenarios/{id}`, `DELETE /api/scenarios/{id}` — save, list, load/share, and delete scenarios in SQLite (`LUNARSIGHT_DB_PATH`).

## Run tests

```bash
cd backend
pytest -v
```
