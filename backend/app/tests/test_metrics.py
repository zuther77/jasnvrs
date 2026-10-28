"""Hand-computed unit tests for the pure metrics engine, plus seeded anchors."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone

import pytest

from app import service
from app.metrics import (
    Actual,
    Forecast,
    IncompleteDay,
    Issue,
    NoGateIssue,
    build_day_series,
    day_rank_percentile,
    delivery_date,
    energy_summary,
    error_metrics,
    error_percentiles,
    horizon_table,
    select_gate_issue,
    sp_to_hourly,
)

UTC = timezone.utc


def make_issue(
    values: dict[int, float] | None = None,
    *,
    constant: float = 10_000.0,
    publish: datetime | None = None,
    delivery: date = date(2026, 1, 6),
) -> Issue:
    stamp = publish or datetime(2026, 1, 5, 9, 30, tzinfo=UTC)
    points = tuple(
        Forecast(
            publish_time=stamp,
            start_time=datetime.combine(delivery, time(hour=hour), tzinfo=UTC),
            generation_mw=(values or {}).get(hour, constant),
        )
        for hour in range(24)
    )
    return Issue(publish_time=stamp, points=points)


def constant_actuals(value: float = 11_000.0, day: date = date(2026, 1, 6)) -> dict[int, float]:
    return {hour: value for hour in range(24)}


def full_actual_rows(value: float = 10_000.0, day: date = date(2026, 1, 6)) -> list[Actual]:
    rows: list[Actual] = []
    period = 1
    for hour in range(24):
        for minute in (0, 30):
            rows.append(
                Actual(
                    settlement_date=day,
                    settlement_period=period,
                    start_time=datetime.combine(day, time(hour, minute), tzinfo=UTC),
                    generation_mw=value,
                )
            )
            period += 1
    return rows


# ---------------------------------------------------------------------------
# Sign convention
# ---------------------------------------------------------------------------


def test_error_sign_is_forecast_minus_actual():
    over = make_issue({0: 12_000.0})
    under = make_issue({0: 10_000.0})
    actuals = constant_actuals(11_000.0)

    over_row = build_day_series(over, actuals, date(2026, 1, 6))[0]
    under_row = build_day_series(under, actuals, date(2026, 1, 6))[0]

    assert over_row["error_mw"] == pytest.approx(1000.0)
    assert under_row["error_mw"] == pytest.approx(-1000.0)


# ---------------------------------------------------------------------------
# Error statistics
# ---------------------------------------------------------------------------


def test_mae_rmse_bias_hand_computed():
    metrics = error_metrics([100.0, -200.0, 300.0])
    assert metrics["count"] == 3
    assert metrics["mae_mw"] == pytest.approx(200.0)
    assert round(metrics["rmse_mw"], 2) == 216.02
    assert round(metrics["bias_mw"], 2) == 66.67


def test_mape_guard_uses_only_hours_above_500_mw():
    metrics = error_metrics([40.0, 100.0], [400.0, 1000.0])
    assert metrics["mape_pct"] == pytest.approx(10.0)
    assert metrics["mape_hours"] == 1


def test_mape_is_none_when_all_actuals_below_guard():
    metrics = error_metrics([40.0, 50.0], [400.0, 499.9])
    assert metrics["mape_pct"] is None
    assert metrics["mape_hours"] == 0


def test_percentiles_linear_interpolation():
    values = error_percentiles([0.0, 100.0])
    assert values["p05_mw"] == pytest.approx(5.0)
    assert values["p50_mw"] == pytest.approx(50.0)
    assert values["p95_mw"] == pytest.approx(95.0)


def test_percentiles_are_order_independent():
    ordered = error_percentiles([0.0, 50.0, 100.0])
    shuffled = error_percentiles([100.0, 0.0, 50.0])
    assert ordered == pytest.approx(shuffled)


# ---------------------------------------------------------------------------
# Alignment and energy
# ---------------------------------------------------------------------------


def test_sp_pair_averages_to_hourly_mean():
    rows = full_actual_rows(1000.0)
    rows[0] = Actual(rows[0].settlement_date, 1, rows[0].start_time, 1000.0)
    rows[1] = Actual(rows[1].settlement_date, 2, rows[1].start_time, 1400.0)
    hourly = sp_to_hourly(rows)
    assert hourly[date(2026, 1, 6)][0] == pytest.approx(1200.0)
    assert len(hourly[date(2026, 1, 6)]) == 24


def test_sp_pair_missing_raises():
    rows = full_actual_rows(1000.0)[:-1]
    with pytest.raises(IncompleteDay):
        sp_to_hourly(rows)


def test_energy_totals_use_mw_hours():
    rows = full_actual_rows(10_000.0)  # 48 x 10,000 MW -> 240,000 MWh
    hourly = sp_to_hourly(rows)
    issue = make_issue(constant=10_000.0)
    series = build_day_series(issue, hourly[date(2026, 1, 6)], date(2026, 1, 6))
    energy = energy_summary(series)
    assert energy["forecast_total_mwh"] == pytest.approx(240_000.0)
    assert energy["actual_total_mwh"] == pytest.approx(240_000.0)
    assert sum(row["forecast_mw"] for row in series) == pytest.approx(240_000.0)


# ---------------------------------------------------------------------------
# Selection and timeline
# ---------------------------------------------------------------------------


def test_gate_selection_prefers_0930_over_0730():
    forecasts = list(make_issue({}, publish=datetime(2026, 1, 5, 7, 30, tzinfo=UTC)).points) + list(
        make_issue({}, publish=datetime(2026, 1, 5, 9, 30, tzinfo=UTC)).points
    )
    issue = select_gate_issue(forecasts, date(2026, 1, 5))
    assert issue.publish_time == datetime(2026, 1, 5, 9, 30, tzinfo=UTC)


def test_gate_selection_ignores_post_cutoff_issue():
    forecasts = list(make_issue({}, publish=datetime(2026, 1, 5, 9, 30, tzinfo=UTC)).points) + list(
        make_issue({}, publish=datetime(2026, 1, 5, 9, 55, tzinfo=UTC)).points
    )
    issue = select_gate_issue(forecasts, date(2026, 1, 5))
    assert issue.publish_time == datetime(2026, 1, 5, 9, 30, tzinfo=UTC)


def test_gate_selection_raises_without_issue():
    forecasts = list(make_issue({}, publish=datetime(2026, 1, 5, 10, 0, tzinfo=UTC)).points)
    with pytest.raises(NoGateIssue):
        select_gate_issue(forecasts, date(2026, 1, 5))


def test_delivery_date_mapping():
    assert delivery_date(date(2026, 1, 1)) == date(2026, 1, 2)
    assert delivery_date(date(2026, 1, 31)) == date(2026, 2, 1)


def test_horizon_bucketing_boundaries():
    delivery = date(2026, 1, 2)
    target = datetime.combine(delivery, time(0), tzinfo=UTC)
    points = [
        Forecast(target, target, 1000.0),  # 0.0 h -> bucket 0
        Forecast(target - timedelta(hours=5.99), target, 1000.0),  # bucket 0
        Forecast(target - timedelta(hours=6.0), target, 1000.0),  # bucket 1 (6 h)
        Forecast(target - timedelta(hours=47.99), target, 1000.0),  # bucket 7 (42 h)
        Forecast(target - timedelta(hours=48.0), target, 1000.0),  # excluded
    ]
    table = horizon_table(points, {delivery: {0: 1000.0}})
    assert [row["count"] for row in table] == [2, 1, 0, 0, 0, 0, 0, 1]
    assert [row["horizon_start_h"] for row in table] == [0, 6, 12, 18, 24, 30, 36, 42]


def test_rank_percentile_inclusive():
    assert day_rank_percentile(20.0, [10.0, 20.0, 30.0]) == 66.7


# ---------------------------------------------------------------------------
# Seeded integration anchors (skipped without data/portal.db)
# ---------------------------------------------------------------------------


def test_seeded_jan5_acceptance_anchors(seeded_db):
    day = service.get_day(date(2026, 1, 5))
    assert day["metrics"]["mae_mw"] == 2127.3
    assert day["metrics"]["rmse_mw"] == 2504.4
    assert day["metrics"]["bias_mw"] == 2016.0
    assert day["summary"]["forecast_total_mwh"] == 275_148.0
    assert day["summary"]["actual_total_mwh"] == 226_764.5
    assert day["series"][5]["forecast_mw"] == 8662.0
    assert day["series"][5]["actual_mw"] == 4582.0
    assert day["series"][5]["error_mw"] == 4080.0
    assert day["series"][21]["error_mw"] == -714.0
    assert day["percentiles"]["p05_mw"] == -413.5
    assert day["percentiles"]["p50_mw"] == 1887.5
    assert day["percentiles"]["p95_mw"] == 3916.8


def test_seeded_window_acceptance_anchors(seeded_db):
    summary = service.get_summary()
    overall = summary["overall"]
    assert overall["mae_mw"] == 2013.0
    assert overall["rmse_mw"] == 2505.9
    assert overall["bias_mw"] == 1729.9
    assert overall["hours_in_shortfall"] == 627
    assert summary["energy"]["forecast_total_mwh"] == 9_682_036.0
    assert summary["energy"]["actual_total_mwh"] == 8_394_967.0
    horizon_mae = [row["mae_mw"] for row in summary["by_horizon"]]
    assert horizon_mae == pytest.approx(
        [1686.4, 1763.3, 1855.5, 1953.6, 1970.2, 2067.4, 2167.5, 2333.9], abs=0.05
    )
    issue_mae = [row["mae_mw"] for row in summary["by_issue_time"]]
    assert issue_mae == pytest.approx([2073.1, 2016.1, 2038.9, 2013.0], abs=0.05)
