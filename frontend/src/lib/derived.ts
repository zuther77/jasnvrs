import type {
  ByDayRow,
  ByHourRow,
  ByHorizonRow,
  DayResponse,
  DaySeriesPoint,
  ForecastIssue,
  ForecastResponse,
  ScatterRow,
  SummaryResponse,
} from '../api/types'
import {
  formatDay,
  formatDayAxis,
  formatHorizon,
  formatHourOfDay,
  formatHourSpan,
  formatMw,
  formatNumber,
  formatPct,
} from './format'

export interface DailyChartRow {
  index: number
  label: string
  fullLabel: string
  mae_mw: number
  rmse_mw: number
  bias_mw: number
  hours_evaluated: number
}

export function toDailyRows(rows: ByDayRow[]): DailyChartRow[] {
  return rows.map((row, index) => ({
    index,
    label: formatDayAxis(row.decision_date),
    fullLabel: formatDay(row.decision_date),
    mae_mw: row.mae_mw,
    rmse_mw: row.rmse_mw,
    bias_mw: row.bias_mw,
    hours_evaluated: row.hours_evaluated,
  }))
}

export interface HourChartRow {
  hour_of_day: number
  label: string
  fullLabel: string
  count: number
  mae_mw: number
  bias_mw: number
  p05_mw: number
  p50_mw: number
  p95_mw: number
  band: [number, number]
}

export function toHourRows(rows: ByHourRow[]): HourChartRow[] {
  return rows.map((row) => ({
    hour_of_day: row.hour_of_day,
    label: String(row.hour_of_day).padStart(2, '0'),
    fullLabel: formatHourSpan(row.hour_of_day),
    count: row.count,
    mae_mw: row.mae_mw,
    bias_mw: row.bias_mw,
    p05_mw: row.p05_mw,
    p50_mw: row.p50_mw,
    p95_mw: row.p95_mw,
    band: [row.p05_mw, row.p95_mw],
  }))
}

export interface HorizonChartRow {
  label: string
  horizon_start_h: number
  horizon_end_h: number
  count: number
  mae_mw: number
  rmse_mw: number
  bias_mw: number
}

export function toHorizonRows(rows: ByHorizonRow[]): HorizonChartRow[] {
  return rows.map((row) => ({
    label: formatHorizon(row.horizon_start_h, row.horizon_end_h),
    horizon_start_h: row.horizon_start_h,
    horizon_end_h: row.horizon_end_h,
    count: row.count,
    mae_mw: row.mae_mw,
    rmse_mw: row.rmse_mw,
    bias_mw: row.bias_mw,
  }))
}

export interface ScatterPointRow {
  delivery_hour_utc: string
  decision_date: string
  forecast_mw: number
  actual_mw: number
  error_mw: number
}

export function toScatterRows(rows: ScatterRow[]): ScatterPointRow[] {
  return rows.map((row) => ({
    delivery_hour_utc: row.delivery_hour_utc,
    decision_date: row.decision_date,
    forecast_mw: row.forecast_mw,
    actual_mw: row.actual_mw,
    error_mw: row.error_mw,
  }))
}

export function sampleScatter(
  rows: ScatterRow[],
  maxRows = 60,
): { rows: ScatterRow[]; note: string } {
  if (rows.length <= maxRows) {
    return {
      rows,
      note: `All ${formatNumber(rows.length)} evaluated hours are listed.`,
    }
  }
  const step = Math.ceil(rows.length / maxRows)
  const sample = rows.filter((_, index) => index % step === 0)
  return {
    rows: sample,
    note: `Representative sample: ${formatNumber(sample.length)} of ${formatNumber(
      rows.length,
    )} points, one every ${step} hours. The chart plots every point.`,
  }
}

/** API_CONTRACT.md §11.1: actual = forecast − error, so p95 is the low outcome. */
export function riskBandForHour(
  forecastMw: number,
  hourRow: Pick<ByHourRow, 'p05_mw' | 'p95_mw'>,
): { low: number; high: number } {
  return {
    low: forecastMw - hourRow.p95_mw,
    high: forecastMw - hourRow.p05_mw,
  }
}

export interface DayChartRow {
  hour_of_day: number
  label: string
  fullLabel: string
  forecast_mw: number
  actual_mw: number
  error_mw: number
  band_low_mw: number | null
  band_high_mw: number | null
  band: [number, number] | null
  shortfall_ribbon: [number, number] | null
  overdelivery_ribbon: [number, number] | null
}

/**
 * Builds the delivery-day chart rows. `byHour` is optional: when the summary is
 * unavailable the chart renders without the historical band, never with a guess.
 */
export function toDayChartRows(
  series: DaySeriesPoint[],
  byHour?: ByHourRow[],
): DayChartRow[] {
  const hourLookup = new Map<number, ByHourRow>()
  byHour?.forEach((row) => hourLookup.set(row.hour_of_day, row))

  return series.map((point) => {
    const hourRow = hourLookup.get(point.hour_of_day)
    const band = hourRow ? riskBandForHour(point.forecast_mw, hourRow) : null
    const isShortfall = point.error_mw > 0
    const isOverdelivery = point.error_mw < 0
    return {
      hour_of_day: point.hour_of_day,
      label: formatHourOfDay(point.hour_of_day),
      fullLabel: formatHourSpan(point.hour_of_day),
      forecast_mw: point.forecast_mw,
      actual_mw: point.actual_mw,
      error_mw: point.error_mw,
      band_low_mw: band ? band.low : null,
      band_high_mw: band ? band.high : null,
      band: band ? [band.low, band.high] : null,
      shortfall_ribbon: isShortfall
        ? [point.actual_mw, point.forecast_mw]
        : null,
      overdelivery_ribbon: isOverdelivery
        ? [point.forecast_mw, point.actual_mw]
        : null,
    }
  })
}

export function takeawaySentence(summary: SummaryResponse): string {
  const { overall, by_horizon: byHorizon } = summary
  const first = byHorizon[0]
  const last = byHorizon[byHorizon.length - 1]
  const direction =
    overall.bias_mw >= 0
      ? `It ran high by ${formatMw(overall.bias_mw)} on average, so the desk was usually short and had to buy more.`
      : `It ran low by ${formatMw(Math.abs(overall.bias_mw))} on average, so the desk sometimes bought more than it needed.`

  return (
    `Across ${formatNumber(overall.count)} hours in January, the forecast missed by ` +
    `${formatMw(overall.mae_mw)} in a typical hour — about ` +
    `${formatPct(overall.mae_pct_of_mean_actual)} of the wind actually generated. ` +
    `${direction} Misses grow the further ahead you look: about ` +
    `${formatMw(first.mae_mw)} a few hours out, ${formatMw(last.mae_mw)} two days out. ` +
    `In 19 hours out of 20 the forecast was no more than ${formatMw(overall.p95_mw)} ` +
    `above what arrived.`
  )
}

export function decisionNoteSentence(day: DayResponse): string {
  return (
    `This day's average miss was worse than on ` +
    `${formatPct(day.window_context.day_mae_percentile)} of January days, and the ` +
    `forecast ran high by more than on ` +
    `${formatPct(day.window_context.day_bias_percentile)} of days.`
  )
}

export interface FanSeries {
  key: string
  label: string
  issue: ForecastIssue
  values: Map<number, number>
}

export interface FanRow {
  hour_label: string
  hour_of_day: number
  [key: string]: number | string | null
}

export interface FanModel {
  series: FanSeries[]
  rows: FanRow[]
  usableCount: number
  issueCount: number
  gateKey: string | null
}

/** Align every issue's points onto the 24 delivery hours; never interpolate. */
export function buildFan(forecast: ForecastResponse): FanModel {
  const deliveryPrefix = `${forecast.delivery_date}T`
  const series: FanSeries[] = forecast.issues.map((issue, index) => {
    const values = new Map<number, number>()
    issue.points.forEach((point) => {
      if (!point.target_time.startsWith(deliveryPrefix)) return
      const hour = Number(point.target_time.slice(11, 13))
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) {
        values.set(hour, point.generation_mw)
      }
    })

    const suffix = issue.is_gate_closure
      ? 'used at cut-off'
      : issue.is_usable_at_gate_closure
        ? 'before cut-off'
        : 'after cut-off'

    return {
      key: `issue_${index}`,
      label: `${issue.issue_time_utc} (${suffix})`,
      issue,
      values,
    }
  })

  const rows: FanRow[] = Array.from({ length: 24 }, (_, hour) => {
    const row: FanRow = {
      hour_label: formatHourOfDay(hour),
      hour_of_day: hour,
    }
    series.forEach((line) => {
      row[line.key] = line.values.get(hour) ?? null
    })
    return row
  })

  const gate = series.find((line) => line.issue.is_gate_closure)

  return {
    series,
    rows,
    usableCount: forecast.issues.filter((issue) => issue.is_usable_at_gate_closure)
      .length,
    issueCount: forecast.issue_count,
    gateKey: gate ? gate.key : null,
  }
}
