"""Pydantic response models — one-to-one with docs/orchestration/API_CONTRACT.md.

Field names, units and nullability are normative.  Timestamps serialize as ISO 8601
UTC with a ``Z`` suffix and second precision; dates as ``YYYY-MM-DD``.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Annotated

from pydantic import BaseModel, PlainSerializer, WithJsonSchema


def _serialize_utc(value: datetime) -> str:
    return value.astimezone(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


UtcDatetime = Annotated[
    datetime,
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
    WithJsonSchema(
        {
            "type": "string",
            "format": "date-time",
            "examples": ["2026-01-05T09:30:00Z"],
            "description": "ISO 8601 UTC with Z, second precision",
        }
    ),
]


class Window(BaseModel):
    decision_date_from: date
    decision_date_to: date
    delivery_date_from: date
    delivery_date_to: date
    decision_days: int
    delivery_hours: int
    timezone: str


class SummaryWindow(Window):
    hours_evaluated: int


class GateClosure(BaseModel):
    cutoff_time_utc: str
    timezone: str
    timezone_note: str
    rule: str
    expected_issue_time_utc: str
    lead_minutes: int


class Counts(BaseModel):
    actual_rows: int
    forecast_rows: int
    forecast_issues: int
    points_per_issue: int
    issues_per_day: int
    decision_days: int
    delivery_hours: int
    hours_evaluated: int


class DataVintage(BaseModel):
    actuals_first_start_utc: UtcDatetime
    actuals_last_start_utc: UtcDatetime
    forecasts_first_publish_utc: UtcDatetime
    forecasts_last_publish_utc: UtcDatetime
    last_sync_at: UtcDatetime
    last_sync_status: str


class Source(BaseModel):
    dataset: str
    description: str
    url: str


class MetaResponse(BaseModel):
    contract_version: str
    product: str
    generated_at: UtcDatetime
    window: Window
    gate_closure: GateClosure
    counts: Counts
    data_vintage: DataVintage
    sources: list[Source]
    definitions: dict[str, str]
    assumptions: list[str]


# ---------------------------------------------------------------------------
# /api/days
# ---------------------------------------------------------------------------


class DaySummary(BaseModel):
    decision_date: date
    delivery_date: date
    gate_closure_publish_time: UtcDatetime
    gate_closure_issue_time_utc: str
    hours_evaluated: int
    is_complete: bool
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    forecast_total_mwh: float
    actual_total_mwh: float
    max_shortfall_mw: float
    max_shortfall_hour_utc: UtcDatetime | None


class DaysResponse(BaseModel):
    count: int
    decision_date_from: date
    decision_date_to: date
    days: list[DaySummary]


# ---------------------------------------------------------------------------
# /api/days/{decision_date}
# ---------------------------------------------------------------------------


class SeriesPoint(BaseModel):
    hour_utc: UtcDatetime
    hour_of_day: int
    forecast_mw: float
    actual_mw: float
    error_mw: float


class EnergyBlock(BaseModel):
    forecast_total_mwh: float
    actual_total_mwh: float
    forecast_avg_mw: float
    forecast_peak_mw: float
    forecast_min_mw: float
    forecast_peak_hour_utc: UtcDatetime
    forecast_min_hour_utc: UtcDatetime
    actual_avg_mw: float
    actual_peak_mw: float
    actual_min_mw: float
    actual_peak_hour_utc: UtcDatetime
    actual_min_hour_utc: UtcDatetime


class MetricsBlock(BaseModel):
    count: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    mape_pct: float | None
    mape_hours: int


class Percentiles(BaseModel):
    p05_mw: float
    p50_mw: float
    p95_mw: float


class Extremes(BaseModel):
    max_shortfall_mw: float
    max_shortfall_hour_utc: UtcDatetime | None
    max_overdelivery_mw: float
    max_overdelivery_hour_utc: UtcDatetime | None


class WindowContext(BaseModel):
    window_mae_mw: float
    window_bias_mw: float
    day_mae_percentile: float
    day_bias_percentile: float


class DayResponse(BaseModel):
    decision_date: date
    delivery_date: date
    gate_closure_cutoff_utc: UtcDatetime
    gate_closure_publish_time: UtcDatetime
    gate_closure_issue_time_utc: str
    gate_closure_lead_minutes: int
    hours_evaluated: int
    is_complete: bool
    series: list[SeriesPoint]
    summary: EnergyBlock
    metrics: MetricsBlock
    percentiles: Percentiles
    extremes: Extremes
    window_context: WindowContext


# ---------------------------------------------------------------------------
# /api/forecast/{decision_date}
# ---------------------------------------------------------------------------


class ForecastPoint(BaseModel):
    target_time: UtcDatetime
    horizon_hours: float
    generation_mw: float


class ForecastIssue(BaseModel):
    publish_time: UtcDatetime
    issue_time_utc: str
    is_gate_closure: bool
    is_usable_at_gate_closure: bool
    point_count: int
    points: list[ForecastPoint]


class ForecastResponse(BaseModel):
    decision_date: date
    delivery_date: date
    gate_closure_cutoff_utc: UtcDatetime
    gate_closure_publish_time: UtcDatetime
    gate_closure_issue_time_utc: str
    issue_count: int
    issues: list[ForecastIssue]


# ---------------------------------------------------------------------------
# /api/summary
# ---------------------------------------------------------------------------


class DayRef(BaseModel):
    decision_date: date
    mae_mw: float


class Overall(BaseModel):
    count: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    mape_pct: float
    mape_hours: int
    mean_forecast_mw: float
    mean_actual_mw: float
    mae_pct_of_mean_actual: float
    hours_in_shortfall: int
    hours_in_shortfall_pct: float
    p05_mw: float
    p50_mw: float
    p95_mw: float
    worst_day: DayRef
    best_day: DayRef


class Energy(BaseModel):
    forecast_total_mwh: float
    actual_total_mwh: float
    forecast_total_gwh: float
    actual_total_gwh: float
    difference_mwh: float
    forecast_vs_actual_pct: float


class ByDayRow(BaseModel):
    decision_date: date
    delivery_date: date
    mae_mw: float
    rmse_mw: float
    bias_mw: float
    hours_evaluated: int


class ByHourRow(BaseModel):
    hour_of_day: int
    count: int
    mae_mw: float
    bias_mw: float
    p05_mw: float
    p50_mw: float
    p95_mw: float


class ByHorizonRow(BaseModel):
    horizon_start_h: int
    horizon_end_h: int
    count: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float


class ByIssueTimeRow(BaseModel):
    issue_time_utc: str
    minutes_before_gate: int
    count: int
    mae_mw: float
    rmse_mw: float
    bias_mw: float


class ScatterRow(BaseModel):
    delivery_hour_utc: UtcDatetime
    decision_date: date
    forecast_mw: float
    actual_mw: float
    error_mw: float


class SummaryResponse(BaseModel):
    window: SummaryWindow
    overall: Overall
    energy: Energy
    by_day: list[ByDayRow]
    by_hour: list[ByHourRow]
    by_horizon: list[ByHorizonRow]
    by_issue_time: list[ByIssueTimeRow]
    scatter: list[ScatterRow]


# ---------------------------------------------------------------------------
# /api/admin/sync
# ---------------------------------------------------------------------------


class SyncRows(BaseModel):
    actuals: int
    forecasts: int


class SyncValidation(BaseModel):
    actuals_rows_ok: bool
    forecast_rows_ok: bool
    issues_ok: bool
    gate_closure_days_covered: int
    gate_closure_hours_covered: int


class SyncResponse(BaseModel):
    status: str
    started_at: UtcDatetime
    finished_at: UtcDatetime
    duration_ms: int
    rows: SyncRows
    issues: int
    decision_days: int
    validation: SyncValidation
    database: str
    last_sync_at: UtcDatetime
