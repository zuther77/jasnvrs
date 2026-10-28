import type { DaySummary, DaysResponse } from '../../api/types'
import { addDays, fixtureDates } from './summary'

const days: DaySummary[] = fixtureDates.map((decisionDate, index) => {
  const isJanFifth = decisionDate === '2026-01-05'
  const mae = isJanFifth ? 2127.3 : index === 26 ? 5374.8 : 1800 + (index % 5) * 90
  return {
    decision_date: decisionDate,
    delivery_date: addDays(decisionDate, 1),
    gate_closure_publish_time: `${decisionDate}T09:30:00Z`,
    gate_closure_issue_time_utc: '09:30',
    hours_evaluated: 24,
    is_complete: true,
    mae_mw: mae,
    rmse_mw: isJanFifth ? 2504.4 : mae + 380,
    bias_mw: isJanFifth ? 2016.0 : mae * 0.94,
    forecast_total_mwh: isJanFifth ? 275148.0 : 260000 + index * 1000,
    actual_total_mwh: isJanFifth ? 226764.5 : 240000 + index * 900,
    max_shortfall_mw: isJanFifth ? 4080.0 : 2100 + index * 20,
    max_shortfall_hour_utc: `${addDays(decisionDate, 1)}T05:00:00Z`,
  }
})

export const daysFixture: DaysResponse = {
  count: 31,
  decision_date_from: '2026-01-01',
  decision_date_to: '2026-01-31',
  days,
}
