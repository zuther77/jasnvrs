"""Central configuration for the Wind Forecast Insights Portal backend.

Every window boundary, cutoff, path and metric threshold lives here.  No magic
values elsewhere in the codebase.
"""

from __future__ import annotations

import os
from datetime import date, time
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
DB_PATH = Path(os.environ.get("PORTAL_DB_PATH", DATA_DIR / "portal.db"))
RAW_DIR = DATA_DIR / "raw"

RAW_ACTUALS_FILENAME = "fuelhh_2026-01-02_2026-02-01.json"
RAW_FORECASTS_FILENAME = "windfor_2025-12-31_2026-02-01.json"


def db_path() -> Path:
    """Resolve the SQLite path at call time (tests point PORTAL_DB_PATH at a temp copy)."""
    return Path(os.environ.get("PORTAL_DB_PATH", DB_PATH))


# ---------------------------------------------------------------------------
# Analysis window
# ---------------------------------------------------------------------------

DECISION_START = date(2026, 1, 1)
DECISION_END = date(2026, 1, 31)

#: Delivery days are always decision date + 1 (day-ahead products).
DELIVERY_START = date(2026, 1, 2)
DELIVERY_END = date(2026, 2, 1)

#: FUELHH settlement-date window: the delivery days that follow each decision date.
ACTUALS_START = DELIVERY_START
ACTUALS_END = DELIVERY_END

#: WINDFOR publication window (inclusive start, inclusive end-of-day).
FORECAST_PUBLISH_START = date(2025, 12, 31)
FORECAST_PUBLISH_END = date(2026, 1, 31)

#: N2EX day-ahead gate closure, expressed as a UTC clock time on the decision date.
GATE_CLOSURE_UTC = time(9, 50)
TIMEZONE = "UTC"
TIMEZONE_LABEL = "Europe/London"

# ---------------------------------------------------------------------------
# Metrics
# ---------------------------------------------------------------------------

HORIZON_BUCKET_HOURS = 6
HORIZON_MAX_HOURS = 48
MAPE_MIN_ACTUAL_MW = 500.0

#: Publication times the WINDFOR feed normally uses (UTC). 2026-01-15 ships a
#: 12:25 issue instead of 11:30; that single exception is documented in
#: ``bmrs.ISSUE_TIME_EXCEPTIONS``.
CANONICAL_ISSUE_TIMES = ("02:30", "04:30", "07:30", "09:30", "11:30", "15:30", "18:30", "22:30")

#: Pre-gate vintages used by the issue-time table (minutes before 09:50 as of the data).
PRE_GATE_ISSUE_TIMES = ("02:30", "04:30", "07:30", "09:30")

# ---------------------------------------------------------------------------
# Contracts / expectations
# ---------------------------------------------------------------------------

CONTRACT_VERSION = "1.0"
PRODUCT_NAME = "Wind Forecast Insights Portal"

EXPECTED_ACTUAL_ROWS = 1488
EXPECTED_FORECAST_ROWS = 18688
EXPECTED_FORECAST_ISSUES = 256
EXPECTED_POINTS_PER_ISSUE = 73
EXPECTED_ISSUES_PER_DAY = 8
EXPECTED_DECISION_DAYS = 31
EXPECTED_DELIVERY_HOURS = 744

BMRS_BASE_URL = os.environ.get(
    "BMRS_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1/datasets"
).rstrip("/")


def admin_sync_token() -> str | None:
    """Read the admin token at request time, never at import time."""
    return os.environ.get("ADMIN_SYNC_TOKEN")
