import type { ForecastIssue, ForecastPoint, ForecastResponse } from '../../api/types'
import { addDays } from './summary'

const ISSUE_TIMES = ['02:30', '04:30', '07:30', '09:30', '11:30', '15:30', '18:30', '22:30']

export function makeForecastFixture(decisionDate = '2026-01-05'): ForecastResponse {
  const deliveryDate = addDays(decisionDate, 1)
  const cutoff = `${decisionDate}T09:50:00Z`
  const start = new Date(`${deliveryDate}T00:00:00Z`)
  start.setUTCHours(start.getUTCHours() - 12)

  const issues: ForecastIssue[] = ISSUE_TIMES.map((time, issueIndex) => {
    const publishTime = `${decisionDate}T${time}:00Z`
    const publishMs = new Date(publishTime).getTime()

    const points: ForecastPoint[] = Array.from({ length: 73 }, (_, pointIndex) => {
      const target = new Date(start.getTime() + pointIndex * 3_600_000)
      const horizon = (target.getTime() - publishMs) / 3_600_000
      return {
        target_time: target.toISOString().replace('.000Z', 'Z'),
        horizon_hours: Math.round(horizon * 10) / 10,
        generation_mw: 5000 + target.getUTCHours() * 180 + issueIndex * 90,
      }
    })

    return {
      publish_time: publishTime,
      issue_time_utc: time,
      is_gate_closure: time === '09:30',
      is_usable_at_gate_closure: publishTime <= cutoff,
      point_count: 73,
      points,
    }
  })

  return {
    decision_date: decisionDate,
    delivery_date: deliveryDate,
    gate_closure_cutoff_utc: cutoff,
    gate_closure_publish_time: `${decisionDate}T09:30:00Z`,
    gate_closure_issue_time_utc: '09:30',
    issue_count: 8,
    issues,
  }
}

export const forecastFixture: ForecastResponse = makeForecastFixture('2026-01-05')
