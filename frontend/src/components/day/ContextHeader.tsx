import type { DayResponse } from '../../api/types'
import {
  formatDayShort,
  formatHourUtc,
  formatTimestamp,
} from '../../lib/format'
import { Badge } from '../ui/Badge'

export function ContextHeader({ day }: { day: DayResponse }) {
  const pill = `Forecast as known at ${day.gate_closure_issue_time_utc} UTC, ${formatDayShort(
    day.decision_date,
  )}`
  const gateClosure = `Market cut-off ${formatHourUtc(day.gate_closure_cutoff_utc)} UTC`

  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
            The decision
          </p>
          <h2 className="mt-1 text-xl font-semibold text-fg sm:text-2xl">
            Bid on {formatDayShort(day.decision_date)} → delivered{' '}
            {formatDayShort(day.delivery_date)}
          </h2>
        </div>
        {!day.is_complete ? (
          <Badge tone="forecast">
            Part day — {day.hours_evaluated} of 24 hours scored
          </Badge>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="forecast">{pill}</Badge>
        <Badge tone="neutral">{gateClosure}</Badge>
        <span className="text-xs text-muted">
          Version published {formatTimestamp(day.gate_closure_publish_time)} ·{' '}
          {day.gate_closure_lead_minutes} minutes before the cut-off
        </span>
      </div>
    </section>
  )
}
