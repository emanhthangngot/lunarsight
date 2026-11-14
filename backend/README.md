# LunarSight Backend (Stage 1, 2 & 3)

Modular FastAPI service providing PGDA LOLA DEM access, server-side spherical horizon ray-marching, coverage preflight, dynamic JPL Horizons ephemeris, SQLite-persisted immutable analysis results, background analysis jobs, saved scenarios, and an evidence-linked AI Advisor.

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

## Run with Docker (for Railway / Render / Fly.io)

Build from the repository root so pilot DEM/ephemeris assets are bundled cleanly:

```bash
docker build -f backend/Dockerfile -t lunarsight-backend .
docker run --rm -p 8000:8000 -v lunarsight_cache:/data/cache lunarsight-backend
```

See [backend/.env.example](.env.example) for CORS, SQLite/cache paths, and optional `LUNARSIGHT_LLM_API_KEY` configuration.

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

### Stage 3 — Evidence-linked AI Advisor
- `POST /api/advisor-responses` — explains a stored `resultId` with citations and explicit limitations. Runs in deterministic grounded mode by default; uses an OpenAI-compatible LLM when `LUNARSIGHT_LLM_API_KEY` is configured and falls back cleanly if the external provider is unavailable.

## Run tests

```bash
cd backend
pytest -v
```
