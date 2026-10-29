import type { DayResponse } from '../../api/types'
import { decisionNoteSentence } from '../../lib/derived'
import { formatMwSigned } from '../../lib/format'

interface DecisionNoteProps {
  day: DayResponse
  onOpenMethod: () => void
}

export function DecisionNote({ day, onOpenMethod }: DecisionNoteProps) {
  return (
    <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <h2 className="text-base font-semibold text-fg">How this day compares</h2>
      <p className="mt-2 max-w-4xl text-sm leading-relaxed text-fg">
        {decisionNoteSentence(day)}
      </p>
      <div className="mt-4 flex flex-wrap gap-2" aria-label="Where this day's hourly misses landed">
        <span className="rounded-full border border-positive/40 bg-positive/5 px-3 py-1 text-xs text-muted">
          Low end (5%){' '}
          <strong className="num font-medium text-positive">
            {formatMwSigned(day.percentiles.p05_mw)}
          </strong>
        </span>
        <span className="rounded-full border border-border/60 bg-bg/40 px-3 py-1 text-xs text-muted">
          Typical (50%){' '}
          <strong className="num font-medium text-fg">
            {formatMwSigned(day.percentiles.p50_mw)}
          </strong>
        </span>
        <span className="rounded-full border border-risk/40 bg-risk/5 px-3 py-1 text-xs text-muted">
          High end (95%){' '}
          <strong className="num font-medium text-riskText">
            {formatMwSigned(day.percentiles.p95_mw)}
          </strong>
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        In 9 hours out of 10 this day&apos;s miss fell between the low and high ends.
        Positive means the forecast was too high; negative means too low.{' '}
        <button
          type="button"
          onClick={onOpenMethod}
          className="rounded underline decoration-border underline-offset-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          Read the measurement caveat
        </button>
        .
      </p>
    </section>
  )
}
