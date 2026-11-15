# Build from repository root:
#   docker build -f backend/Dockerfile -t lunarsight-backend .
# Run locally:
#   docker run --rm -p 8000:8000 -v lunarsight_cache:/data/cache lunarsight-backend
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    LUNARSIGHT_PILOT_PUBLIC_DIR=/app/data/pilot_public \
    LUNARSIGHT_PILOT_SRC_DIR=/app/data/pilot_src \
    LUNARSIGHT_CACHE_DIR=/data/cache \
    LUNARSIGHT_DB_PATH=/data/cache/lunarsight.db

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/app /app/backend/app
COPY web/public/data/pilot /app/data/pilot_public
COPY web/src/data/pilot/*.json /app/data/pilot_src/

RUN mkdir -p /data/cache && useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app /data
USER appuser

WORKDIR /app/backend
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
