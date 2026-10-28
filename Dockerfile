# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1 — build the React UI
# ---------------------------------------------------------------------------
FROM node:24-alpine AS ui

WORKDIR /ui
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Python API + static bundle, one process
# ---------------------------------------------------------------------------
FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY data/ /app/data/
COPY --from=ui /ui/dist /app/frontend/dist

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Vercel (and other container hosts) inject PORT; shell form so ${PORT} expands
# at runtime. Local `docker compose up` gets PORT=8000 via the default below.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
