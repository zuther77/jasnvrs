"""FastAPI application entry point.

Single process: serves ``/api/*`` from SQLite and, when a production build exists,
the built React bundle at ``/``.  No CORS middleware by design (Vite proxy in dev,
same origin in prod).
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from . import config
from .api import router

app = FastAPI(
    title=config.PRODUCT_NAME,
    version=config.CONTRACT_VERSION,
    description="Wind forecast accuracy for GB day-ahead trading decisions (January 2026).",
)

app.include_router(router)


@app.middleware("http")
async def no_store_api(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/healthz", include_in_schema=False)
def healthz() -> dict[str, str]:
    return {"status": "ok"}


_DIST: Path = config.REPO_ROOT / "frontend" / "dist"
if _DIST.exists():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="ui")
