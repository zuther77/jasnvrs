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
    <section aria-label="How this day's forecast did">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Average miss"
          value={formatMw(metrics.mae_mw)}
          sub="A typical hour on this day"
        />
        <KpiCard
          label="Big-miss measure"
          value={formatMw(metrics.rmse_mw)}
          sub="Big misses count for more"
        />
        <KpiCard
          label="Forecast ran high"
          value={formatMwSigned(metrics.bias_mw)}
          tone={biasPositive ? 'forecast' : 'positive'}
          sub={biasPositive ? 'on average — buy cover for this gap' : 'on average — wind beat the forecast'}
        />
        <KpiCard
          label="Worst short hour"
          value={formatMw(extremes.max_shortfall_mw)}
          tone="risk"
          sub={
            shortfallHour
              ? `${shortfallHour} — ${formatMw(extremes.max_shortfall_mw)} below forecast`
              : 'Nothing short on this day'
          }
        />
        <KpiCard
          label="Most over-bought hour"
          value={formatMw(Math.abs(extremes.max_overdelivery_mw))}
          tone="positive"
          sub={
            overdeliveryHour
              ? `${overdeliveryHour} — ${formatMw(Math.abs(extremes.max_overdelivery_mw))} more wind than forecast`
              : 'No hour with extra wind on this day'
          }
        />
      </div>
    </section>
  )
}
