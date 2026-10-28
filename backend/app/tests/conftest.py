"""Shared fixtures: a throwaway copy of the seeded DB, a TestClient, and a no-network guard."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[3]
SEEDED_DB = REPO_ROOT / "data" / "portal.db"
RAW_DIR = REPO_ROOT / "data" / "raw"
RAW_ACTUALS = RAW_DIR / "fuelhh_2026-01-02_2026-02-01.json"
RAW_FORECASTS = RAW_DIR / "windfor_2025-12-31_2026-02-01.json"


@pytest.fixture(scope="session")
def seeded_db(tmp_path_factory) -> Path:
    """Copy data/portal.db to a temp dir and point PORTAL_DB_PATH at the copy.

    Integration tests skip with a clear message when the repo has not been seeded.
    """
    if not SEEDED_DB.exists():
        pytest.skip("data/portal.db not found — run `python scripts/fetch_data.py` first")

    target = tmp_path_factory.mktemp("portal-db") / "portal.db"
    shutil.copy2(SEEDED_DB, target)
    for suffix in ("-wal", "-shm"):
        sidecar = SEEDED_DB.with_name(SEEDED_DB.name + suffix)
        if sidecar.exists():
            shutil.copy2(sidecar, target.with_name(target.name + suffix))

    from app import service

    previous = os.environ.get("PORTAL_DB_PATH")
    os.environ["PORTAL_DB_PATH"] = str(target)
    service.clear_cache()
    try:
        yield target
    finally:
        service.clear_cache()
        if previous is None:
            os.environ.pop("PORTAL_DB_PATH", None)
        else:
            os.environ["PORTAL_DB_PATH"] = previous


@pytest.fixture()
def client(seeded_db, monkeypatch) -> TestClient:
    monkeypatch.setenv("ADMIN_SYNC_TOKEN", "test-token")
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def raw_payloads() -> tuple[list[dict], list[dict]]:
    if not RAW_ACTUALS.exists() or not RAW_FORECASTS.exists():
        pytest.skip("raw BMRS payloads missing — run `python scripts/fetch_data.py` first")
    with RAW_ACTUALS.open(encoding="utf-8") as handle:
        actuals = json.load(handle)
    with RAW_FORECASTS.open(encoding="utf-8") as handle:
        forecasts = json.load(handle)
    return actuals, forecasts


@pytest.fixture()
def no_network(monkeypatch):
    """Any GET that touches BMRS fails loudly."""

    from app import bmrs

    def boom(*args, **kwargs):  # pragma: no cover - only fires on a regression
        raise AssertionError("GET endpoints must read SQLite only; BMRS was called")

    monkeypatch.setattr(bmrs, "fetch_fuelhh", boom)
    monkeypatch.setattr(bmrs, "fetch_windfor", boom)
    return boom
