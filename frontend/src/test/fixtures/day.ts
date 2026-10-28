import type { DayResponse, DaySeriesPoint } from '../../api/types'
import { addDays } from './summary'

const SERIES: Array<[number, number]> = [
  [6449.0, 5711.0],
  [6813.0, 5014.0],
  [7079.0, 4050.0],
  [7548.0, 3608.5],
  [8233.0, 4444.5],
  [8662.0, 4582.0],
  [9104.0, 5443.5],
  [9293.0, 5580.0],
  [9536.0, 6007.5],
  [9860.0, 6333.0],
  [10152.0, 6765.0],
  [10558.0, 7756.0],
  [11228.0, 9498.0],
  [11878.0, 10303.0],
  [12537.0, 10528.5],
  [13273.0, 11297.0],
  [13842.0, 12445.0],
  [14349.0, 13416.5],
  [14825.0, 14389.5],
  [15193.0, 15357.0],
  [15479.0, 15936.5],
  [15924.0, 16638.0],
  [16435.0, 16335.0],
  [16898.0, 15325.5],
]

export function makeDayFixture(decisionDate = '2026-01-05'): DayResponse {
  const deliveryDate = addDays(decisionDate, 1)

  const series: DaySeriesPoint[] = SERIES.map(([forecast, actual], hour) => ({
    hour_utc: `${deliveryDate}T${String(hour).padStart(2, '0')}:00:00Z`,
    hour_of_day: hour,
    forecast_mw: forecast,
    actual_mw: actual,
    error_mw: forecast - actual,
  }))

  return {
    decision_date: decisionDate,
    delivery_date: deliveryDate,
    gate_closure_cutoff_utc: `${decisionDate}T09:50:00Z`,
    gate_closure_publish_time: `${decisionDate}T09:30:00Z`,
    gate_closure_issue_time_utc: '09:30',
    gate_closure_lead_minutes: 20,
    hours_evaluated: 24,
    is_complete: true,
    series,
    summary: {
      forecast_total_mwh: 275148.0,
      actual_total_mwh: 226764.5,
      forecast_avg_mw: 11464.5,
      forecast_peak_mw: 16898.0,
      forecast_min_mw: 6449.0,
      forecast_peak_hour_utc: `${deliveryDate}T23:00:00Z`,
      forecast_min_hour_utc: `${deliveryDate}T00:00:00Z`,
      actual_avg_mw: 9448.5,
      actual_peak_mw: 16638.0,
      actual_min_mw: 3608.5,
      actual_peak_hour_utc: `${deliveryDate}T21:00:00Z`,
      actual_min_hour_utc: `${deliveryDate}T03:00:00Z`,
    },
    metrics: {
      count: 24,
      mae_mw: 2127.3,
      rmse_mw: 2504.4,
      bias_mw: 2016.0,
      mape_pct: 35.49,
      mape_hours: 24,
    },
    percentiles: { p05_mw: -413.5, p50_mw: 1887.5, p95_mw: 3916.8 },
    extremes: {
      max_shortfall_mw: 4080.0,
      max_shortfall_hour_utc: `${deliveryDate}T05:00:00Z`,
      max_overdelivery_mw: -714.0,
      max_overdelivery_hour_utc: `${deliveryDate}T21:00:00Z`,
    },
    window_context: {
      window_mae_mw: 2013.0,
      window_bias_mw: 1729.9,
      day_mae_percentile: 77.4,
      day_bias_percentile: 74.2,
    },
  }
}

export const dayFixture: DayResponse = makeDayFixture('2026-01-05')
