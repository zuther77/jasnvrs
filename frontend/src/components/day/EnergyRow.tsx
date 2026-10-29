import type { DaySummaryTotals } from '../../api/types'
import { formatGwh, formatHour, formatMw } from '../../lib/format'
import { KpiCard } from '../ui/KpiCard'

export function EnergyRow({ summary }: { summary: DaySummaryTotals }) {
  return (
    <section aria-label="Delivery-day energy">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Forecast wind energy"
          value={formatGwh(summary.forecast_total_mwh)}
          sub="What we expected across the 24 hours"
        />
        <KpiCard
          label="Actual wind energy"
          value={formatGwh(summary.actual_total_mwh)}
          sub="What wind actually delivered"
        />
        <KpiCard
          label="Average forecast"
          value={formatMw(summary.forecast_avg_mw)}
          sub={`Actual average ${formatMw(summary.actual_avg_mw)}`}
        />
        <KpiCard
          label="Peak and low hour"
          value={`${formatMw(summary.forecast_peak_mw)} peak`}
          sub={`Peak at ${formatHour(summary.forecast_peak_hour_utc)} · low ${formatMw(
            summary.forecast_min_mw,
          )} at ${formatHour(summary.forecast_min_hour_utc)}`}
        />
      </div>
    </section>
  )
}
