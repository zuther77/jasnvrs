import type {
  ByDayRow,
  ByHorizonRow,
  ByHourRow,
  ByIssueTimeRow,
  ScatterRow,
  SummaryResponse,
} from '../../api/types'

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export const fixtureDates = Array.from({ length: 31 }, (_, index) =>
  `2026-01-${String(index + 1).padStart(2, '0')}`,
)

const byDay: ByDayRow[] = fixtureDates.map((decisionDate, index) => ({
  decision_date: decisionDate,
  delivery_date: addDays(decisionDate, 1),
  mae_mw: index === 26 ? 5374.8 : 1800 + (index % 5) * 90,
  rmse_mw: index === 26 ? 6100.2 : 2200 + (index % 5) * 100,
  bias_mw: index === 26 ? 4900.5 : 1500 + (index % 6) * 70,
  hours_evaluated: 24,
}))

const byHour: ByHourRow[] = Array.from({ length: 24 }, (_, hour) => ({
  hour_of_day: hour,
  count: 31,
  mae_mw: 1800 + (hour % 6) * 60,
  bias_mw: 1500 + (hour % 4) * 80,
  p05_mw: -1200 + hour * 10,
  p50_mw: 1400 + hour * 5,
  p95_mw: 4500 + (hour % 5) * 120,
}))

const byHorizon: ByHorizonRow[] = Array.from({ length: 8 }, (_, index) => ({
  horizon_start_h: index * 6,
  horizon_end_h: index * 6 + 6,
  count: 1460 + index,
  mae_mw: 1686.4 + index * 92.4,
  rmse_mw: 2144.5 + index * 106.3,
  bias_mw: 1453.3 + index * 72.7,
}))

const issueTimes = [
  { issue_time_utc: '02:30', minutes_before_gate: 440 },
  { issue_time_utc: '04:30', minutes_before_gate: 320 },
  { issue_time_utc: '07:30', minutes_before_gate: 140 },
  { issue_time_utc: '09:30', minutes_before_gate: 20 },
]

const byIssueTime: ByIssueTimeRow[] = issueTimes.map((issue, index) => ({
  ...issue,
  count: 744,
  mae_mw: 2073.1 - index * 20,
  rmse_mw: 2577.8 - index * 24,
  bias_mw: 1735.4 - index * 1.8,
}))

const scatter: ScatterRow[] = Array.from({ length: 744 }, (_, index) => {
  const dayIndex = Math.floor(index / 24)
  const hour = index % 24
  const decisionDate = fixtureDates[dayIndex]
  const forecast = 9000 + hour * 250 + (dayIndex % 5) * 120
  const actual = forecast - (1200 + (index % 7) * 140)
  return {
    delivery_hour_utc: `${addDays(decisionDate, 1)}T${String(hour).padStart(2, '0')}:00:00Z`,
    decision_date: decisionDate,
    forecast_mw: forecast,
    actual_mw: actual,
    error_mw: forecast - actual,
  }
})

export const summaryFixture: SummaryResponse = {
  window: {
    decision_date_from: '2026-01-01',
    decision_date_to: '2026-01-31',
    delivery_date_from: '2026-01-02',
    delivery_date_to: '2026-02-01',
    decision_days: 31,
    delivery_hours: 744,
    timezone: 'UTC',
    hours_evaluated: 744,
  },
  overall: {
    count: 744,
    mae_mw: 2013.0,
    rmse_mw: 2505.9,
    bias_mw: 1729.9,
    mape_pct: 21.61,
    mape_hours: 744,
    mean_forecast_mw: 13013.5,
    mean_actual_mw: 11283.6,
    mae_pct_of_mean_actual: 17.84,
    hours_in_shortfall: 627,
    hours_in_shortfall_pct: 84.27,
    p05_mw: -1145.5,
    p50_mw: 1560.2,
    p95_mw: 5322.2,
    worst_day: { decision_date: '2026-01-27', mae_mw: 5374.8 },
    best_day: { decision_date: '2026-01-08', mae_mw: 797.1 },
  },
  energy: {
    forecast_total_mwh: 9682036.0,
    actual_total_mwh: 8394967.0,
    forecast_total_gwh: 9682.04,
    actual_total_gwh: 8394.97,
    difference_mwh: 1287069.0,
    forecast_vs_actual_pct: 15.33,
  },
  by_day: byDay,
  by_hour: byHour,
  by_horizon: byHorizon,
  by_issue_time: byIssueTime,
  scatter,
}
