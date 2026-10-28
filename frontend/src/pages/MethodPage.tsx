import type { MetaResponse } from '../api/types'
import { useApiResource } from '../api/useApiResource'
import { formatDayShort, formatNumber } from '../lib/format'
import { PageShell } from '../components/layout/PageShell'
import { ErrorState, LoadingState, WaitingForApi } from '../components/ui/StateBlock'

const GLOSSARY: Array<{ term: string; plain: string }> = [
  {
    term: 'MAE — mean absolute error',
    plain:
      'Expect to be off by this much on average. It ignores direction, so a forecast that is too high and one that is too low count the same. Lower is better.',
  },
  {
    term: 'RMSE — root mean square error',
    plain:
      'Like MAE, but big misses count more. Use it when a few large errors matter more than many small ones.',
  },
  {
    term: 'Bias',
    plain:
      'The average signed miss. Positive bias means forecasts ran high, so a buyer may need cover; negative means they ran low. Bias is descriptive here, not a skill score.',
  },
  {
    term: 'MAPE — mean absolute percentage error',
    plain:
      'The miss as a percentage of actual wind, ignoring very low-wind hours where percentages become meaningless. Useful for scale-free comparison, not for settlement.',
  },
  {
    term: 'P05 / P95',
    plain:
      'The tails of the signed error distribution. P95 is the over-forecast tail a buyer might hold as margin; P05 is the under-forecast tail.',
  },
  {
    term: 'Gate closure',
    plain:
      'The deadline for the day-ahead position. The forecast used here is the last one published before that deadline, not the last one available now.',
  },
]

function humanizeKey(key: string): string {
  const acronyms: Record<string, string> = {
    mae: 'MAE',
    rmse: 'RMSE',
    bias: 'Bias',
    mape: 'MAPE',
    percentiles: 'Percentiles',
    hourly_alignment: 'Hourly alignment',
    energy: 'Energy',
    horizon: 'Horizon',
    gate_closure: 'Gate closure',
    shortfall: 'Shortfall',
    error: 'Error',
  }
  return acronyms[key] ?? key.split('_').join(' ')
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-bg/30 p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="num mt-1 text-sm leading-snug text-fg">{value}</dd>
    </div>
  )
}

export function MethodPage() {
  const meta = useApiResource<MetaResponse>('/meta')

  return (
    <PageShell
      title="Method and data"
      purpose="The definitions, alignment rules and source data behind every number, plus the caveats that limit how far the comparison can be read as forecast skill."
    >
      {meta.status === 'loading' ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <LoadingState label="Loading method metadata" />
        </div>
      ) : null}

      {meta.status === 'waiting' ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <WaitingForApi
            endpoint={meta.endpoint}
            attempt={meta.attempt}
            lastAttemptAt={meta.lastAttemptAt}
            onRetry={meta.retry}
          />
        </div>
      ) : null}

      {meta.status === 'error' ? (
        <ErrorState error={meta.error} endpoint={meta.endpoint} onRetry={meta.retry} />
      ) : null}

      {meta.status === 'ready' && meta.data ? <MethodContent meta={meta.data} /> : null}

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">Plain-language glossary</h2>
        <p className="mt-1 text-sm text-muted">
          What the numbers mean if you are buying wind rather than reading a statistics
          report.
        </p>
        <dl className="mt-4 grid gap-4 md:grid-cols-2">
          {GLOSSARY.map((item) => (
            <div key={item.term} className="rounded-lg border border-border/40 bg-bg/30 p-3">
              <dt className="text-sm font-semibold text-fg">{item.term}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{item.plain}</dd>
            </div>
          ))}
        </dl>
      </section>

      <aside
        role="note"
        aria-label="Measurement caveat"
        className="rounded-xl border border-forecast/50 border-l-4 border-l-forecast bg-forecast/5 p-5"
      >
        <h2 className="text-base font-semibold text-forecast">Measurement caveat</h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-fg">
          The roughly 1.15× level gap between the WINDFOR forecast population and the
          FUELHH metered actuals may partly reflect differences in metering scope or
          curtailment, not pure forecast skill. A forecast can be accurate for the wind
          it covers and still differ from the settled national outturn. Read bias as a
          descriptive property of this comparison, not as a standalone skill score.
        </p>
      </aside>

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">What this is not</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>
            Not a probabilistic forecast product: the bands are historical empirical
            distributions, not calibrated prediction intervals.
          </li>
          <li>
            Not a trading recommendation: no demand, prices, imbalance costs or other
            fuels are modelled.
          </li>
          <li>
            Not a claim about the whole GB wind fleet beyond what FUELHH and WINDFOR
            report for this window.
          </li>
        </ul>
      </section>
    </PageShell>
  )
}

function MethodContent({ meta }: { meta: MetaResponse }) {
  const counts = meta.counts
  const gate = meta.gate_closure

  return (
    <>
      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">What this measures</h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-muted">
          Each row pairs a gate-closure wind forecast for a delivery hour with the
          settled FUELHH outturn for the same hour. Decision dates run{' '}
          {formatDayShort(meta.window.decision_date_from)} to{' '}
          {formatDayShort(meta.window.decision_date_to)}; each decision covers delivery
          on the following day ({formatDayShort(meta.window.delivery_date_from)} to{' '}
          {formatDayShort(meta.window.delivery_date_to)}).
        </p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Fact
            label="Decision dates"
            value={`${formatDayShort(meta.window.decision_date_from)} — ${formatDayShort(
              meta.window.decision_date_to,
            )}`}
          />
          <Fact
            label="Delivery dates"
            value={`${formatDayShort(meta.window.delivery_date_from)} — ${formatDayShort(
              meta.window.delivery_date_to,
            )}`}
          />
          <Fact label="Decision days" value={formatNumber(meta.window.decision_days)} />
          <Fact label="Delivery hours" value={formatNumber(meta.window.delivery_hours)} />
          <Fact label="Gate closure" value={`${gate.cutoff_time_utc} UTC`} />
          <Fact
            label="Selected issue"
            value={`${gate.expected_issue_time_utc} UTC`}
          />
          <Fact label="Lead to gate" value={`${formatNumber(gate.lead_minutes)} minutes`} />
          <Fact label="Timezone" value={meta.window.timezone} />
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-muted">{gate.timezone_note}</p>
        <p className="mt-2 max-w-5xl text-xs leading-relaxed text-muted">
          Selection rule: <code className="num text-xs text-muted">{gate.rule}</code>. For
          this window the selected issue is the {gate.expected_issue_time_utc} UTC
          publication, {formatNumber(gate.lead_minutes)} minutes before the cutoff.
        </p>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">Dataset footprint</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="FUELHH rows" value={formatNumber(counts.actual_rows)} />
          <Fact label="WINDFOR rows" value={formatNumber(counts.forecast_rows)} />
          <Fact label="Forecast issues" value={formatNumber(counts.forecast_issues)} />
          <Fact label="Points per issue" value={formatNumber(counts.points_per_issue)} />
          <Fact label="Issues per day" value={formatNumber(counts.issues_per_day)} />
          <Fact label="Decision days" value={formatNumber(counts.decision_days)} />
          <Fact label="Delivery hours" value={formatNumber(counts.delivery_hours)} />
          <Fact label="Hours evaluated" value={formatNumber(counts.hours_evaluated)} />
        </dl>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">Definitions</h2>
        <dl className="mt-3 grid gap-4 md:grid-cols-2">
          {Object.entries(meta.definitions).map(([key, definition]) => (
            <div key={key} className="rounded-lg border border-border/40 bg-bg/30 p-3">
              <dt className="text-sm font-semibold text-fg">{humanizeKey(key)}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{definition}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">Data sources</h2>
        <ul className="mt-3 space-y-4">
          {meta.sources.map((source) => (
            <li key={source.dataset}>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="rounded text-sm font-semibold text-fg underline decoration-border underline-offset-2 transition-colors duration-150 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                {source.dataset}
              </a>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {source.description}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          WINDFOR is queried by publication time; each issue carries hourly target
          points. Actuals come from FUELHH settlement periods; the two half-hours
          beginning on the hour and half past are averaged to one hourly actual.
        </p>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">Assumptions</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
          {meta.assumptions.map((assumption, index) => (
            <li key={index}>{assumption}</li>
          ))}
        </ol>
      </section>
    </>
  )
}
