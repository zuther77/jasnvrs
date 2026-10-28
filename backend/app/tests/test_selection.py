"""Gate-closure selection edge cases — the highest-risk correctness rule."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import pytest

from app import db
from app.metrics import (
    Forecast,
    NoGateIssue,
    build_day_series,
    gate_cutoff,
    select_gate_issue,
    sp_to_hourly,
)

UTC = timezone.utc


def issue_points(publish: datetime, delivery: date = date(2026, 1, 6)) -> list[Forecast]:
    return [
        Forecast(
            publish_time=publish,
            start_time=datetime.combine(delivery, time(hour=hour), tzinfo=UTC),
            generation_mw=1000.0 + hour,
        )
        for hour in range(24)
    ]


def test_cutoff_is_decision_date_0950_not_previous_day():
    assert gate_cutoff(date(2026, 1, 5)) == datetime(2026, 1, 5, 9, 50, tzinfo=UTC)


def test_issue_exactly_at_cutoff_is_included():
    cutoff = datetime(2026, 1, 5, 9, 50, tzinfo=UTC)
    forecasts = issue_points(datetime(2026, 1, 5, 7, 30, tzinfo=UTC)) + issue_points(cutoff)
    issue = select_gate_issue(forecasts, date(2026, 1, 5))
    assert issue.publish_time == cutoff


def test_issue_one_second_after_cutoff_is_excluded():
    forecasts = issue_points(datetime(2026, 1, 5, 9, 30, tzinfo=UTC)) + issue_points(
        datetime(2026, 1, 5, 9, 50, 1, tzinfo=UTC)
    )
    issue = select_gate_issue(forecasts, date(2026, 1, 5))
    assert issue.publish_time == datetime(2026, 1, 5, 9, 30, tzinfo=UTC)


def test_first_decision_day_uses_same_day_0930_not_previous_evening():
    forecasts = issue_points(
        datetime(2025, 12, 31, 22, 30, tzinfo=UTC), delivery=date(2026, 1, 2)
    ) + issue_points(datetime(2026, 1, 1, 9, 30, tzinfo=UTC), delivery=date(2026, 1, 2))
    issue = select_gate_issue(forecasts, date(2026, 1, 1))
    assert issue.publish_time == datetime(2026, 1, 1, 9, 30, tzinfo=UTC)


def test_last_decision_day_covers_feb_first():
    forecasts = issue_points(
        datetime(2026, 1, 31, 9, 30, tzinfo=UTC), delivery=date(2026, 2, 1)
    )
    issue = select_gate_issue(forecasts, date(2026, 1, 31))
    delivery = date(2026, 1, 31) + timedelta(days=1)
    assert delivery == date(2026, 2, 1)
    assert {point.start_time.date() for point in issue.points} == {date(2026, 2, 1)}


def test_previous_day_issue_is_used_when_same_day_issue_missing():
    forecasts = issue_points(
        datetime(2026, 1, 4, 22, 30, tzinfo=UTC), delivery=date(2026, 1, 6)
    )
    issue = select_gate_issue(forecasts, date(2026, 1, 5))
    assert issue.publish_time == datetime(2026, 1, 4, 22, 30, tzinfo=UTC)


def test_never_falls_forward_to_future_issue():
    forecasts = issue_points(datetime(2026, 1, 5, 11, 30, tzinfo=UTC))
    with pytest.raises(NoGateIssue):
        select_gate_issue(forecasts, date(2026, 1, 5))


def test_late_issue_cannot_be_gate_closure_for_same_day():
    cutoff = datetime(2026, 1, 5, 9, 50, tzinfo=UTC)
    late = datetime(2026, 1, 5, 12, 25, tzinfo=UTC)
    forecasts = issue_points(datetime(2026, 1, 5, 9, 30, tzinfo=UTC)) + issue_points(late)
    issue = select_gate_issue(forecasts, date(2026, 1, 5))
    assert issue.publish_time <= cutoff
    assert issue.publish_time != late


def test_seeded_every_decision_day_selects_0930_and_covers_24_hours(seeded_db):
    connection = db.connect(seeded_db)
    try:
        forecasts = db.load_forecasts(connection)
        actuals = db.load_actuals(connection)
    finally:
        connection.close()
    hourly = sp_to_hourly(actuals)

    expected_days = 0
    for offset in range(31):
        decision = date(2026, 1, 1) + timedelta(days=offset)
        issue = select_gate_issue(forecasts, decision)
        assert issue.publish_time == datetime.combine(decision, time(9, 30), tzinfo=UTC)
        delivery = decision + timedelta(days=1)
        series = build_day_series(issue, hourly[delivery], delivery)
        assert len(series) == 24
        expected_days += 1
    assert expected_days == 31
