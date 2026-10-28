"""The six contract routes.  Handlers stay thin: call the service, map exceptions."""

from __future__ import annotations

import hmac
from datetime import date

from fastapi import APIRouter, Header, HTTPException

from . import config, service
from .schemas import (
    DayResponse,
    DaysResponse,
    ForecastResponse,
    MetaResponse,
    SummaryResponse,
    SyncResponse,
)

router = APIRouter(prefix="/api")


def _run(callable_, *args) -> object:
    try:
        return callable_(*args)
    except service.DatabaseNotSeeded as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except service.DecisionDateNotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except service.ForecastUnavailable as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/meta", response_model=MetaResponse)
def get_meta():
    return _run(service.get_meta)


@router.get("/summary", response_model=SummaryResponse)
def get_summary():
    return _run(service.get_summary)


@router.get("/days", response_model=DaysResponse)
def get_days():
    return _run(service.get_days)


@router.get("/days/{decision_date}", response_model=DayResponse)
def get_day(decision_date: date):
    return _run(service.get_day, decision_date)


@router.get("/forecast/{decision_date}", response_model=ForecastResponse)
def get_forecast(decision_date: date):
    return _run(service.get_forecast, decision_date)


@router.post("/admin/sync", response_model=SyncResponse)
def admin_sync(x_admin_token: str | None = Header(default=None)):
    configured = config.admin_sync_token()
    if not configured:
        raise HTTPException(status_code=503, detail="Sync disabled: ADMIN_SYNC_TOKEN is not set")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, configured):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Admin-Token")
    try:
        return service.sync_from_bmrs()
    except service.SyncFailed as exc:
        raise HTTPException(
            status_code=502,
            detail=f"BMRS sync failed: {exc}. Database left unchanged.",
        ) from exc
    except service.SyncWriteError as exc:
        raise HTTPException(status_code=500, detail="Sync failed: database write error") from exc
