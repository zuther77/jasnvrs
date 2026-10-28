"""Pure metrics engine for the Wind Forecast Insights Portal.

No DB, no HTTP, no file I/O.  Every function takes plain data in and returns plain
dicts/lists out, so the whole analytics surface is unit-testable in isolation.

Normative definitions (API_CONTRACT.md §1.1):
  error_mw      = forecast_mw - actual_mw   (positive = over-forecast = shortfall risk)
  hourly actual = mean of the two FUELHH half-hours starting h:00 and h:30
  MAE           = mean |error|
  RMSE          = sqrt(mean error^2)
  bias          = mean error
  MAPE          = mean(|error| / actual * 100) over hours with actual >= 500 MW
  percentiles   = empirical quantiles with linear interpolation (Hyndman-Fan type 7)
"""

from __future__ import annotations

import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone

from . import config

UTC = timezone.utc


# ---------------------------------------------------------------------------
# Value objects
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class Actual:
    """One FUELHH half-hourly outturn row."""

    settlement_date: date
    settlement_period: int
    start_time: datetime
    generation_mw: float


@dataclass(frozen=True, slots=True)
class Forecast:
    """One WINDFOR hourly forecast point, tagged with the vintage that produced it."""

    publish_time: datetime
    start_time: datetime
    generation_mw: float


@dataclass(frozen=True, slots=True)
class Issue:
    """A complete forecast vintage: publish time plus its points, ascending target time."""

    publish_time: datetime
    points: tuple[Forecast, ...]

    @property
    def issue_time(self) -> time:
        return self.publish_time.timetz().replace(tzinfo=None)


class NoGateIssue(Exception):
    """No WINDFOR issue exists at or before the gate-closure cutoff."""


class IncompleteDay(Exception):
    """A delivery day is missing one or more hours of actuals or forecasts."""


# ---------------------------------------------------------------------------
# Timeline helpers
# ---------------------------------------------------------------------------


def delivery_date(decision_date: date) -> date:
    """Day-ahead products bought on ``decision_date`` deliver the next calendar day."""
    return decision_date + timedelta(days=1)


def gate_cutoff(decision_date: date, cutoff: time | None = None) -> datetime:
    """Gate closure for a decision date: ``decision_date T09:50:00Z``.

    Not ``decision_date - 1``: the decision date already *is* D-1 for delivery day D.
    """
    return datetime.combine(decision_date, cutoff or config.GATE_CLOSURE_UTC, tzinfo=UTC)


def decision_dates() -> list[date]:
    """All decision dates in the frozen analysis window, ascending."""
    span = (config.DECISION_END - config.DECISION_START).days
    return [config.DECISION_START + timedelta(days=i) for i in range(span + 1)]


def format_issue_time(dt: datetime) -> str:
    """``09:30`` style UTC clock label for an issue timestamp."""
    return dt.astimezone(UTC).strftime("%H:%M")


def horizon_hours(publish_time: datetime, target_time: datetime) -> float:
    return (target_time - publish_time).total_seconds() / 3600.0


# ---------------------------------------------------------------------------
# Alignment
# ---------------------------------------------------------------------------


def sp_to_hourly(actuals: Sequence[Actual]) -> dict[date, dict[int, float]]:
    """Collapse 48 half-hourly settlement periods per day into 24 hourly means.

    Hour ``h`` is ``mean(SP starting h:00, SP starting h:30)``.  No interpolation is
    invented: a missing half-hour raises ``IncompleteDay``.
    """
    slots: dict[date, dict[tuple[int, int], float]] = {}
    for row in actuals:
        key = row.start_time.astimezone(UTC)
        slots.setdefault(key.date(), {})[(key.hour, key.minute)] = row.generation_mw

    hourly: dict[date, dict[int, float]] = {}
    for day, values in slots.items():
        hours: dict[int, float] = {}
        missing: list[str] = []
        for hour in range(24):
            first = values.get((hour, 0))
            second = values.get((hour, 30))
            if first is None or second is None:
                missing.append(f"{hour:02d}:00/{hour:02d}:30")
                continue
            hours[hour] = (first + second) / 2.0
        if missing:
            raise IncompleteDay(f"{day.isoformat()} missing settlement periods: {', '.join(missing)}")
        hourly[day] = hours
    return hourly


# ---------------------------------------------------------------------------
# Gate-closure selection
# ---------------------------------------------------------------------------


def select_gate_issue(
    forecasts: Sequence[Forecast],
    decision_date: date,
    cutoff: time | None = None,
) -> Issue:
    """Latest issue published at or before gate closure; never falls back in time."""
    cutoff_dt = gate_cutoff(decision_date, cutoff)
    publish_times = [row.publish_time for row in forecasts if row.publish_time <= cutoff_dt]
    if not publish_times:
        raise NoGateIssue(
            f"No WINDFOR issue published at or before {cutoff_dt.isoformat()} "
            f"for decision date {decision_date.isoformat()}"
        )
    chosen = max(publish_times)
    points = tuple(
        sorted(
            (row for row in forecasts if row.publish_time == chosen),
            key=lambda row: row.start_time,
        )
    )
    return Issue(publish_time=chosen, points=points)


def group_issues(forecasts: Sequence[Forecast]) -> dict[datetime, Issue]:
    """Every vintage in the input, keyed by publish time, ascending target order."""
    grouped: dict[datetime, list[Forecast]] = {}
    for row in forecasts:
        grouped.setdefault(row.publish_time, []).append(row)
    return {
        publish: Issue(publish_time=publish, points=tuple(sorted(rows, key=lambda r: r.start_time)))
        for publish, rows in grouped.items()
    }


def build_day_series(
    issue: Issue,
    hourly_actuals: Mapping[int, float],
    delivery: date,
) -> list[dict]:
    """24 ascending rows of forecast, actual and signed error for one delivery day."""
    by_hour: dict[int, float] = {}
    for point in issue.points:
        target = point.start_time.astimezone(UTC)
        if target.date() == delivery and target.minute == 0 and target.second == 0:
            by_hour[target.hour] = point.generation_mw

    series: list[dict] = []
    missing: list[int] = []
    for hour in range(24):
        forecast = by_hour.get(hour)
        actual = hourly_actuals.get(hour)
        if forecast is None or actual is None:
            missing.append(hour)
            continue
        series.append(
            {
                "hour_utc": datetime.combine(delivery, time(hour=hour), tzinfo=UTC),
                "hour_of_day": hour,
                "forecast_mw": float(forecast),
                "actual_mw": float(actual),
                "error_mw": float(forecast) - float(actual),
            }
        )
    if missing:
        raise IncompleteDay(
            f"Delivery day {delivery.isoformat()} missing hours: "
            f"{', '.join(f'{hour:02d}:00' for hour in missing)}"
        )
    return series


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------


def error_metrics(
    errors: Sequence[float],
    actuals: Sequence[float] | None = None,
) -> dict:
    """MAE / RMSE / bias / guarded MAPE for a set of signed errors."""
    values = [float(value) for value in errors]
    count = len(values)
    if count == 0:
        return {
            "count": 0,
            "mae_mw": None,
            "rmse_mw": None,
            "bias_mw": None,
            "mape_pct": None,
            "mape_hours": 0,
        }
    absolute = [abs(value) for value in values]
    mae = sum(absolute) / count
    rmse = math.sqrt(sum(value * value for value in values) / count)
    bias = sum(values) / count

    mape_pct: float | None = None
    mape_hours = 0
    if actuals is not None:
        ratios = [
            abs(error) / actual * 100.0
            for error, actual in zip(values, actuals, strict=True)
            if actual >= config.MAPE_MIN_ACTUAL_MW
        ]
        mape_hours = len(ratios)
        if mape_hours:
            mape_pct = sum(ratios) / mape_hours
    return {
        "count": count,
        "mae_mw": mae,
        "rmse_mw": rmse,
        "bias_mw": bias,
        "mape_pct": mape_pct,
        "mape_hours": mape_hours,
    }


def percentile(values: Sequence[float], fraction: float) -> float:
    """Empirical quantile, linear interpolation (numpy ``method="linear"`` / type 7)."""
    ordered = sorted(float(value) for value in values)
    if not ordered:
        raise ValueError("percentile of an empty sequence")
    if len(ordered) == 1:
        return ordered[0]
    position = fraction * (len(ordered) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[int(position)]
    weight = position - lower
    return ordered[lower] * (1.0 - weight) + ordered[upper] * weight


def error_percentiles(errors: Sequence[float]) -> dict:
    values = [float(value) for value in errors]
    return {
        "p05_mw": percentile(values, 0.05),
        "p50_mw": percentile(values, 0.50),
        "p95_mw": percentile(values, 0.95),
    }


def energy_summary(series: Sequence[dict]) -> dict:
    """Energy and extremes for a 24-row day series.

    Each hourly row spans one hour, so ``sum(MW)`` is already MWh — identical to
    summing the 48 underlying half-hours at 0.5 h each.
    """
    forecasts = [float(row["forecast_mw"]) for row in series]
    actuals = [float(row["actual_mw"]) for row in series]
    errors = [float(row["error_mw"]) for row in series]
    if not forecasts:
        raise ValueError("energy_summary of an empty series")

    forecast_peak_idx = max(range(len(forecasts)), key=lambda i: forecasts[i])
    forecast_min_idx = min(range(len(forecasts)), key=lambda i: forecasts[i])
    actual_peak_idx = max(range(len(actuals)), key=lambda i: actuals[i])
    actual_min_idx = min(range(len(actuals)), key=lambda i: actuals[i])

    max_shortfall = max(0.0, max(errors))
    max_overdelivery = min(0.0, min(errors))
    shortfall_idx = max(range(len(errors)), key=lambda i: errors[i])
    overdelivery_idx = min(range(len(errors)), key=lambda i: errors[i])

    return {
        "forecast_total_mwh": sum(forecasts),
        "actual_total_mwh": sum(actuals),
        "forecast_avg_mw": sum(forecasts) / len(forecasts),
        "forecast_peak_mw": forecasts[forecast_peak_idx],
        "forecast_min_mw": forecasts[forecast_min_idx],
        "forecast_peak_hour_utc": series[forecast_peak_idx]["hour_utc"],
        "forecast_min_hour_utc": series[forecast_min_idx]["hour_utc"],
        "actual_avg_mw": sum(actuals) / len(actuals),
        "actual_peak_mw": actuals[actual_peak_idx],
        "actual_min_mw": actuals[actual_min_idx],
        "actual_peak_hour_utc": series[actual_peak_idx]["hour_utc"],
        "actual_min_hour_utc": series[actual_min_idx]["hour_utc"],
        "max_shortfall_mw": max_shortfall,
        "max_shortfall_hour_utc": (
            series[shortfall_idx]["hour_utc"] if max_shortfall > 0.0 else None
        ),
        "max_overdelivery_mw": max_overdelivery,
        "max_overdelivery_hour_utc": (
            series[overdelivery_idx]["hour_utc"] if max_overdelivery < 0.0 else None
        ),
    }


def horizon_table(
    forecasts: Sequence[Forecast],
    hourly_actuals: Mapping[date, Mapping[int, float]],
) -> list[dict]:
    """Error by lead time: all issues, 0 <= horizon < 48 h, 6-hour buckets."""
    bucket_count = config.HORIZON_MAX_HOURS // config.HORIZON_BUCKET_HOURS
    buckets = [
        {"count": 0, "abs": 0.0, "sq": 0.0, "signed": 0.0} for _ in range(bucket_count)
    ]
    for point in forecasts:
        lead = horizon_hours(point.publish_time, point.start_time)
        if not (0.0 <= lead < config.HORIZON_MAX_HOURS):
            continue
        target = point.start_time.astimezone(UTC)
        actual = hourly_actuals.get(target.date(), {}).get(target.hour)
        if actual is None:
            continue
        error = float(point.generation_mw) - float(actual)
        index = min(int(lead // config.HORIZON_BUCKET_HOURS), bucket_count - 1)
        buckets[index]["count"] += 1
        buckets[index]["abs"] += abs(error)
        buckets[index]["sq"] += error * error
        buckets[index]["signed"] += error

    rows: list[dict] = []
    for index, bucket in enumerate(buckets):
        count = bucket["count"]
        rows.append(
            {
                "horizon_start_h": index * config.HORIZON_BUCKET_HOURS,
                "horizon_end_h": (index + 1) * config.HORIZON_BUCKET_HOURS,
                "count": count,
                "mae_mw": bucket["abs"] / count if count else None,
                "rmse_mw": math.sqrt(bucket["sq"] / count) if count else None,
                "bias_mw": bucket["signed"] / count if count else None,
            }
        )
    return rows


def issue_time_table(
    forecasts: Sequence[Forecast],
    hourly_actuals: Mapping[date, Mapping[int, float]],
) -> list[dict]:
    """Accuracy of the four pre-gate vintages, delivery-day hours only."""
    issues = group_issues(forecasts)
    cutoff_minutes = config.GATE_CLOSURE_UTC.hour * 60 + config.GATE_CLOSURE_UTC.minute
    rows: list[dict] = []
    for label in config.PRE_GATE_ISSUE_TIMES:
        hour, minute = (int(part) for part in label.split(":"))
        count = 0
        abs_sum = 0.0
        sq_sum = 0.0
        signed_sum = 0.0
        for decision in decision_dates():
            publish = datetime.combine(
                decision, time(hour=hour, minute=minute), tzinfo=UTC
            )
            issue = issues.get(publish)
            if issue is None:
                continue
            delivery = delivery_date(decision)
            actuals = hourly_actuals.get(delivery, {})
            for point in issue.points:
                target = point.start_time.astimezone(UTC)
                if target.date() != delivery:
                    continue
                actual = actuals.get(target.hour)
                if actual is None:
                    continue
                error = float(point.generation_mw) - float(actual)
                count += 1
                abs_sum += abs(error)
                sq_sum += error * error
                signed_sum += error
        rows.append(
            {
                "issue_time_utc": label,
                "minutes_before_gate": cutoff_minutes - (hour * 60 + minute),
                "count": count,
                "mae_mw": abs_sum / count if count else None,
                "rmse_mw": math.sqrt(sq_sum / count) if count else None,
                "bias_mw": signed_sum / count if count else None,
            }
        )
    return rows


def scatter_rows(series_by_day: Mapping[date, Sequence[dict]]) -> list[dict]:
    """One row per evaluated delivery hour, ascending delivery time."""
    rows = [
        {
            "delivery_hour_utc": row["hour_utc"],
            "decision_date": decision,
            "forecast_mw": row["forecast_mw"],
            "actual_mw": row["actual_mw"],
            "error_mw": row["error_mw"],
        }
        for decision, series in series_by_day.items()
        for row in series
    ]
    rows.sort(key=lambda row: (row["delivery_hour_utc"], row["decision_date"]))
    return rows


def day_rank_percentile(value: float, values: Iterable[float]) -> float:
    """Inclusive rank percentile: 100 * count(v <= value) / n, one decimal."""
    sequence = list(values)
    if not sequence:
        raise ValueError("rank percentile of an empty sequence")
    at_or_below = sum(1 for item in sequence if item <= value)
    return round(100.0 * at_or_below / len(sequence), 1)
