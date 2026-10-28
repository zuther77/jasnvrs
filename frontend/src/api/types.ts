/**
 * Types mirror docs/orchestration/API_CONTRACT.md 1:1.
 * Do not rename, re-type or re-sign a field here without a contract change.
 */

export type IsoDate = string
export type IsoTimestamp = string
/** `HH:MM` UTC clock time, e.g. `09:30`. */
export type UtcClock = string

export interface MetaWindow {
  decision_date_from: IsoDate
  decision_date_to: IsoDate
  delivery_date_from: IsoDate
  delivery_date_to: IsoDate
  decision_days: number
  delivery_hours: number
  timezone: string
}

export interface GateClosureMeta {
  cutoff_time_utc: UtcClock
  timezone: string
  timezone_note: string
  rule: string
  expected_issue_time_utc: UtcClock
  lead_minutes: number
}

export interface MetaCounts {
  actual_rows: number
  forecast_rows: number
  forecast_issues: number
  points_per_issue: number
  issues_per_day: number
  decision_days: number
  delivery_hours: number
  hours_evaluated: number
}

export interface DataVintage {
  actuals_first_start_utc: IsoTimestamp
  actuals_last_start_utc: IsoTimestamp
  forecasts_first_publish_utc: IsoTimestamp
  forecasts_last_publish_utc: IsoTimestamp
  last_sync_at: IsoTimestamp
  last_sync_status: string
}

export interface Source {
  dataset: string
  description: string
  url: string
}

export interface MetaResponse {
  contract_version: string
  product: string
  generated_at: IsoTimestamp
  window: MetaWindow
  gate_closure: GateClosureMeta
  counts: MetaCounts
  data_vintage: DataVintage
  sources: Source[]
  definitions: Record<string, string>
  assumptions: string[]
}

export interface DaySummary {
  decision_date: IsoDate
  delivery_date: IsoDate
  gate_closure_publish_time: IsoTimestamp
  gate_closure_issue_time_utc: UtcClock
  hours_evaluated: number
  is_complete: boolean
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  forecast_total_mwh: number
  actual_total_mwh: number
  max_shortfall_mw: number
  max_shortfall_hour_utc: IsoTimestamp | null
}

export interface DaysResponse {
  count: number
  decision_date_from: IsoDate
  decision_date_to: IsoDate
  days: DaySummary[]
}

export interface DaySeriesPoint {
  hour_utc: IsoTimestamp
  hour_of_day: number
  forecast_mw: number
  actual_mw: number
  error_mw: number
}

export interface DaySummaryTotals {
  forecast_total_mwh: number
  actual_total_mwh: number
  forecast_avg_mw: number
  forecast_peak_mw: number
  forecast_min_mw: number
  forecast_peak_hour_utc: IsoTimestamp
  forecast_min_hour_utc: IsoTimestamp
  actual_avg_mw: number
  actual_peak_mw: number
  actual_min_mw: number
  actual_peak_hour_utc: IsoTimestamp
  actual_min_hour_utc: IsoTimestamp
}

export interface DayMetrics {
  count: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  mape_pct: number | null
  mape_hours: number
}

export interface DayPercentiles {
  p05_mw: number
  p50_mw: number
  p95_mw: number
}

export interface DayExtremes {
  max_shortfall_mw: number
  max_shortfall_hour_utc: IsoTimestamp | null
  max_overdelivery_mw: number
  max_overdelivery_hour_utc: IsoTimestamp | null
}

export interface DayWindowContext {
  window_mae_mw: number
  window_bias_mw: number
  day_mae_percentile: number
  day_bias_percentile: number
}

export interface DayResponse {
  decision_date: IsoDate
  delivery_date: IsoDate
  gate_closure_cutoff_utc: IsoTimestamp
  gate_closure_publish_time: IsoTimestamp
  gate_closure_issue_time_utc: UtcClock
  gate_closure_lead_minutes: number
  hours_evaluated: number
  is_complete: boolean
  series: DaySeriesPoint[]
  summary: DaySummaryTotals
  metrics: DayMetrics
  percentiles: DayPercentiles
  extremes: DayExtremes
  window_context: DayWindowContext
}

export interface ForecastPoint {
  target_time: IsoTimestamp
  horizon_hours: number
  generation_mw: number
}

export interface ForecastIssue {
  publish_time: IsoTimestamp
  issue_time_utc: UtcClock
  is_gate_closure: boolean
  is_usable_at_gate_closure: boolean
  point_count: number
  points: ForecastPoint[]
}

export interface ForecastResponse {
  decision_date: IsoDate
  delivery_date: IsoDate
  gate_closure_cutoff_utc: IsoTimestamp
  gate_closure_publish_time: IsoTimestamp
  gate_closure_issue_time_utc: UtcClock
  issue_count: number
  issues: ForecastIssue[]
}

export interface SummaryWindow extends MetaWindow {
  hours_evaluated: number
}

export interface DayExtremeRef {
  decision_date: IsoDate
  mae_mw: number
}

export interface OverallSummary {
  count: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  mape_pct: number
  mape_hours: number
  mean_forecast_mw: number
  mean_actual_mw: number
  mae_pct_of_mean_actual: number
  hours_in_shortfall: number
  hours_in_shortfall_pct: number
  p05_mw: number
  p50_mw: number
  p95_mw: number
  worst_day: DayExtremeRef
  best_day: DayExtremeRef
}

export interface SummaryEnergy {
  forecast_total_mwh: number
  actual_total_mwh: number
  forecast_total_gwh: number
  actual_total_gwh: number
  difference_mwh: number
  forecast_vs_actual_pct: number
}

export interface ByDayRow {
  decision_date: IsoDate
  delivery_date: IsoDate
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  hours_evaluated: number
}

export interface ByHourRow {
  hour_of_day: number
  count: number
  mae_mw: number
  bias_mw: number
  p05_mw: number
  p50_mw: number
  p95_mw: number
}

export interface ByHorizonRow {
  horizon_start_h: number
  horizon_end_h: number
  count: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
}

export interface ByIssueTimeRow {
  issue_time_utc: UtcClock
  minutes_before_gate: number
  count: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
}

export interface ScatterRow {
  delivery_hour_utc: IsoTimestamp
  decision_date: IsoDate
  forecast_mw: number
  actual_mw: number
  error_mw: number
}

export interface SummaryResponse {
  window: SummaryWindow
  overall: OverallSummary
  energy: SummaryEnergy
  by_day: ByDayRow[]
  by_hour: ByHourRow[]
  by_horizon: ByHorizonRow[]
  by_issue_time: ByIssueTimeRow[]
  scatter: ScatterRow[]
}

export interface ValidationDetail {
  type: string
  loc: Array<string | number>
  msg: string
  input?: unknown
}

export interface ApiErrorBody {
  detail: string | ValidationDetail[]
}
