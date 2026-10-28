import type { SummaryResponse } from '../api/types'
import { useApiResource } from '../api/useApiResource'
import { CHART_TITLES } from '../lib/constants'
import { takeawaySentence } from '../lib/derived'
import {
  formatDayShort,
  formatMw,
  formatMwSigned,
  formatNumber,
  formatPct,
} from '../lib/format'
import { ChartCard } from '../components/ui/ChartCard'
import { KpiCard } from '../components/ui/KpiCard'
import { ErrorState, LoadingState, WaitingForApi } from '../components/ui/StateBlock'
import { PageShell } from '../components/layout/PageShell'
import { DailyErrorChart } from '../components/charts/DailyErrorChart'
import { HourProfileChart } from '../components/charts/HourProfileChart'
import { HorizonChart } from '../components/charts/HorizonChart'
import { ForecastScatter } from '../components/charts/ForecastScatter'

const KPI_LABELS = [
  'Window MAE',
  'Window RMSE',
  'Window bias',
  'Worst decision day',
  'Hours in shortfall',
] as const

interface OverviewPageProps {
  onOpenMethod: () => void
}

export function OverviewPage({ onOpenMethod }: OverviewPageProps) {
  const summary = useApiResource<SummaryResponse>('/summary')

  return (
    <PageShell
      title="How good were the gate-closure forecasts?"
      purpose="Every number below is measured against settled wind outturn for the January 2026 decision window. Positive error means the forecast ran above actual wind — a shortfall risk for a buyer."
    >
      {summary.status === 'loading' ? (
        <section aria-label="Loading overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {KPI_LABELS.map((label) => (
              <KpiCard key={label} label={label}>
                <LoadingState />
              </KpiCard>
            ))}
          </div>
        </section>
      ) : null}

      {summary.status === 'waiting' ? (
        <>
          <section aria-label="Overview KPIs waiting for the API">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {KPI_LABELS.map((label) => (
                <KpiCard key={label} label={label}>
                  <WaitingForApi
                    endpoint={summary.endpoint}
                    attempt={summary.attempt}
                    lastAttemptAt={summary.lastAttemptAt}
                    onRetry={summary.retry}
                    compact
                  />
                </KpiCard>
              ))}
            </div>
          </section>
          <section aria-label="Overview charts waiting for the API" className="space-y-4">
            {[CHART_TITLES.daily, CHART_TITLES.hour, CHART_TITLES.horizon, CHART_TITLES.scatter].map(
              (title) => (
                <ChartCard key={title} title={title}>
                  <WaitingForApi
                    endpoint={summary.endpoint}
                    attempt={summary.attempt}
                    lastAttemptAt={summary.lastAttemptAt}
                    onRetry={summary.retry}
                    compact
                  />
                </ChartCard>
              ),
            )}
          </section>
        </>
      ) : null}

      {summary.status === 'error' ? (
        <ErrorState
          error={summary.error}
          endpoint={summary.endpoint}
          onRetry={summary.retry}
        />
      ) : null}

      {summary.status === 'ready' && summary.data ? (
        <OverviewContent summary={summary.data} onOpenMethod={onOpenMethod} />
      ) : null}
    </PageShell>
  )
}

function OverviewContent({
  summary,
  onOpenMethod,
}: {
  summary: SummaryResponse
  onOpenMethod: () => void
}) {
  const { overall } = summary
  const biasPositive = overall.bias_mw > 0

  return (
    <>
      <section aria-label="Window KPIs">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            label="Window MAE"
            value={formatMw(overall.mae_mw)}
            sub={`${formatPct(overall.mae_pct_of_mean_actual)} of mean actual wind`}
          />
          <KpiCard
            label="Window RMSE"
            value={formatMw(overall.rmse_mw)}
            sub="Big misses count more than small ones"
          />
          <KpiCard
            label="Window bias"
            value={formatMwSigned(overall.bias_mw)}
            tone={biasPositive ? 'forecast' : 'positive'}
            sub={biasPositive ? 'Forecasts ran high on average' : 'Forecasts ran low on average'}
            footnote={
              <button
                type="button"
                onClick={onOpenMethod}
                className="rounded underline decoration-border underline-offset-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              >
                Metering-scope caveat
              </button>
            }
          />
          <KpiCard
            label="Worst decision day"
            value={formatDayShort(overall.worst_day.decision_date)}
            sub={`MAE ${formatMw(overall.worst_day.mae_mw)}`}
          />
          <KpiCard
            label="Hours in shortfall"
            value={formatPct(overall.hours_in_shortfall_pct)}
            sub={`of hours (${formatNumber(overall.hours_in_shortfall)} of ${formatNumber(
              overall.count,
            )})`}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border/60 border-l-4 border-l-accent bg-card p-5 shadow-card">
        <h2 className="text-base font-semibold text-fg">What this means</h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-fg">
          {takeawaySentence(summary)}
        </p>
        <p className="mt-2 text-xs text-muted">
          {formatDayShort(summary.window.decision_date_from)} —{' '}
          {formatDayShort(summary.window.decision_date_to)} decision dates ·{' '}
          {formatNumber(summary.window.decision_days)} decision days ·{' '}
          {formatNumber(summary.window.delivery_hours)} delivery hours ·{' '}
          {summary.window.timezone}
        </p>
      </section>

      <ChartCard title={CHART_TITLES.daily}>
        <DailyErrorChart rows={summary.by_day} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={CHART_TITLES.hour}>
          <HourProfileChart rows={summary.by_hour} />
        </ChartCard>
        <ChartCard title={CHART_TITLES.horizon}>
          <HorizonChart rows={summary.by_horizon} />
        </ChartCard>
      </div>

      <ChartCard title={CHART_TITLES.scatter}>
        <ForecastScatter rows={summary.scatter} />
      </ChartCard>
    </>
  )
}
