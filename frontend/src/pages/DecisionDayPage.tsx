import { useEffect } from 'react'
import type {
  DayResponse,
  DaysResponse,
  ForecastResponse,
  SummaryResponse,
} from '../api/types'
import { useApiResource } from '../api/useApiResource'
import { describeApiError, isEmptyDayError } from '../api/client'
import { CHART_TITLES } from '../lib/constants'
import { PageShell } from '../components/layout/PageShell'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ChartCard } from '../components/ui/ChartCard'
import {
  EmptyDay,
  ErrorState,
  LoadingState,
  WaitingForApi,
} from '../components/ui/StateBlock'
import { DayPicker } from '../components/day/DayPicker'
import { ContextHeader } from '../components/day/ContextHeader'
import { EnergyRow } from '../components/day/EnergyRow'
import { DayMetricsRow } from '../components/day/DayMetricsRow'
import { DecisionNote } from '../components/day/DecisionNote'
import { DayForecastChart } from '../components/charts/DayForecastChart'
import { VintageFan } from '../components/charts/VintageFan'

interface DecisionDayPageProps {
  selectedDate: string | null
  onSelectDate: (decisionDate: string) => void
  onOpenMethod: () => void
}

export function DecisionDayPage({
  selectedDate,
  onSelectDate,
  onOpenMethod,
}: DecisionDayPageProps) {
  const days = useApiResource<DaysResponse>('/days')
  const summary = useApiResource<SummaryResponse>('/summary')
  const day = useApiResource<DayResponse>(selectedDate ? `/days/${selectedDate}` : '', {
    enabled: Boolean(selectedDate),
  })
  const forecast = useApiResource<ForecastResponse>(
    selectedDate ? `/forecast/${selectedDate}` : '',
    { enabled: Boolean(selectedDate) },
  )

  useEffect(() => {
    if (days.status !== 'ready' || !days.data) return
    const rows = days.data.days
    if (rows.length === 0) return
    const exists = rows.some((row) => row.decision_date === selectedDate)
    if (!exists) onSelectDate(rows[rows.length - 1].decision_date)
  }, [days.status, days.data, selectedDate, onSelectDate])

  const latestDate = days.data?.days[days.data.days.length - 1]?.decision_date ?? null

  return (
    <PageShell
      title="What the desk saw before bidding"
      purpose="Pick a trading day to see the forecast the desk had at the 09:50 cut-off, what wind actually delivered, and how close the call turned out."
    >
      {days.status === 'loading' ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <LoadingState label="Loading trading days" />
        </div>
      ) : null}

      {days.status === 'waiting' ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <WaitingForApi
            endpoint={days.endpoint}
            attempt={days.attempt}
            lastAttemptAt={days.lastAttemptAt}
            onRetry={days.retry}
          />
        </div>
      ) : null}

      {days.status === 'error' ? (
        <ErrorState error={days.error} endpoint={days.endpoint} onRetry={days.retry} />
      ) : null}

      {days.status === 'ready' && days.data && selectedDate ? (
        <>
          <DayPicker
            days={days.data.days}
            selectedDate={selectedDate}
            onSelect={onSelectDate}
          />

          {day.status === 'loading' ? (
            <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
              <LoadingState label="Loading this day" />
            </div>
          ) : null}

          {day.status === 'waiting' ? (
            <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
              <WaitingForApi
                endpoint={day.endpoint}
                attempt={day.attempt}
                lastAttemptAt={day.lastAttemptAt}
                onRetry={day.retry}
              />
            </div>
          ) : null}

          {day.status === 'error' ? (
            isEmptyDayError(day.error) ? (
              <EmptyDay
                detail={describeApiError(day.error)}
                onBackToLatest={() => latestDate && onSelectDate(latestDate)}
              />
            ) : (
              <ErrorState error={day.error} endpoint={day.endpoint} onRetry={day.retry} />
            )
          ) : null}

          {day.status === 'ready' && day.data ? (
            <DayContent
              day={day.data}
              summary={summary}
              forecast={forecast}
              onOpenMethod={onOpenMethod}
            />
          ) : null}
        </>
      ) : null}

      {days.status === 'ready' && !selectedDate ? (
        <div className="rounded-xl border border-border/60 bg-card p-5 shadow-card">
          <LoadingState label="Selecting the latest day" />
        </div>
      ) : null}
    </PageShell>
  )
}

interface DayContentProps {
  day: DayResponse
  summary: ReturnType<typeof useApiResource<SummaryResponse>>
  forecast: ReturnType<typeof useApiResource<ForecastResponse>>
  onOpenMethod: () => void
}

function DayContent({ day, summary, forecast, onOpenMethod }: DayContentProps) {
  const bandHours = summary.status === 'ready' && summary.data ? summary.data.by_hour : undefined

  return (
    <>
      <ContextHeader day={day} />
      <EnergyRow summary={day.summary} />

      <ChartCard
        title={CHART_TITLES.dayForecast}
        badge={
          <Badge tone="forecast">
            Forecast used: {day.gate_closure_issue_time_utc} UTC version
          </Badge>
        }
      >
        <BandStatus summary={summary} />
        <DayForecastChart series={day.series} byHour={bandHours} />
      </ChartCard>

      <ChartCard title={CHART_TITLES.fan}>
        {forecast.status === 'ready' && forecast.data ? (
          <VintageFan forecast={forecast.data} />
        ) : null}
        {forecast.status === 'loading' ? <LoadingState label="Loading forecast versions" /> : null}
        {forecast.status === 'waiting' ? (
          <WaitingForApi
            endpoint={forecast.endpoint}
            attempt={forecast.attempt}
            lastAttemptAt={forecast.lastAttemptAt}
            onRetry={forecast.retry}
          />
        ) : null}
        {forecast.status === 'error' ? (
          <ErrorState
            error={forecast.error}
            endpoint={forecast.endpoint}
            onRetry={forecast.retry}
            compact
          />
        ) : null}
      </ChartCard>

      <DayMetricsRow metrics={day.metrics} extremes={day.extremes} />
      <DecisionNote day={day} onOpenMethod={onOpenMethod} />
    </>
  )
}

function BandStatus({
  summary,
}: {
  summary: ReturnType<typeof useApiResource<SummaryResponse>>
}) {
  if (summary.status === 'ready') return null

  if (summary.status === 'waiting' || summary.status === 'loading') {
    return (
      <p
        data-testid="band-waiting"
        className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-forecast/30 bg-forecast/5 px-3 py-2 text-xs text-muted"
      >
        <span>
          Normal range still loading from{' '}
          <code className="num text-muted">{summary.endpoint}</code> — the chart works
          without it.
        </span>
        <Button variant="ghost" className="px-2 py-1 text-xs" onClick={summary.retry}>
          Retry range
        </Button>
      </p>
    )
  }

  return (
    <p
      role="status"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-risk/40 bg-risk/5 px-3 py-2 text-xs text-muted"
    >
      <span>
        Normal range unavailable: {describeApiError(summary.error)} (
        <code className="num text-muted">{summary.endpoint}</code>)
      </span>
      <Button variant="ghost" className="px-2 py-1 text-xs" onClick={summary.retry}>
        Retry range
      </Button>
    </p>
  )
}
