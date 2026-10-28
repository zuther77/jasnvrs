#!/usr/bin/env python3
"""Seed / validate the Wind Forecast Insights Portal dataset.

Usage
-----
    python scripts/fetch_data.py --check     # fetch + validate, print PASS/FAIL, write nothing
    python scripts/fetch_data.py             # fetch + validate + write raw JSON + SQLite
    python scripts/fetch_data.py --from-raw  # rebuild SQLite from data/raw/*.json, no network

The script lives outside the ``app`` package, so it puts ``backend/`` on sys.path first.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_PATH = Path(__file__).resolve()
REPO_ROOT = SCRIPT_PATH.parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import bmrs, config, db  # noqa: E402
from app.metrics import decision_dates, gate_cutoff, group_issues  # noqa: E402

UTC = timezone.utc


def _load_raw(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise SystemExit(f"FAIL {path} does not contain a JSON list")
    return payload


def _write_raw(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(rows, handle, separators=(",", ":"))
        handle.write("\n")


def _gate_times(raw_forecasts: list[dict]) -> list[str]:
    """Distinct gate-closure issue clock times across all decision days."""
    forecasts = bmrs.parse_forecasts(raw_forecasts)
    issues = group_issues(forecasts)
    labels = set()
    for decision in decision_dates():
        cutoff = gate_cutoff(decision)
        candidates = [stamp for stamp in issues if stamp <= cutoff]
        if candidates:
            labels.add(max(candidates).strftime("%H:%M"))
    return sorted(labels)


def _write_database(raw_actuals: list[dict], raw_forecasts: list[dict], db_path: Path) -> dict[str, int]:
    connection = db.connect(db_path)
    try:
        db.ensure_schema(connection)
        counts = db.replace_all(
            connection,
            raw_actuals,
            raw_forecasts,
            synced_at=datetime.now(UTC),
            actual_start=config.ACTUALS_START,
            actual_end=config.ACTUALS_END,
            forecast_start=config.FORECAST_PUBLISH_START,
            forecast_end=config.FORECAST_PUBLISH_END,
        )
    finally:
        connection.close()
    return counts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate only; write nothing")
    parser.add_argument("--from-raw", action="store_true", help="rebuild the DB from data/raw")
    parser.add_argument("--db", type=Path, default=None, help="override the SQLite path")
    args = parser.parse_args(argv)

    if args.db is not None:
        config.DB_PATH = args.db
    db_path = Path(args.db) if args.db is not None else config.db_path()
    raw_dir = config.RAW_DIR
    actual_raw_path = raw_dir / config.RAW_ACTUALS_FILENAME
    forecast_raw_path = raw_dir / config.RAW_FORECASTS_FILENAME

    try:
        if args.from_raw:
            if not actual_raw_path.exists() or not forecast_raw_path.exists():
                print(
                    f"FAIL raw payloads missing: expected {actual_raw_path} and {forecast_raw_path}",
                    file=sys.stderr,
                )
                return 1
            raw_actuals = _load_raw(actual_raw_path)
            raw_forecasts = _load_raw(forecast_raw_path)
        else:
            raw_actuals = bmrs.fetch_fuelhh()
            raw_forecasts = bmrs.fetch_windfor()

        actual_report = bmrs.validate_actuals(raw_actuals)
        forecast_report = bmrs.validate_forecasts(raw_forecasts)
    except (bmrs.IngestValidationError, bmrs.BmrsTransportError) as exc:
        print(f"FAIL {exc}", file=sys.stderr)
        return 1

    for warning in forecast_report.warnings:
        print(f"NOTE {warning}", file=sys.stderr)

    labels = _gate_times(raw_forecasts)
    gate_label = f"{labels[0]}Z" if len(labels) == 1 else "mixed"
    print(
        f"PASS actuals    {actual_report.actual_rows} rows | 31 days x 48 SPs | "
        f"{config.ACTUALS_START.isoformat()}..{config.ACTUALS_END.isoformat()}"
    )
    print(
        f"PASS forecasts  {forecast_report.forecast_rows} rows | "
        f"{forecast_report.issues} issues x {forecast_report.points_per_issue} points | "
        f"{forecast_report.publish_days} publish days x 8 issues"
    )
    print(
        f"PASS gate       {forecast_report.gate_days_covered}/31 decision days | "
        f"{forecast_report.gate_hours_covered}/744 delivery hours | {gate_label} issue"
    )

    if args.check:
        return 0

    if not args.from_raw:
        _write_raw(actual_raw_path, raw_actuals)
        _write_raw(forecast_raw_path, raw_forecasts)
        print(f"WROTE {actual_raw_path.relative_to(REPO_ROOT)} ({len(raw_actuals)} rows)")
        print(f"WROTE {forecast_raw_path.relative_to(REPO_ROOT)} ({len(raw_forecasts)} rows)")

    try:
        counts = _write_database(raw_actuals, raw_forecasts, db_path)
    except Exception as exc:  # pragma: no cover - operational failure path
        print(f"FAIL database write: {exc}", file=sys.stderr)
        return 1

    try:
        shown = db_path.relative_to(REPO_ROOT)
    except ValueError:
        shown = db_path
    print(
        f"WROTE {shown} ({counts['actuals']} actuals, {counts['forecasts']} forecasts, "
        f"{counts['issues']} issues)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
