import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ByHourRow, DaySeriesPoint } from '../../api/types'
import { BAND_LABEL, CHART_SUBTITLES, COLORS } from '../../lib/constants'
import { toDayChartRows } from '../../lib/derived'
import {
  formatHourSpan,
  formatMw,
  formatMwAxis,
  formatMwSigned,
  formatNumber,
} from '../../lib/format'
import { ChartTable } from './ChartTable'

interface DayTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ReturnType<typeof toDayChartRows>[number] }>
}

function DayTooltip({ active, payload }: DayTooltipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-fg">{formatHourSpan(row.hour_of_day)} UTC</p>
      <dl className="mt-1 space-y-0.5 text-muted">
        <div className="flex justify-between gap-4">
          <dt>Forecast</dt>
          <dd className="num text-forecast">{formatNumber(row.forecast_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Actual</dt>
          <dd className="num text-actualText">{formatNumber(row.actual_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Error</dt>
          <dd
            className={
              row.error_mw > 0
                ? 'num text-riskText'
                : row.error_mw < 0
                  ? 'num text-positive'
                  : 'num text-fg'
            }
          >
            {formatMwSigned(row.error_mw)} (
            {row.error_mw > 0
              ? 'shortfall'
              : row.error_mw < 0
                ? 'over-delivery'
                : 'in line'}
            )
          </dd>
        </div>
        {row.band_low_mw !== null && row.band_high_mw !== null ? (
          <div className="flex justify-between gap-4">
            <dt>Historical range</dt>
            <dd className="num text-fg">
              {formatMw(row.band_low_mw)} – {formatMw(row.band_high_mw)}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  )
}

interface DayForecastChartProps {
  series: DaySeriesPoint[]
  byHour?: ByHourRow[]
}

export function DayForecastChart({ series, byHour }: DayForecastChartProps) {
  const rows = toDayChartRows(series, byHour)
  const hasBand = Boolean(byHour && byHour.length > 0)

  return (
    <figure aria-label="Gate-closure forecast and actual wind for each delivery hour, with error ribbon and historical band">
      <div className="h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={COLORS.border}
              strokeOpacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              interval={1}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatMwAxis}
              width={72}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<DayTooltip />} />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ fontSize: 12, color: COLORS.muted }}
            />
            {hasBand ? (
              <Area
                dataKey="band"
                name="Historical 5–95% actual range"
                fill={COLORS.muted}
                fillOpacity={0.13}
                stroke="none"
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : null}
            {hasBand ? (
              <Line
                dataKey="band_low_mw"
                name="Band low"
                type="linear"
                stroke={COLORS.muted}
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : null}
            {hasBand ? (
              <Line
                dataKey="band_high_mw"
                name="Band high"
                type="linear"
                stroke={COLORS.muted}
                strokeDasharray="4 4"
                strokeWidth={1}
                dot={false}
                legendType="none"
                isAnimationActive={false}
                connectNulls={false}
              />
            ) : null}
            <Area
              dataKey="shortfall_ribbon"
              name="Shortfall ribbon (forecast above actual)"
              fill={COLORS.risk}
              fillOpacity={0.2}
              stroke="none"
              isAnimationActive={false}
              connectNulls={false}
              legendType="none"
            />
            <Area
              dataKey="overdelivery_ribbon"
              name="Over-delivery ribbon (forecast below actual)"
              fill={COLORS.positive}
              fillOpacity={0.2}
              stroke="none"
              isAnimationActive={false}
              connectNulls={false}
              legendType="none"
            />
            <Line
              dataKey="forecast_mw"
              name="Forecast (gate closure)"
              type="monotone"
              stroke={COLORS.forecast}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="actual_mw"
              name="Actual"
              type="monotone"
              stroke={COLORS.actual}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>
          Solid amber = forecast; dashed blue = actual.
        </span>
        <span>
          Shading: <span className="text-riskText">red = shortfall</span>,{' '}
          <span className="text-positive">green = over-delivery</span>.
        </span>
        {hasBand ? <span>{BAND_LABEL}</span> : null}
      </div>
      <figcaption className="mt-2 text-xs leading-snug text-muted">
        {CHART_SUBTITLES.dayForecast}
      </figcaption>
      <ChartTable
        caption="Delivery-hour forecast and actual series"
        testId="table-day-series"
        columns={[
          { label: 'Delivery hour (UTC)' },
          { label: 'Forecast (MW)', numeric: true },
          { label: 'Actual (MW)', numeric: true },
          { label: 'Error (MW)', numeric: true },
          { label: 'Historical low (MW)', numeric: true },
          { label: 'Historical high (MW)', numeric: true },
        ]}
        rows={rows.map((row) => [
          formatHourSpan(row.hour_of_day),
          formatNumber(row.forecast_mw),
          formatNumber(row.actual_mw),
          formatMwSigned(row.error_mw),
          row.band_low_mw !== null ? formatNumber(row.band_low_mw) : '—',
          row.band_high_mw !== null ? formatNumber(row.band_high_mw) : '—',
        ])}
      />
    </figure>
  )
}
