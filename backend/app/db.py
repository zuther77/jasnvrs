"""SQLite persistence: schema, transactional replace, meta keys.

No ORM.  The database is a read-mostly artefact seeded by ``scripts/fetch_data.py``
and refreshed by ``POST /api/admin/sync``.
"""

from __future__ import annotations

import os
import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path

from . import config
from .metrics import Actual, Forecast

UTC = timezone.utc

SCHEMA_VERSION = "1"

SCHEMA = """
CREATE TABLE IF NOT EXISTS actuals (
  settlement_date   TEXT    NOT NULL,   -- YYYY-MM-DD
  settlement_period INTEGER NOT NULL,   -- 1..48
  start_time        TEXT    NOT NULL,   -- ISO UTC
  publish_time      TEXT    NOT NULL,   -- ISO UTC
  fuel_type         TEXT    NOT NULL,   -- 'WIND'
  generation_mw     REAL    NOT NULL,
  PRIMARY KEY (start_time)
);

CREATE TABLE IF NOT EXISTS forecasts (
  publish_time  TEXT NOT NULL,          -- ISO UTC, vintage
  start_time    TEXT NOT NULL,          -- ISO UTC, hourly target
  generation_mw REAL NOT NULL,
  PRIMARY KEY (publish_time, start_time)
);

CREATE INDEX IF NOT EXISTS idx_forecasts_start ON forecasts(start_time);
CREATE INDEX IF NOT EXISTS idx_forecasts_publish ON forecasts(publish_time);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


def iso(dt: datetime) -> str:
    """ISO 8601 UTC with ``Z`` and second precision (contract §1)."""
    return dt.astimezone(UTC).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_iso(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(UTC)


def connect(path: Path | str | None = None, *, readonly: bool | None = None) -> sqlite3.Connection:
    """Open the portal database.

    Read paths auto-detect a non-writable file (Vercel's deployment bundle is
    read-only) and open it with ``mode=ro``, skipping the WAL pragmas that would
    otherwise fail with "attempt to write a readonly database".
    """
    db_path = Path(path) if path is not None else config.db_path()
    if readonly is None:
        readonly = db_path.exists() and (
            not os.access(db_path, os.W_OK) or not os.access(db_path.parent, os.W_OK)
        )
    if readonly:
        connection = sqlite3.connect(
            f"file:{db_path.as_posix()}?mode=ro", uri=True, timeout=30.0
        )
        connection.row_factory = sqlite3.Row
        return connection
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=30.0)
    connection.row_factory = sqlite3.Row
    try:
        # Rollback journal (not WAL): the deployed database is mounted read-only on
        # Vercel, and SQLite cannot open a WAL database without write access to -shm.
        connection.execute("PRAGMA journal_mode=DELETE")
        connection.execute("PRAGMA synchronous=NORMAL")
    except sqlite3.OperationalError:
        # Read-only mount that os.access could not see (ACLs, container bind mounts).
        connection.close()
        return connect(db_path, readonly=True)
    return connection


def ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(SCHEMA)
    connection.commit()


def replace_all(
    connection: sqlite3.Connection,
    actual_rows: list[dict],
    forecast_rows: list[dict],
    *,
    synced_at: datetime,
    actual_start: date,
    actual_end: date,
    forecast_start: date,
    forecast_end: date,
) -> dict[str, int]:
    """Replace both datasets and meta in one transaction.

    A crash before commit leaves the previous database completely intact.  Raw rows
    are written verbatim (ingest never transforms).
    """
    actuals = [
        (
            str(row["settlementDate"])[:10],
            int(row["settlementPeriod"]),
            iso(_parse_iso(str(row["startTime"]))),
            iso(_parse_iso(str(row["publishTime"]))),
            str(row["fuelType"]),
            float(row["generation"]),
        )
        for row in actual_rows
    ]
    forecasts = [
        (
            iso(_parse_iso(str(row["publishTime"]))),
            iso(_parse_iso(str(row["startTime"]))),
            float(row["generation"]),
        )
        for row in forecast_rows
    ]
    issues = len({row[0] for row in forecasts})

    meta = {
        "schema_version": SCHEMA_VERSION,
        "last_sync_at": iso(synced_at),
        "last_sync_status": "ok",
        "actuals_rows": str(len(actuals)),
        "forecast_rows": str(len(forecasts)),
        "forecast_issues": str(issues),
        "source_actuals_window": f"{actual_start.isoformat()}..{actual_end.isoformat()}",
        "source_forecast_window": f"{forecast_start.isoformat()}..{forecast_end.isoformat()}",
    }

    connection.execute("BEGIN IMMEDIATE")
    try:
        connection.execute("DELETE FROM actuals")
        connection.execute("DELETE FROM forecasts")
        connection.executemany(
            "INSERT INTO actuals (settlement_date, settlement_period, start_time, "
            "publish_time, fuel_type, generation_mw) VALUES (?, ?, ?, ?, ?, ?)",
            actuals,
        )
        connection.executemany(
            "INSERT INTO forecasts (publish_time, start_time, generation_mw) VALUES (?, ?, ?)",
            forecasts,
        )
        connection.executemany(
            "INSERT INTO meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            list(meta.items()),
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    return {"actuals": len(actuals), "forecasts": len(forecasts), "issues": issues}


def read_meta(connection: sqlite3.Connection) -> dict[str, str]:
    return {row["key"]: row["value"] for row in connection.execute("SELECT key, value FROM meta")}


def row_counts(connection: sqlite3.Connection) -> dict[str, int]:
    actuals = connection.execute("SELECT COUNT(*) AS n FROM actuals").fetchone()["n"]
    forecasts = connection.execute("SELECT COUNT(*) AS n FROM forecasts").fetchone()["n"]
    issues = connection.execute(
        "SELECT COUNT(DISTINCT publish_time) AS n FROM forecasts"
    ).fetchone()["n"]
    return {"actuals": actuals, "forecasts": forecasts, "issues": issues}


def load_actuals(connection: sqlite3.Connection) -> list[Actual]:
    rows = connection.execute(
        "SELECT settlement_date, settlement_period, start_time, generation_mw FROM actuals "
        "ORDER BY start_time"
    )
    return [
        Actual(
            settlement_date=date.fromisoformat(row["settlement_date"]),
            settlement_period=row["settlement_period"],
            start_time=_parse_iso(row["start_time"]),
            generation_mw=row["generation_mw"],
        )
        for row in rows
    ]


def load_forecasts(connection: sqlite3.Connection) -> list[Forecast]:
    rows = connection.execute(
        "SELECT publish_time, start_time, generation_mw FROM forecasts "
        "ORDER BY publish_time, start_time"
    )
    return [
        Forecast(
            publish_time=_parse_iso(row["publish_time"]),
            start_time=_parse_iso(row["start_time"]),
            generation_mw=row["generation_mw"],
        )
        for row in rows
    ]


def table_exists(connection: sqlite3.Connection, name: str) -> bool:
    row = connection.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", (name,)
    ).fetchone()
    return row is not None


def is_seeded(db_path: Path | str | None = None) -> bool:
    path = Path(db_path) if db_path is not None else config.db_path()
    if not path.exists():
        return False
    connection = sqlite3.connect(path)
    try:
        if not table_exists(connection, "actuals") or not table_exists(connection, "forecasts"):
            return False
        counts = connection.execute(
            "SELECT (SELECT COUNT(*) FROM actuals) AS a, (SELECT COUNT(*) FROM forecasts) AS f"
        ).fetchone()
        return bool(counts[0]) and bool(counts[1])
    finally:
        connection.close()
