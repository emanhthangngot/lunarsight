# LunarSight Backend (Stage 1 — Core Scientific API)

Modular FastAPI service providing PGDA LOLA DEM access, server-side spherical horizon ray-marching, coverage preflight, and dynamic JPL Horizons ephemeris with disk/memory caching.

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

- `GET /api/health` — readiness & loaded layer/site counts.
- `GET /api/sites` — verified candidate landing site catalog (`provenance.kind = 'processed'`).
- `POST /api/coverage/check` — preflight terrain, horizon, and ephemeris coverage check.
- `GET /api/terrain/manifest` & `GET /api/terrain/layers/{layerId}.bin` — DEM mosaic metadata and Float32 binary grids.
- `GET /api/terrain/elevation` — bilinear point elevation lookup (`null` when outside coverage).
- `GET /api/terrain/patch` — centered cropped Float32 DEM sub-grid (`X-Dem-Meta` JSON header).
- `GET /api/horizon` — precomputed or vectorized NumPy 360° horizon mask (returns `404` if outside coverage).
- `GET /api/ephemeris` — precomputed Q1 2027 lookup or dynamic JPL Horizons API query + cache (`MOON_ME`).

## Run tests

```bash
cd backend
pytest -v
```
