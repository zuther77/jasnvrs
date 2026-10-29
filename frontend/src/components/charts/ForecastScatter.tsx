import { useEffect, useRef } from 'react'
import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import type { ScatterRow } from '../../api/types'
import { CHART_SUBTITLES, COLORS } from '../../lib/constants'
import { sampleScatter, toScatterRows } from '../../lib/derived'
import {
  formatDay,
  formatHour,
  formatMwAxis,
  formatNumber,
  formatSignedNumber,
} from '../../lib/format'
import { ChartTable } from './ChartTable'

interface ScatterTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ReturnType<typeof toScatterRows>[number] }>
}

function ScatterTooltip({ active, payload }: ScatterTooltipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-fg">
        {formatDay(row.decision_date)} · {formatHour(row.delivery_hour_utc)} UTC
      </p>
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
          <dt>Gap</dt>
          <dd
            className={
              row.error_mw > 0
                ? 'num text-riskText'
                : row.error_mw < 0
                  ? 'num text-positive'
                  : 'num text-fg'
            }
          >
            {formatSignedNumber(row.error_mw)} MW (
            {row.error_mw > 0
              ? 'short'
              : row.error_mw < 0
                ? 'extra wind'
                : 'in line'}
            )
          </dd>
        </div>
      </dl>
    </div>
  )
}

interface ScatterDotProps {
  cx?: number
  cy?: number
}

function ScatterDot({ cx, cy }: ScatterDotProps) {
  if (cx === undefined || cy === undefined) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={2.6}
      fill={COLORS.actual}
      fillOpacity={0.55}
    />
  )
}

export function ForecastScatter({ rows }: { rows: ScatterRow[] }) {
  const figureRef = useRef<HTMLElement | null>(null)
  const chartRows = toScatterRows(rows)

  // Recharts hard-codes role="img" on each scatter symbol without a label.
  // The dots are decorative (the data table is the text alternative), so mark
  // them presentational whenever the chart (re)renders.
  useEffect(() => {
    const root = figureRef.current
    if (!root) return
    const markDecorative = () => {
      root
        .querySelectorAll<SVGGElement>('.recharts-scatter-symbol[role="img"]')
        .forEach((node) => {
          node.setAttribute('role', 'presentation')
          node.setAttribute('aria-hidden', 'true')
        })
    }
    markDecorative()
    const observer = new MutationObserver(markDecorative)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  const maxValue = chartRows.reduce(
    (max, row) => Math.max(max, row.actual_mw, row.forecast_mw),
    0,
  )
  const domainMax = Math.ceil(maxValue / 5000) * 5000
  const sample = sampleScatter(rows)

  return (
    <figure
      ref={figureRef}
      aria-label="Forecast against actual wind for every scored hour"
    >
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid stroke={COLORS.border} strokeOpacity={0.35} />
            <XAxis
              type="number"
              dataKey="actual_mw"
              name="Actual wind"
              domain={[0, domainMax]}
              tickFormatter={formatMwAxis}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="forecast_mw"
              name="Forecast wind"
              domain={[0, domainMax]}
              tickFormatter={formatMwAxis}
              width={72}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <ZAxis range={[14, 14]} />
            <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            <Legend
              verticalAlign="bottom"
              height={28}
              wrapperStyle={{ fontSize: 12, color: COLORS.muted, width: '100%', maxWidth: '100%' }}
            />
            <ReferenceLine
              segment={[
                { x: 0, y: 0 },
                { x: domainMax, y: domainMax },
              ]}
              stroke={COLORS.muted}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <Scatter
              name={`Hours scored (${formatNumber(rows.length)})`}
              data={chartRows}
              shape={<ScatterDot />}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-xs text-muted">
        Dashed line = forecast matched actual. Above it, the forecast was too high (the
        desk bought too little); below it, too low.
      </p>
      <figcaption className="mt-2 text-xs leading-snug text-muted">
        {CHART_SUBTITLES.scatter}
      </figcaption>
      <ChartTable
        caption="Forecast versus actual by hour"
        testId="table-scatter"
        note={sample.note}
        columns={[
          { label: 'Decision date' },
          { label: 'Hour (UTC)' },
          { label: 'Forecast (MW)', numeric: true },
          { label: 'Actual (MW)', numeric: true },
          { label: 'Gap (MW)', numeric: true },
        ]}
        rows={sample.rows.map((row) => [
          formatDay(row.decision_date),
          formatHour(row.delivery_hour_utc),
          formatNumber(row.forecast_mw),
          formatNumber(row.actual_mw),
          formatSignedNumber(row.error_mw),
        ])}
      />
    </figure>
  )
}
