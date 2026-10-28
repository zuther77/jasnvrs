import { ApiError, ApiShapeError, fetchJson } from './client'
import type { FetchOptions } from './client'
import type {
  DayResponse,
  DaysResponse,
  ForecastResponse,
  MetaResponse,
  SummaryResponse,
} from './types'

/* ------------------------------------------------------------------ */
/* Runtime contract guards                                             */
/* ------------------------------------------------------------------ */

function shape(path: string, field: string, message: string): never {
  throw new ApiShapeError(path, field, message)
}

function record(value: unknown, path: string, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    shape(path, field, `Expected an object at ${field}`)
  }
  return value as Record<string, unknown>
}

function list(value: unknown, path: string, field: string): unknown[] {
  if (!Array.isArray(value)) shape(path, field, `Expected an array at ${field}`)
  return value
}

function nonEmptyList(value: unknown, path: string, field: string): unknown[] {
  const rows = list(value, path, field)
  if (rows.length === 0) shape(path, field, `Expected a non-empty array at ${field}`)
  return rows
}

function num(value: unknown, path: string, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    shape(path, field, `Expected a finite number at ${field}`)
  }
  return value
}

function int(value: unknown, path: string, field: string): number {
  const parsed = num(value, path, field)
  if (!Number.isInteger(parsed)) shape(path, field, `Expected an integer at ${field}`)
  return parsed
}

function str(value: unknown, path: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    shape(path, field, `Expected a non-empty string at ${field}`)
  }
  return value
}

function isoDate(value: unknown, path: string, field: string): string {
  const parsed = str(value, path, field)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    shape(path, field, `Expected a YYYY-MM-DD date at ${field}`)
  }
  return parsed
}

function bool(value: unknown, path: string, field: string): boolean {
  if (typeof value !== 'boolean') shape(path, field, `Expected a boolean at ${field}`)
  return value
}

function nullableStr(value: unknown, path: string, field: string): string | null {
  if (value === null) return null
  return str(value, path, field)
}

function numbers(
  row: Record<string, unknown>,
  fields: string[],
  path: string,
  prefix: string,
): void {
  for (const field of fields) num(row[field], path, `${prefix}.${field}`)
}

function percentileOrder(
  row: Record<string, unknown>,
  path: string,
  prefix: string,
): void {
  const p05 = num(row.p05_mw, path, `${prefix}.p05_mw`)
  const p50 = num(row.p50_mw, path, `${prefix}.p50_mw`)
  const p95 = num(row.p95_mw, path, `${prefix}.p95_mw`)
  if (!(p95 >= p50 && p50 >= p05)) {
    shape(
      path,
      `${prefix}.p95_mw`,
      `Percentile order violated at ${prefix}: expected p95 >= p50 >= p05`,
    )
  }
}

function countEquals(
  actualLength: number,
  declared: unknown,
  path: string,
  field: string,
  arrayField: string,
): void {
  const declaredCount = int(declared, path, field)
  if (declaredCount !== actualLength) {
    shape(
      path,
      field,
      `${field} (${declaredCount}) does not match ${arrayField}.length (${actualLength})`,
    )
  }
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

export async function getMeta(options: FetchOptions = {}): Promise<MetaResponse> {
  const path = '/api/meta'
  const body = await fetchJson<MetaResponse>('/meta', options)
  const root = record(body, path, 'body')

  str(root.contract_version, path, 'contract_version')
  str(root.product, path, 'product')
  str(root.generated_at, path, 'generated_at')

  const window = record(root.window, path, 'window')
  isoDate(window.decision_date_from, path, 'window.decision_date_from')
  isoDate(window.decision_date_to, path, 'window.decision_date_to')
  isoDate(window.delivery_date_from, path, 'window.delivery_date_from')
  isoDate(window.delivery_date_to, path, 'window.delivery_date_to')
  int(window.decision_days, path, 'window.decision_days')
  int(window.delivery_hours, path, 'window.delivery_hours')
  str(window.timezone, path, 'window.timezone')

  const gate = record(root.gate_closure, path, 'gate_closure')
  str(gate.cutoff_time_utc, path, 'gate_closure.cutoff_time_utc')
  str(gate.timezone, path, 'gate_closure.timezone')
  str(gate.timezone_note, path, 'gate_closure.timezone_note')
  str(gate.rule, path, 'gate_closure.rule')
  str(gate.expected_issue_time_utc, path, 'gate_closure.expected_issue_time_utc')
  int(gate.lead_minutes, path, 'gate_closure.lead_minutes')

  const counts = record(root.counts, path, 'counts')
  for (const field of [
    'actual_rows',
    'forecast_rows',
    'forecast_issues',
    'points_per_issue',
    'issues_per_day',
    'decision_days',
    'delivery_hours',
    'hours_evaluated',
  ]) {
    int(counts[field], path, `counts.${field}`)
  }

  const vintage = record(root.data_vintage, path, 'data_vintage')
  for (const field of [
    'actuals_first_start_utc',
    'actuals_last_start_utc',
    'forecasts_first_publish_utc',
    'forecasts_last_publish_utc',
    'last_sync_at',
    'last_sync_status',
  ]) {
    str(vintage[field], path, `data_vintage.${field}`)
  }

  const sources = nonEmptyList(root.sources, path, 'sources')
  sources.forEach((entry, index) => {
    const source = record(entry, path, `sources[${index}]`)
    str(source.dataset, path, `sources[${index}].dataset`)
    str(source.description, path, `sources[${index}].description`)
    str(source.url, path, `sources[${index}].url`)
  })

  const definitions = record(root.definitions, path, 'definitions')
  const definitionKeys = Object.keys(definitions)
  if (definitionKeys.length === 0) shape(path, 'definitions', 'definitions is empty')
  definitionKeys.forEach((key) => str(definitions[key], path, `definitions.${key}`))

  const assumptions = nonEmptyList(root.assumptions, path, 'assumptions')
  assumptions.forEach((assumption, index) =>
    str(assumption, path, `assumptions[${index}]`),
  )

  return body
}

export async function getDays(options: FetchOptions = {}): Promise<DaysResponse> {
  const path = '/api/days'
  const body = await fetchJson<DaysResponse>('/days', options)
  const root = record(body, path, 'body')
  const days = nonEmptyList(root.days, path, 'days')
  countEquals(days.length, root.count, path, 'count', 'days')
  isoDate(root.decision_date_from, path, 'decision_date_from')
  isoDate(root.decision_date_to, path, 'decision_date_to')

  days.forEach((entry, index) => {
    const prefix = `days[${index}]`
    const day = record(entry, path, prefix)
    isoDate(day.decision_date, path, `${prefix}.decision_date`)
    isoDate(day.delivery_date, path, `${prefix}.delivery_date`)
    str(day.gate_closure_publish_time, path, `${prefix}.gate_closure_publish_time`)
    str(day.gate_closure_issue_time_utc, path, `${prefix}.gate_closure_issue_time_utc`)
    int(day.hours_evaluated, path, `${prefix}.hours_evaluated`)
    bool(day.is_complete, path, `${prefix}.is_complete`)
    numbers(
      day,
      [
        'mae_mw',
        'rmse_mw',
        'bias_mw',
        'forecast_total_mwh',
        'actual_total_mwh',
        'max_shortfall_mw',
      ],
      path,
      prefix,
    )
    nullableStr(day.max_shortfall_hour_utc, path, `${prefix}.max_shortfall_hour_utc`)
  })

  return body
}

export async function getDay(decisionDate: string, options: FetchOptions = {}): Promise<DayResponse> {
  const path = `/api/days/${decisionDate}`
  const body = await fetchJson<DayResponse>(`/days/${encodeURIComponent(decisionDate)}`, options)
  const root = record(body, path, 'body')

  isoDate(root.decision_date, path, 'decision_date')
  isoDate(root.delivery_date, path, 'delivery_date')
  str(root.gate_closure_cutoff_utc, path, 'gate_closure_cutoff_utc')
  str(root.gate_closure_publish_time, path, 'gate_closure_publish_time')
  str(root.gate_closure_issue_time_utc, path, 'gate_closure_issue_time_utc')
  int(root.gate_closure_lead_minutes, path, 'gate_closure_lead_minutes')
  const hoursEvaluated = int(root.hours_evaluated, path, 'hours_evaluated')
  const isComplete = bool(root.is_complete, path, 'is_complete')

  const series = nonEmptyList(root.series, path, 'series')
  if (isComplete && series.length !== 24) {
    shape(path, 'series', `is_complete is true but series.length is ${series.length}, expected 24`)
  }
  if (series.length !== hoursEvaluated) {
    shape(
      path,
      'hours_evaluated',
      `hours_evaluated (${hoursEvaluated}) does not match series.length (${series.length})`,
    )
  }

  series.forEach((entry, index) => {
    const prefix = `series[${index}]`
    const point = record(entry, path, prefix)
    str(point.hour_utc, path, `${prefix}.hour_utc`)
    const hour = int(point.hour_of_day, path, `${prefix}.hour_of_day`)
    if (hour < 0 || hour > 23) {
      shape(path, `${prefix}.hour_of_day`, `hour_of_day out of range at ${prefix}`)
    }
    numbers(point, ['forecast_mw', 'actual_mw', 'error_mw'], path, prefix)
  })

  const summary = record(root.summary, path, 'summary')
  numbers(
    summary,
    [
      'forecast_total_mwh',
      'actual_total_mwh',
      'forecast_avg_mw',
      'forecast_peak_mw',
      'forecast_min_mw',
      'actual_avg_mw',
      'actual_peak_mw',
      'actual_min_mw',
    ],
    path,
    'summary',
  )
  for (const field of [
    'forecast_peak_hour_utc',
    'forecast_min_hour_utc',
    'actual_peak_hour_utc',
    'actual_min_hour_utc',
  ]) {
    str(summary[field], path, `summary.${field}`)
  }

  const metrics = record(root.metrics, path, 'metrics')
  int(metrics.count, path, 'metrics.count')
  numbers(metrics, ['mae_mw', 'rmse_mw', 'bias_mw'], path, 'metrics')
  if (metrics.mape_pct !== null) num(metrics.mape_pct, path, 'metrics.mape_pct')
  int(metrics.mape_hours, path, 'metrics.mape_hours')

  const percentiles = record(root.percentiles, path, 'percentiles')
  percentileOrder(percentiles, path, 'percentiles')

  const extremes = record(root.extremes, path, 'extremes')
  num(extremes.max_shortfall_mw, path, 'extremes.max_shortfall_mw')
  nullableStr(extremes.max_shortfall_hour_utc, path, 'extremes.max_shortfall_hour_utc')
  num(extremes.max_overdelivery_mw, path, 'extremes.max_overdelivery_mw')
  nullableStr(
    extremes.max_overdelivery_hour_utc,
    path,
    'extremes.max_overdelivery_hour_utc',
  )

  const windowContext = record(root.window_context, path, 'window_context')
  numbers(
    windowContext,
    ['window_mae_mw', 'window_bias_mw', 'day_mae_percentile', 'day_bias_percentile'],
    path,
    'window_context',
  )

  return body
}

export async function getForecast(
  decisionDate: string,
  options: FetchOptions = {},
): Promise<ForecastResponse> {
  const path = `/api/forecast/${decisionDate}`
  const body = await fetchJson<ForecastResponse>(
    `/forecast/${encodeURIComponent(decisionDate)}`,
    options,
  )
  const root = record(body, path, 'body')

  isoDate(root.decision_date, path, 'decision_date')
  isoDate(root.delivery_date, path, 'delivery_date')
  str(root.gate_closure_cutoff_utc, path, 'gate_closure_cutoff_utc')
  str(root.gate_closure_publish_time, path, 'gate_closure_publish_time')
  str(root.gate_closure_issue_time_utc, path, 'gate_closure_issue_time_utc')

  const issues = nonEmptyList(root.issues, path, 'issues')
  countEquals(issues.length, root.issue_count, path, 'issue_count', 'issues')

  let gateIssues = 0
  issues.forEach((entry, index) => {
    const prefix = `issues[${index}]`
    const issue = record(entry, path, prefix)
    str(issue.publish_time, path, `${prefix}.publish_time`)
    str(issue.issue_time_utc, path, `${prefix}.issue_time_utc`)
    if (bool(issue.is_gate_closure, path, `${prefix}.is_gate_closure`)) gateIssues += 1
    bool(issue.is_usable_at_gate_closure, path, `${prefix}.is_usable_at_gate_closure`)

    const points = nonEmptyList(issue.points, path, `${prefix}.points`)
    const pointCount = int(issue.point_count, path, `${prefix}.point_count`)
    if (pointCount !== points.length) {
      shape(
        path,
        `${prefix}.point_count`,
        `point_count (${pointCount}) does not match points.length (${points.length})`,
      )
    }
    if (pointCount !== 73) {
      shape(path, `${prefix}.point_count`, `Expected 73 points per issue, got ${pointCount}`)
    }

    points.forEach((pointEntry, pointIndex) => {
      const pointPrefix = `${prefix}.points[${pointIndex}]`
      const point = record(pointEntry, path, pointPrefix)
      str(point.target_time, path, `${pointPrefix}.target_time`)
      numbers(point, ['horizon_hours', 'generation_mw'], path, pointPrefix)
    })
  })

  if (gateIssues !== 1) {
    shape(path, 'issues[].is_gate_closure', `Expected exactly one gate-closure issue, got ${gateIssues}`)
  }

  return body
}

export async function getSummary(options: FetchOptions = {}): Promise<SummaryResponse> {
  const path = '/api/summary'
  const body = await fetchJson<SummaryResponse>('/summary', options)
  const root = record(body, path, 'body')

  const window = record(root.window, path, 'window')
  isoDate(window.decision_date_from, path, 'window.decision_date_from')
  isoDate(window.decision_date_to, path, 'window.decision_date_to')
  isoDate(window.delivery_date_from, path, 'window.delivery_date_from')
  isoDate(window.delivery_date_to, path, 'window.delivery_date_to')
  int(window.decision_days, path, 'window.decision_days')
  int(window.delivery_hours, path, 'window.delivery_hours')
  int(window.hours_evaluated, path, 'window.hours_evaluated')
  str(window.timezone, path, 'window.timezone')

  const overall = record(root.overall, path, 'overall')
  const overallCount = int(overall.count, path, 'overall.count')
  numbers(
    overall,
    [
      'mae_mw',
      'rmse_mw',
      'bias_mw',
      'mape_pct',
      'mean_forecast_mw',
      'mean_actual_mw',
      'mae_pct_of_mean_actual',
      'hours_in_shortfall_pct',
    ],
    path,
    'overall',
  )
  int(overall.mape_hours, path, 'overall.mape_hours')
  int(overall.hours_in_shortfall, path, 'overall.hours_in_shortfall')
  percentileOrder(overall, path, 'overall')
  const worstDay = record(overall.worst_day, path, 'overall.worst_day')
  isoDate(worstDay.decision_date, path, 'overall.worst_day.decision_date')
  num(worstDay.mae_mw, path, 'overall.worst_day.mae_mw')
  const bestDay = record(overall.best_day, path, 'overall.best_day')
  isoDate(bestDay.decision_date, path, 'overall.best_day.decision_date')
  num(bestDay.mae_mw, path, 'overall.best_day.mae_mw')

  const energy = record(root.energy, path, 'energy')
  numbers(
    energy,
    [
      'forecast_total_mwh',
      'actual_total_mwh',
      'forecast_total_gwh',
      'actual_total_gwh',
      'difference_mwh',
      'forecast_vs_actual_pct',
    ],
    path,
    'energy',
  )

  const byDay = nonEmptyList(root.by_day, path, 'by_day')
  if (byDay.length !== window.decision_days) {
    shape(
      path,
      'by_day',
      `by_day.length (${byDay.length}) does not match window.decision_days (${String(window.decision_days)})`,
    )
  }
  byDay.forEach((entry, index) => {
    const prefix = `by_day[${index}]`
    const row = record(entry, path, prefix)
    isoDate(row.decision_date, path, `${prefix}.decision_date`)
    isoDate(row.delivery_date, path, `${prefix}.delivery_date`)
    int(row.hours_evaluated, path, `${prefix}.hours_evaluated`)
    numbers(row, ['mae_mw', 'rmse_mw', 'bias_mw'], path, prefix)
  })

  const byHour = nonEmptyList(root.by_hour, path, 'by_hour')
  if (byHour.length !== 24) {
    shape(path, 'by_hour', `Expected 24 by_hour rows, got ${byHour.length}`)
  }
  byHour.forEach((entry, index) => {
    const prefix = `by_hour[${index}]`
    const row = record(entry, path, prefix)
    const hour = int(row.hour_of_day, path, `${prefix}.hour_of_day`)
    if (hour < 0 || hour > 23) {
      shape(path, `${prefix}.hour_of_day`, `hour_of_day out of range at ${prefix}`)
    }
    int(row.count, path, `${prefix}.count`)
    numbers(row, ['mae_mw', 'bias_mw'], path, prefix)
    percentileOrder(row, path, prefix)
  })

  const byHorizon = nonEmptyList(root.by_horizon, path, 'by_horizon')
  if (byHorizon.length !== 8) {
    shape(path, 'by_horizon', `Expected 8 horizon buckets, got ${byHorizon.length}`)
  }
  byHorizon.forEach((entry, index) => {
    const prefix = `by_horizon[${index}]`
    const row = record(entry, path, prefix)
    int(row.horizon_start_h, path, `${prefix}.horizon_start_h`)
    int(row.horizon_end_h, path, `${prefix}.horizon_end_h`)
    int(row.count, path, `${prefix}.count`)
    numbers(row, ['mae_mw', 'rmse_mw', 'bias_mw'], path, prefix)
  })

  const byIssueTime = nonEmptyList(root.by_issue_time, path, 'by_issue_time')
  if (byIssueTime.length !== 4) {
    shape(path, 'by_issue_time', `Expected 4 issue-time rows, got ${byIssueTime.length}`)
  }
  byIssueTime.forEach((entry, index) => {
    const prefix = `by_issue_time[${index}]`
    const row = record(entry, path, prefix)
    str(row.issue_time_utc, path, `${prefix}.issue_time_utc`)
    int(row.minutes_before_gate, path, `${prefix}.minutes_before_gate`)
    int(row.count, path, `${prefix}.count`)
    numbers(row, ['mae_mw', 'rmse_mw', 'bias_mw'], path, prefix)
  })

  const scatter = nonEmptyList(root.scatter, path, 'scatter')
  if (scatter.length !== overallCount) {
    shape(
      path,
      'scatter',
      `scatter.length (${scatter.length}) does not match overall.count (${overallCount})`,
    )
  }
  if (window.hours_evaluated !== overallCount) {
    shape(
      path,
      'window.hours_evaluated',
      `window.hours_evaluated (${String(window.hours_evaluated)}) does not match overall.count (${overallCount})`,
    )
  }
  scatter.forEach((entry, index) => {
    const prefix = `scatter[${index}]`
    const row = record(entry, path, prefix)
    str(row.delivery_hour_utc, path, `${prefix}.delivery_hour_utc`)
    isoDate(row.decision_date, path, `${prefix}.decision_date`)
    numbers(row, ['forecast_mw', 'actual_mw', 'error_mw'], path, prefix)
  })

  return body
}

/**
 * Resolve a hook resource path (`/summary`) to its typed endpoint and guard.
 * Unknown paths are a programming error, not a waiting state.
 */
export async function fetchApiPath<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  if (path === '/meta') return (await getMeta(options)) as unknown as T
  if (path === '/days') return (await getDays(options)) as unknown as T
  if (path === '/summary') return (await getSummary(options)) as unknown as T

  const dayMatch = /^\/days\/([^/]+)$/.exec(path)
  if (dayMatch) {
    return (await getDay(decodeURIComponent(dayMatch[1]), options) as unknown) as T
  }

  const forecastMatch = /^\/forecast\/([^/]+)$/.exec(path)
  if (forecastMatch) {
    return (await getForecast(decodeURIComponent(forecastMatch[1]), options) as unknown) as T
  }

  throw new ApiError(404, `Unknown API resource path: ${path}`, path)
}
