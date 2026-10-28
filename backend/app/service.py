"""DB -> contract response assembly, with a per-database mtime cache.

All rounding happens here (1 dp MW/MWh, 2 dp GWh/percent).  Routes never compute.
GET paths read SQLite only and never call BMRS.
"""

from __future__ import annotations

import threading
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from . import bmrs, config, db
from .metrics import (
    Actual,
    Forecast,
    IncompleteDay,
    Issue,
    NoGateIssue,
    build_day_series,
    day_rank_percentile,
    decision_dates,
    delivery_date,
    energy_summary,
    error_metrics,
    error_percentiles,
    format_issue_time,
    gate_cutoff,
    group_issues,
    horizon_table,
    issue_time_table,
    scatter_rows,
    select_gate_issue,
    sp_to_hourly,
)

UTC = timezone.utc


# ---------------------------------------------------------------------------
# Domain exceptions
# ---------------------------------------------------------------------------


class DatabaseNotSeeded(Exception):
    """The SQLite file is missing, empty or has no datasets."""


class DecisionDateNotFound(Exception):
    """Decision date outside the analysis window, or with no evaluated data."""


class ForecastUnavailable(Exception):
    """No WINDFOR issues exist for the requested decision date."""


class SyncFailed(Exception):
    """BMRS fetch or validation failed; the database is unchanged."""


class SyncWriteError(Exception):
    """Unexpected failure while writing the sync transaction."""


# ---------------------------------------------------------------------------
# Static contract copy
# ---------------------------------------------------------------------------

SOURCES = [
    {
        "dataset": "FUELHH",
        "description": "GB half-hourly generation outturn by fuel type; fuelType=WIND only.",
        "url": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream",
    },
    {
        "dataset": "WINDFOR",
        "description": "GB wind generation forecast; queried by publication time with hourly target points.",
        "url": "https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream",
    },
]

DEFINITIONS = {
    "error": (
        "error_mw = forecast_mw - actual_mw. Positive = forecast too high (over-forecast) "
        "= shortfall risk; negative = under-forecast."
    ),
    "mae": "Mean of |error_mw| over evaluated hours.",
    "rmse": "Square root of the mean of error_mw squared.",
    "bias": "Mean of error_mw. Positive = forecasts ran above actual wind on average.",
    "mape": "Mean of |error_mw| / actual_mw * 100, over hours with actual_mw >= 500 only.",
    "percentiles": (
        "Empirical quantiles of error_mw with linear interpolation. p05 is the "
        "under-forecast tail; p95 is the over-forecast tail used for procurement margin."
    ),
    "hourly_alignment": (
        "actual_mw(h) = mean of the two FUELHH settlement periods starting h:00 and h:30; "
        "forecast_mw(h) is the hourly WINDFOR value at h:00."
    ),
    "energy": (
        "forecast_total_mwh = sum of 24 hourly forecast MW; actual_total_mwh = sum of 48 "
        "half-hourly MW x 0.5 h. 1 GWh = 1000 MWh."
    ),
    "horizon": "horizon_hours = target_time - publish_time, bucketed [0,6), [6,12) ... [42,48).",
    "gate_closure": (
        "For delivery day D, gate closes at D-1 09:50 UTC. Since decision_date = D-1, the "
        "cutoff is decision_date 09:50Z, selecting the 09:30Z issue."
    ),
    "shortfall": (
        "A delivery hour is in shortfall when error_mw > 0 (actual wind below the forecast "
        "bought against)."
    ),
}

ASSUMPTIONS = [
    (
        "Purchase decisions are dated 2026-01-01..2026-01-31; each covers delivery on the "
        "following day (2026-01-02..2026-02-01)."
    ),
    (
        "Only national wind is analysed: FUELHH fuelType=WIND actuals and WINDFOR forecasts. "
        "No demand, prices, or other fuels."
    ),
    (
        "WINDFOR generation for an hourly startTime is treated as the hourly mean comparable "
        "to the mean of the two FUELHH half-hours."
    ),
    (
        "The gate-closure vintage is the latest issue published at or before 09:50 UTC on the "
        "decision date; for this window that is always the 09:30 issue."
    ),
    (
        "The WINDFOR and FUELHH populations may differ in metering scope; the observed ~1.15x "
        "level gap may partly reflect scope or curtailment, not forecast skill."
    ),
    (
        "Percentile bands are historical empirical distributions from January 2026, not a "
        "probabilistic forecast product."
    ),
    (
        "BMRS rate limits apply; GET endpoints read only the seeded SQLite database and never "
        "call BMRS."
    ),
]

GATE_RULE = (
    "gate_closure_issue = latest WINDFOR issue with publish_time <= decision_date T09:50:00Z"
)


# ---------------------------------------------------------------------------
# Rounding helpers
# ---------------------------------------------------------------------------


def _r1(value: float | None) -> float | None:
    if value is None:
        return None
    rounded = round(float(value) + 0.0, 1)
    return 0.0 if rounded == 0 else rounded


def _r2(value: float | None) -> float | None:
    if value is None:
        return None
    rounded = round(float(value) + 0.0, 2)
    return 0.0 if rounded == 0 else rounded


def _lead_minutes(label: str) -> int:
    hour, minute = (int(part) for part in label.split(":"))
    cutoff = config.GATE_CLOSURE_UTC.hour * 60 + config.GATE_CLOSURE_UTC.minute
    return cutoff - (hour * 60 + minute)


# ---------------------------------------------------------------------------
# Bundle
# ---------------------------------------------------------------------------


@dataclass
class DayBundle:
    decision_date: date
    delivery_date: date
    issue: Issue
    series: list[dict]
    metrics: dict
    percentiles: dict
    energy: dict


@dataclass
class Bundle:
    db_path: Path
    actual_rows: int
    forecast_rows: int
    issue_count: int
    points_per_issue: int
    issues_per_day: int
    hours_evaluated: int
    days: dict[date, DayBundle]
    issues_by_date: dict[date, list[Issue]]
    window_metrics: dict
    window_percentiles: dict
    by_hour: list[dict]
    by_horizon: list[dict]
    by_issue_time: list[dict]
    scatter: list[dict]
    mean_forecast_mw: float
    mean_actual_mw: float
    hours_in_shortfall: int
    first_actual_start: datetime
    last_actual_start: datetime
    first_forecast_publish: datetime
    last_forecast_publish: datetime
    last_sync_at: datetime
    last_sync_status: str
    gate_issue_times: dict[date, str] = field(default_factory=dict)


_CACHE: dict[str, tuple[int, Bundle]] = {}
_LOCK = threading.Lock()


def _cache_version(path: Path) -> int:
    """Monotonic-ish version for the DB, including the WAL file.

    SQLite in WAL mode writes commits to ``portal.db-wal`` and may leave the main
    file's mtime untouched, so both stamps participate.
    """
    version = path.stat().st_mtime_ns
    wal = path.with_name(path.name + "-wal")
    try:
        if wal.exists():
            version = max(version, wal.stat().st_mtime_ns)
    except OSError:  # pragma: no cover - transient unlink race
        pass
    return version


def _resolve_path(db_path: Path | str | None) -> Path:
    return Path(db_path) if db_path is not None else config.db_path()


def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()


def get_bundle(db_path: Path | str | None = None) -> Bundle:
    path = _resolve_path(db_path)
    if not path.exists():
        raise DatabaseNotSeeded(
            f"Database {path} does not exist. Run `python scripts/fetch_data.py` to seed it."
        )
    try:
        version = _cache_version(path)
    except FileNotFoundError as exc:
        raise DatabaseNotSeeded(str(exc)) from exc

    key = str(path.resolve())
    with _LOCK:
        cached = _CACHE.get(key)
        if cached is not None and cached[0] == version:
            return cached[1]

    bundle = _build_bundle(path)
    with _LOCK:
        _CACHE[key] = (version, bundle)
    return bundle


def _build_bundle(path: Path) -> Bundle:
    connection = db.connect(path)
    try:
        if not db.table_exists(connection, "actuals") or not db.table_exists(
            connection, "forecasts"
        ):
            raise DatabaseNotSeeded("Database schema is missing. Re-run scripts/fetch_data.py.")
        counts = db.row_counts(connection)
        if counts["actuals"] == 0 or counts["forecasts"] == 0:
            raise DatabaseNotSeeded("Database is empty. Re-run scripts/fetch_data.py.")
        actuals: list[Actual] = db.load_actuals(connection)
        forecasts: list[Forecast] = db.load_forecasts(connection)
        meta = db.read_meta(connection)
    finally:
        connection.close()

    hourly_actuals = sp_to_hourly(actuals)
    issues = group_issues(forecasts)
    issues_by_date: dict[date, list[Issue]] = defaultdict(list)
    for publish, issue in issues.items():
        issues_by_date[publish.date()].append(issue)

    days: dict[date, DayBundle] = {}
    for decision in decision_dates():
        delivery = delivery_date(decision)
        if delivery not in hourly_actuals:
            raise DatabaseNotSeeded(
                f"No FUELHH actuals for delivery day {delivery.isoformat()} "
                "(database incomplete; re-seed)."
            )
        try:
            issue = select_gate_issue(forecasts, decision)
            series = build_day_series(issue, hourly_actuals[delivery], delivery)
        except (NoGateIssue, IncompleteDay) as exc:
            raise DatabaseNotSeeded(
                f"Decision date {decision.isoformat()} is not evaluable: {exc}"
            ) from exc
        errors = [row["error_mw"] for row in series]
        actual_values = [row["actual_mw"] for row in series]
        days[decision] = DayBundle(
            decision_date=decision,
            delivery_date=delivery,
            issue=issue,
            series=series,
            metrics=error_metrics(errors, actual_values),
            percentiles=error_percentiles(errors),
            energy=energy_summary(series),
        )

    all_series = [day.series for day in days.values()]
    all_errors = [row["error_mw"] for series in all_series for row in series]
    all_actuals = [row["actual_mw"] for series in all_series for row in series]
    all_forecasts = [row["forecast_mw"] for series in all_series for row in series]

    by_hour: list[dict] = []
    for hour in range(24):
        hour_errors = [day.series[hour]["error_mw"] for day in days.values()]
        hour_metrics = error_metrics(hour_errors)
        hour_percentiles = error_percentiles(hour_errors)
        by_hour.append(
            {
                "hour_of_day": hour,
                "count": len(hour_errors),
                "mae_mw": hour_metrics["mae_mw"],
                "bias_mw": hour_metrics["bias_mw"],
                "p05_mw": hour_percentiles["p05_mw"],
                "p50_mw": hour_percentiles["p50_mw"],
                "p95_mw": hour_percentiles["p95_mw"],
            }
        )

    point_counts = Counter(len(issue.points) for issue in issues.values())
    issue_counts_per_day = Counter(len(value) for value in issues_by_date.values())
    gate_issue_times = {
        decision: format_issue_time(day.issue.publish_time) for decision, day in days.items()
    }

    last_sync_at = _parse_meta_datetime(meta.get("last_sync_at"), path)
    return Bundle(
        db_path=path,
        actual_rows=counts["actuals"],
        forecast_rows=counts["forecasts"],
        issue_count=counts["issues"],
        points_per_issue=point_counts.most_common(1)[0][0] if point_counts else 0,
        issues_per_day=issue_counts_per_day.most_common(1)[0][0] if issue_counts_per_day else 0,
        hours_evaluated=len(all_errors),
        days=days,
        issues_by_date=dict(issues_by_date),
        window_metrics=error_metrics(all_errors, all_actuals),
        window_percentiles=error_percentiles(all_errors),
        by_hour=by_hour,
        by_horizon=horizon_table(forecasts, hourly_actuals),
        by_issue_time=issue_time_table(forecasts, hourly_actuals),
        scatter=scatter_rows({decision: day.series for decision, day in days.items()}),
        mean_forecast_mw=sum(all_forecasts) / len(all_forecasts),
        mean_actual_mw=sum(all_actuals) / len(all_actuals),
        hours_in_shortfall=sum(1 for error in all_errors if error > 0),
        first_actual_start=min(row.start_time for row in actuals),
        last_actual_start=max(row.start_time for row in actuals),
        first_forecast_publish=min(row.publish_time for row in forecasts),
        last_forecast_publish=max(row.publish_time for row in forecasts),
        last_sync_at=last_sync_at,
        last_sync_status=meta.get("last_sync_status", "ok"),
        gate_issue_times=gate_issue_times,
    )


def _parse_meta_datetime(value: str | None, path: Path) -> datetime:
    if value:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(UTC)
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)


# ---------------------------------------------------------------------------
# Meta
# ---------------------------------------------------------------------------


def get_meta(db_path: Path | str | None = None) -> dict:
    bundle = get_bundle(db_path)
    decision_days = len(bundle.days)
    delivery_hours = decision_days * 24
    issue_labels = Counter(bundle.gate_issue_times.values())
    issue_label = issue_labels.most_common(1)[0][0] if issue_labels else "09:30"

    return {
        "contract_version": config.CONTRACT_VERSION,
        "product": config.PRODUCT_NAME,
        "generated_at": datetime.now(UTC),
        "window": {
            "decision_date_from": config.DECISION_START,
            "decision_date_to": config.DECISION_END,
            "delivery_date_from": config.DELIVERY_START,
            "delivery_date_to": config.DELIVERY_END,
            "decision_days": decision_days,
            "delivery_hours": delivery_hours,
            "timezone": config.TIMEZONE,
        },
        "gate_closure": {
            "cutoff_time_utc": config.GATE_CLOSURE_UTC.strftime("%H:%M"),
            "timezone": config.TIMEZONE_LABEL,
            "timezone_note": "January is GMT; UTC == local time for the whole window.",
            "rule": GATE_RULE,
            "expected_issue_time_utc": issue_label,
            "lead_minutes": _lead_minutes(issue_label),
        },
        "counts": {
            "actual_rows": bundle.actual_rows,
            "forecast_rows": bundle.forecast_rows,
            "forecast_issues": bundle.issue_count,
            "points_per_issue": bundle.points_per_issue,
            "issues_per_day": bundle.issues_per_day,
            "decision_days": decision_days,
            "delivery_hours": delivery_hours,
            "hours_evaluated": bundle.hours_evaluated,
        },
        "data_vintage": {
            "actuals_first_start_utc": bundle.first_actual_start,
            "actuals_last_start_utc": bundle.last_actual_start,
            "forecasts_first_publish_utc": bundle.first_forecast_publish,
            "forecasts_last_publish_utc": bundle.last_forecast_publish,
            "last_sync_at": bundle.last_sync_at,
            "last_sync_status": bundle.last_sync_status,
        },
        "sources": SOURCES,
        "definitions": DEFINITIONS,
        "assumptions": ASSUMPTIONS,
    }


# ---------------------------------------------------------------------------
# Days
# ---------------------------------------------------------------------------


def _not_found_message(decision: date) -> str:
    if decision < config.DECISION_START or decision > config.DECISION_END:
        return (
            f"Decision date {decision.isoformat()} is outside the analysis window "
            f"{config.DECISION_START.isoformat()}..{config.DECISION_END.isoformat()}"
        )
    return f"Decision date {decision.isoformat()} has no evaluated data"


def get_days(db_path: Path | str | None = None) -> dict:
    bundle = get_bundle(db_path)
    rows = []
    for decision in sorted(bundle.days):
        day = bundle.days[decision]
        energy = day.energy
        rows.append(
            {
                "decision_date": decision,
                "delivery_date": day.delivery_date,
                "gate_closure_publish_time": day.issue.publish_time,
                "gate_closure_issue_time_utc": bundle.gate_issue_times[decision],
                "hours_evaluated": len(day.series),
                "is_complete": len(day.series) == 24,
                "mae_mw": _r1(day.metrics["mae_mw"]),
                "rmse_mw": _r1(day.metrics["rmse_mw"]),
                "bias_mw": _r1(day.metrics["bias_mw"]),
                "forecast_total_mwh": _r1(energy["forecast_total_mwh"]),
                "actual_total_mwh": _r1(energy["actual_total_mwh"]),
                "max_shortfall_mw": _r1(energy["max_shortfall_mw"]),
                "max_shortfall_hour_utc": energy["max_shortfall_hour_utc"],
            }
        )
    return {
        "count": len(rows),
        "decision_date_from": config.DECISION_START,
        "decision_date_to": config.DECISION_END,
        "days": rows,
    }


def get_day(decision: date, db_path: Path | str | None = None) -> dict:
    bundle = get_bundle(db_path)
    day = bundle.days.get(decision)
    if day is None:
        raise DecisionDateNotFound(_not_found_message(decision))

    daily_maes = [item.metrics["mae_mw"] for item in bundle.days.values()]
    daily_biases = [item.metrics["bias_mw"] for item in bundle.days.values()]

    energy = day.energy
    metrics = day.metrics
    percentiles = day.percentiles
    return {
        "decision_date": decision,
        "delivery_date": day.delivery_date,
        "gate_closure_cutoff_utc": gate_cutoff(decision),
        "gate_closure_publish_time": day.issue.publish_time,
        "gate_closure_issue_time_utc": bundle.gate_issue_times[decision],
        "gate_closure_lead_minutes": _lead_minutes(bundle.gate_issue_times[decision]),
        "hours_evaluated": len(day.series),
        "is_complete": len(day.series) == 24,
        "series": [
            {
                "hour_utc": row["hour_utc"],
                "hour_of_day": row["hour_of_day"],
                "forecast_mw": _r1(row["forecast_mw"]),
                "actual_mw": _r1(row["actual_mw"]),
                "error_mw": _r1(row["error_mw"]),
            }
            for row in day.series
        ],
        "summary": {
            "forecast_total_mwh": _r1(energy["forecast_total_mwh"]),
            "actual_total_mwh": _r1(energy["actual_total_mwh"]),
            "forecast_avg_mw": _r1(energy["forecast_avg_mw"]),
            "forecast_peak_mw": _r1(energy["forecast_peak_mw"]),
            "forecast_min_mw": _r1(energy["forecast_min_mw"]),
            "forecast_peak_hour_utc": energy["forecast_peak_hour_utc"],
            "forecast_min_hour_utc": energy["forecast_min_hour_utc"],
            "actual_avg_mw": _r1(energy["actual_avg_mw"]),
            "actual_peak_mw": _r1(energy["actual_peak_mw"]),
            "actual_min_mw": _r1(energy["actual_min_mw"]),
            "actual_peak_hour_utc": energy["actual_peak_hour_utc"],
            "actual_min_hour_utc": energy["actual_min_hour_utc"],
        },
        "metrics": {
            "count": metrics["count"],
            "mae_mw": _r1(metrics["mae_mw"]),
            "rmse_mw": _r1(metrics["rmse_mw"]),
            "bias_mw": _r1(metrics["bias_mw"]),
            "mape_pct": _r2(metrics["mape_pct"]),
            "mape_hours": metrics["mape_hours"],
        },
        "percentiles": {
            "p05_mw": _r1(percentiles["p05_mw"]),
            "p50_mw": _r1(percentiles["p50_mw"]),
            "p95_mw": _r1(percentiles["p95_mw"]),
        },
        "extremes": {
            "max_shortfall_mw": _r1(energy["max_shortfall_mw"]),
            "max_shortfall_hour_utc": energy["max_shortfall_hour_utc"],
            "max_overdelivery_mw": _r1(energy["max_overdelivery_mw"]),
            "max_overdelivery_hour_utc": energy["max_overdelivery_hour_utc"],
        },
        "window_context": {
            "window_mae_mw": _r1(bundle.window_metrics["mae_mw"]),
            "window_bias_mw": _r1(bundle.window_metrics["bias_mw"]),
            "day_mae_percentile": day_rank_percentile(metrics["mae_mw"], daily_maes),
            "day_bias_percentile": day_rank_percentile(metrics["bias_mw"], daily_biases),
        },
    }


# ---------------------------------------------------------------------------
# Forecast vintages
# ---------------------------------------------------------------------------


def get_forecast(decision: date, db_path: Path | str | None = None) -> dict:
    bundle = get_bundle(db_path)
    day = bundle.days.get(decision)
    if day is None:
        raise DecisionDateNotFound(_not_found_message(decision))

    issues = sorted(bundle.issues_by_date.get(decision, []), key=lambda item: item.publish_time)
    if not issues:
        raise ForecastUnavailable(
            f"No WINDFOR issues were published on {decision.isoformat()}"
        )

    cutoff = gate_cutoff(decision)
    gate_publish = day.issue.publish_time
    payload_issues = []
    for issue in issues:
        points = [
            {
                "target_time": point.start_time,
                "horizon_hours": _r1(
                    (point.start_time - issue.publish_time).total_seconds() / 3600.0
                ),
                "generation_mw": _r1(point.generation_mw),
            }
            for point in issue.points
        ]
        payload_issues.append(
            {
                "publish_time": issue.publish_time,
                "issue_time_utc": format_issue_time(issue.publish_time),
                "is_gate_closure": issue.publish_time == gate_publish,
                "is_usable_at_gate_closure": issue.publish_time <= cutoff,
                "point_count": len(points),
                "points": points,
            }
        )

    return {
        "decision_date": decision,
        "delivery_date": day.delivery_date,
        "gate_closure_cutoff_utc": cutoff,
        "gate_closure_publish_time": gate_publish,
        "gate_closure_issue_time_utc": bundle.gate_issue_times[decision],
        "issue_count": len(payload_issues),
        "issues": payload_issues,
    }


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------


def get_summary(db_path: Path | str | None = None) -> dict:
    bundle = get_bundle(db_path)
    metrics = bundle.window_metrics
    percentiles = bundle.window_percentiles
    count = metrics["count"]

    day_rows = []
    for decision in sorted(bundle.days):
        day = bundle.days[decision]
        day_rows.append(
            {
                "decision_date": decision,
                "delivery_date": day.delivery_date,
                "mae_mw": _r1(day.metrics["mae_mw"]),
                "rmse_mw": _r1(day.metrics["rmse_mw"]),
                "bias_mw": _r1(day.metrics["bias_mw"]),
                "hours_evaluated": len(day.series),
            }
        )

    worst = max(bundle.days.values(), key=lambda item: item.metrics["mae_mw"])
    best = min(bundle.days.values(), key=lambda item: item.metrics["mae_mw"])

    forecast_total = sum(day.energy["forecast_total_mwh"] for day in bundle.days.values())
    actual_total = sum(day.energy["actual_total_mwh"] for day in bundle.days.values())

    return {
        "window": {
            "decision_date_from": config.DECISION_START,
            "decision_date_to": config.DECISION_END,
            "delivery_date_from": config.DELIVERY_START,
            "delivery_date_to": config.DELIVERY_END,
            "decision_days": len(bundle.days),
            "delivery_hours": len(bundle.days) * 24,
            "timezone": config.TIMEZONE,
            "hours_evaluated": count,
        },
        "overall": {
            "count": count,
            "mae_mw": _r1(metrics["mae_mw"]),
            "rmse_mw": _r1(metrics["rmse_mw"]),
            "bias_mw": _r1(metrics["bias_mw"]),
            "mape_pct": _r2(metrics["mape_pct"]),
            "mape_hours": metrics["mape_hours"],
            "mean_forecast_mw": _r1(bundle.mean_forecast_mw),
            "mean_actual_mw": _r1(bundle.mean_actual_mw),
            "mae_pct_of_mean_actual": _r2(100.0 * metrics["mae_mw"] / bundle.mean_actual_mw),
            "hours_in_shortfall": bundle.hours_in_shortfall,
            "hours_in_shortfall_pct": _r2(100.0 * bundle.hours_in_shortfall / count),
            "p05_mw": _r1(percentiles["p05_mw"]),
            "p50_mw": _r1(percentiles["p50_mw"]),
            "p95_mw": _r1(percentiles["p95_mw"]),
            "worst_day": {
                "decision_date": worst.decision_date,
                "mae_mw": _r1(worst.metrics["mae_mw"]),
            },
            "best_day": {
                "decision_date": best.decision_date,
                "mae_mw": _r1(best.metrics["mae_mw"]),
            },
        },
        "energy": {
            "forecast_total_mwh": _r1(forecast_total),
            "actual_total_mwh": _r1(actual_total),
            "forecast_total_gwh": _r2(forecast_total / 1000.0),
            "actual_total_gwh": _r2(actual_total / 1000.0),
            "difference_mwh": _r1(forecast_total - actual_total),
            "forecast_vs_actual_pct": _r2(
                100.0 * (forecast_total - actual_total) / actual_total
            ),
        },
        "by_day": day_rows,
        "by_hour": [
            {
                "hour_of_day": row["hour_of_day"],
                "count": row["count"],
                "mae_mw": _r1(row["mae_mw"]),
                "bias_mw": _r1(row["bias_mw"]),
                "p05_mw": _r1(row["p05_mw"]),
                "p50_mw": _r1(row["p50_mw"]),
                "p95_mw": _r1(row["p95_mw"]),
            }
            for row in bundle.by_hour
        ],
        "by_horizon": [
            {
                "horizon_start_h": row["horizon_start_h"],
                "horizon_end_h": row["horizon_end_h"],
                "count": row["count"],
                "mae_mw": _r1(row["mae_mw"]),
                "rmse_mw": _r1(row["rmse_mw"]),
                "bias_mw": _r1(row["bias_mw"]),
            }
            for row in bundle.by_horizon
        ],
        "by_issue_time": [
            {
                "issue_time_utc": row["issue_time_utc"],
                "minutes_before_gate": row["minutes_before_gate"],
                "count": row["count"],
                "mae_mw": _r1(row["mae_mw"]),
                "rmse_mw": _r1(row["rmse_mw"]),
                "bias_mw": _r1(row["bias_mw"]),
            }
            for row in bundle.by_issue_time
        ],
        "scatter": [
            {
                "delivery_hour_utc": row["delivery_hour_utc"],
                "decision_date": row["decision_date"],
                "forecast_mw": _r1(row["forecast_mw"]),
                "actual_mw": _r1(row["actual_mw"]),
                "error_mw": _r1(row["error_mw"]),
            }
            for row in bundle.scatter
        ],
    }


# ---------------------------------------------------------------------------
# Admin sync
# ---------------------------------------------------------------------------


def database_label(db_path: Path | str | None = None) -> str:
    path = _resolve_path(db_path)
    try:
        return str(path.resolve().relative_to(config.REPO_ROOT))
    except ValueError:
        return str(path)


def sync_from_bmrs(db_path: Path | str | None = None) -> dict:
    """Fetch, validate and atomically replace the dataset.

    Raises ``SyncFailed`` for BMRS/validation problems (DB untouched) and
    ``SyncWriteError`` for unexpected local failures.
    """
    path = _resolve_path(db_path)
    started_at = datetime.now(UTC)

    try:
        actual_rows = bmrs.fetch_fuelhh()
        forecast_rows = bmrs.fetch_windfor()
    except bmrs.BmrsTransportError as exc:
        raise SyncFailed(str(exc)) from exc

    try:
        bmrs.validate_actuals(actual_rows)
        forecast_report = bmrs.validate_forecasts(forecast_rows)
    except bmrs.IngestValidationError as exc:
        raise SyncFailed(str(exc)) from exc

    synced_at = datetime.now(UTC)
    try:
        connection = db.connect(path)
        try:
            db.ensure_schema(connection)
            counts = db.replace_all(
                connection,
                actual_rows,
                forecast_rows,
                synced_at=synced_at,
                actual_start=config.ACTUALS_START,
                actual_end=config.ACTUALS_END,
                forecast_start=config.FORECAST_PUBLISH_START,
                forecast_end=config.FORECAST_PUBLISH_END,
            )
        finally:
            connection.close()
    except Exception as exc:  # pragma: no cover - operational failure path
        raise SyncWriteError(str(exc)) from exc

    finished_at = datetime.now(UTC)
    return {
        "status": "ok",
        "started_at": started_at,
        "finished_at": finished_at,
        "duration_ms": int((finished_at - started_at).total_seconds() * 1000),
        "rows": {"actuals": counts["actuals"], "forecasts": counts["forecasts"]},
        "issues": counts["issues"],
        "decision_days": forecast_report.decision_days,
        "validation": {
            "actuals_rows_ok": counts["actuals"] == config.EXPECTED_ACTUAL_ROWS,
            "forecast_rows_ok": counts["forecasts"] == config.EXPECTED_FORECAST_ROWS,
            "issues_ok": counts["issues"] == config.EXPECTED_FORECAST_ISSUES,
            "gate_closure_days_covered": forecast_report.gate_days_covered,
            "gate_closure_hours_covered": forecast_report.gate_hours_covered,
        },
        "database": database_label(path),
        "last_sync_at": synced_at,
    }
