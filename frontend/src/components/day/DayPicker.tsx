import type { DaySummary } from '../../api/types'
import { formatDayShort } from '../../lib/format'
import { Button } from '../ui/Button'

interface DayPickerProps {
  days: DaySummary[]
  selectedDate: string
  onSelect: (decisionDate: string) => void
}

export function DayPicker({ days, selectedDate, onSelect }: DayPickerProps) {
  const index = days.findIndex((day) => day.decision_date === selectedDate)
  const currentIndex = index >= 0 ? index : days.length - 1
  const current = days[currentIndex]
  const previous = days[currentIndex - 1]
  const next = days[currentIndex + 1]

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-2">
          <label
            htmlFor="decision-date"
            className="text-xs font-semibold uppercase tracking-[0.08em] text-muted"
          >
            Decision date
          </label>
          <div className="flex items-center gap-2">
            <Button
              aria-label="Previous decision day"
              disabled={!previous}
              onClick={() => previous && onSelect(previous.decision_date)}
              className="shrink-0"
            >
              ←
            </Button>
            <select
              id="decision-date"
              aria-label="Decision date"
              value={current.decision_date}
              onChange={(event) => onSelect(event.target.value)}
              className="num min-w-0 flex-1 rounded-lg border border-muted/60 bg-bg px-3 py-2 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {days.map((day) => (
                <option key={day.decision_date} value={day.decision_date}>
                  {formatDayShort(day.decision_date)} → {formatDayShort(day.delivery_date)}
                </option>
              ))}
            </select>
            <Button
              aria-label="Next decision day"
              disabled={!next}
              onClick={() => next && onSelect(next.decision_date)}
              className="shrink-0"
            >
              →
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted" aria-live="polite">
          {currentIndex + 1} of {days.length}
        </p>
      </div>
    </div>
  )
}
