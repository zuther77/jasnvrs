"""Service assembly, cache invalidation and error mapping."""

from __future__ import annotations

import sqlite3
from datetime import date, datetime, timezone

import pytest

from app import service

UTC = timezone.utc


def test_meta_counts_and_vintage(seeded_db):
    meta = service.get_meta()
    assert meta["counts"] == {
        "actual_rows": 1488,
        "forecast_rows": 18688,
        "forecast_issues": 256,
        "points_per_issue": 73,
        "issues_per_day": 8,
        "decision_days": 31,
        "delivery_hours": 744,
        "hours_evaluated": 744,
    }
    assert meta["data_vintage"]["actuals_first_start_utc"] == datetime(
        2026, 1, 2, 0, 0, tzinfo=UTC
    )
    assert meta["data_vintage"]["actuals_last_start_utc"] == datetime(
        2026, 2, 1, 23, 30, tzinfo=UTC
    )
    assert meta["data_vintage"]["forecasts_first_publish_utc"] == datetime(
        2025, 12, 31, 2, 30, tzinfo=UTC
    )
    assert meta["data_vintage"]["forecasts_last_publish_utc"] == datetime(
        2026, 1, 31, 22, 30, tzinfo=UTC
    )


def test_days_are_ascending_and_complete(seeded_db):
    payload = service.get_days()
    assert payload["count"] == 31
    dates = [row["decision_date"] for row in payload["days"]]
    assert dates == sorted(dates)
    assert dates[0] == date(2026, 1, 1)
    assert dates[-1] == date(2026, 1, 31)
    assert all(row["hours_evaluated"] == 24 for row in payload["days"])
    assert all(row["is_complete"] for row in payload["days"])


def test_out_of_window_date_maps_to_contract_message(seeded_db):
    with pytest.raises(service.DecisionDateNotFound) as excinfo:
        service.get_day(date(2026, 2, 5))
    assert str(excinfo.value) == (
        "Decision date 2026-02-05 is outside the analysis window 2026-01-01..2026-01-31"
    )


def test_cache_reloads_when_database_changes(seeded_db):
    first = service.get_meta()
    assert first["data_vintage"]["last_sync_at"] != datetime(2026, 12, 1, tzinfo=UTC)

    connection = sqlite3.connect(seeded_db)
    try:
        connection.execute(
            "UPDATE meta SET value = ? WHERE key = 'last_sync_at'",
            ("2026-12-01T00:00:00Z",),
        )
        connection.commit()
    finally:
        connection.close()

    second = service.get_meta()
    assert second["data_vintage"]["last_sync_at"] == datetime(2026, 12, 1, tzinfo=UTC)


def test_jan5_window_context_percentiles(seeded_db):
    day = service.get_day(date(2026, 1, 5))
    context = day["window_context"]
    assert context["window_mae_mw"] == 2013.0
    assert context["window_bias_mw"] == 1729.9
    assert context["day_mae_percentile"] == 77.4
    assert context["day_bias_percentile"] == 74.2


def test_forecast_retains_late_1225_vintage(seeded_db):
    payload = service.get_forecast(date(2026, 1, 15))
    labels = [issue["issue_time_utc"] for issue in payload["issues"]]
    assert payload["issue_count"] == 8
    assert "12:25" in labels
    assert "11:30" not in labels
    assert payload["gate_closure_issue_time_utc"] == "09:30"
    assert sum(1 for issue in payload["issues"] if issue["is_gate_closure"]) == 1
