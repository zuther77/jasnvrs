import type { DayExtremes, DayMetrics } from '../../api/types'
import { formatHour, formatMw, formatMwSigned } from '../../lib/format'
import { KpiCard } from '../ui/KpiCard'

interface DayMetricsRowProps {
  metrics: DayMetrics
  extremes: DayExtremes
}

export function DayMetricsRow({ metrics, extremes }: DayMetricsRowProps) {
  const biasPositive = metrics.bias_mw > 0
  const shortfallHour =
    extremes.max_shortfall_hour_utc !== null
      ? formatHour(extremes.max_shortfall_hour_utc)
      : null
  const overdeliveryHour =
    extremes.max_overdelivery_hour_utc !== null
      ? formatHour(extremes.max_overdelivery_hour_utc)
      : null

  return (
    <section aria-label="Delivery-day forecast metrics">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="MAE" value={formatMw(metrics.mae_mw)} sub="Mean absolute error" />
        <KpiCard label="RMSE" value={formatMw(metrics.rmse_mw)} sub="Big misses count more" />
        <KpiCard
          label="Bias"
          value={formatMwSigned(metrics.bias_mw)}
          tone={biasPositive ? 'forecast' : 'positive'}
          sub={biasPositive ? 'Forecast ran high' : 'Forecast ran low'}
        />
        <KpiCard
          label="Biggest shortfall"
          value={formatMw(extremes.max_shortfall_mw)}
          tone="risk"
          sub={
            shortfallHour
              ? `Largest hour where actual fell short, at ${shortfallHour}`
              : 'No shortfall hour on this delivery day'
          }
        />
        <KpiCard
          label="Biggest over-delivery"
          value={formatMwSigned(extremes.max_overdelivery_mw)}
          tone="positive"
          sub={
            overdeliveryHour
              ? `Largest hour where wind beat the forecast, at ${overdeliveryHour}`
              : 'No over-delivery hour on this delivery day'
          }
        />
      </div>
    </section>
  )
}
