import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ForecastResponse } from '../../api/types'
import { CHART_SUBTITLES, COLORS } from '../../lib/constants'
import { buildFan } from '../../lib/derived'
import type { FanRow, FanSeries } from '../../lib/derived'
import { formatHourOfDay, formatMwAxis, formatNumber } from '../../lib/format'
import { ChartTable } from './ChartTable'

interface FanTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: FanRow }>
  series?: FanSeries[]
}

function FanTooltip({ active, payload, series = [] }: FanTooltipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-fg">{String(row.hour_label)} UTC</p>
      <dl className="mt-1 space-y-0.5 text-muted">
        {series.map((line) => {
          const value = row[line.key]
          return (
            <div key={line.key} className="flex justify-between gap-4">
              <dt className={line.issue.is_gate_closure ? 'text-forecast' : undefined}>
                {line.label}
              </dt>
              <dd className="num text-fg">
                {typeof value === 'number' ? `${formatNumber(value)} MW` : '—'}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

function FanLegend({ series }: { series: FanSeries[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
      {series.map((line) => {
        const isGate = line.issue.is_gate_closure
        const usable = line.issue.is_usable_at_gate_closure
        return (
          <li key={line.key} className="inline-flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block w-6 border-t"
              style={{
                borderTopColor: isGate ? COLORS.forecast : COLORS.preGate,
                borderTopWidth: isGate ? 3 : 1,
                borderTopStyle: usable ? 'solid' : 'dashed',
                opacity: usable ? 1 : 0.4,
              }}
            />
            <span className={isGate ? 'text-forecast' : undefined}>{line.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

export function VintageFan({ forecast }: { forecast: ForecastResponse }) {
  const model = buildFan(forecast)

  const tableRows = model.rows.map((row) => [
    `${formatHourOfDay(row.hour_of_day)}`,
    ...model.series.map((line) => {
      const value = row[line.key]
      return typeof value === 'number' ? formatNumber(value) : '—'
    }),
  ])

  return (
    <figure aria-label="Every forecast version issued on the decision date, one line per version">
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={model.rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={COLORS.border}
              strokeOpacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="hour_label"
              interval={2}
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
            <Tooltip content={<FanTooltip series={model.series} />} />
            {model.series.map((line) => {
              const isGate = line.issue.is_gate_closure
              const usable = line.issue.is_usable_at_gate_closure
              return (
                <Line
                  key={line.key}
                  dataKey={line.key}
                  name={line.label}
                  type="monotone"
                  stroke={isGate ? COLORS.forecast : COLORS.preGate}
                  strokeWidth={isGate ? 2.5 : 1}
                  strokeDasharray={usable ? undefined : '4 3'}
                  strokeOpacity={usable ? 1 : 0.4}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              )
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <FanLegend series={model.series} />
      <p className="mt-2 text-xs text-muted">
        {model.usableCount} of {model.issueCount} versions were published before the cut-off.
      </p>
      <figcaption className="mt-2 text-xs leading-snug text-muted">
        {CHART_SUBTITLES.fan}
      </figcaption>
      <ChartTable
        caption="Forecast wind by version and delivery hour"
        testId="table-vintage-fan"
        columns={[
          { label: 'Hour (UTC)' },
          ...model.series.map((line) => ({ label: line.label, numeric: true })),
        ]}
        rows={tableRows}
      />
    </figure>
  )
}
