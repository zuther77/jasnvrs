import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ByDayRow } from '../../api/types'
import { CHART_SUBTITLES } from '../../lib/constants'
import { COLORS } from '../../lib/constants'
import { formatDay, formatMwAxis, formatNumber, formatSignedNumber } from '../../lib/format'
import { toDailyRows } from '../../lib/derived'
import { ChartTable } from './ChartTable'

interface DailyTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ReturnType<typeof toDailyRows>[number] }>
}

function DailyTooltip({ active, payload }: DailyTooltipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-fg">{row.fullLabel}</p>
      <dl className="mt-1 space-y-0.5 text-muted">
        <div className="flex justify-between gap-4">
          <dt>Average miss</dt>
          <dd className="num text-fg">{formatNumber(row.mae_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Ran high (+)</dt>
          <dd className="num text-forecast">{formatSignedNumber(row.bias_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Hours scored</dt>
          <dd className="num text-fg">{formatNumber(row.hours_evaluated)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function DailyErrorChart({ rows }: { rows: ByDayRow[] }) {
  const chartRows = toDailyRows(rows)
  return (
    <figure aria-label="Average miss bars and ran-high line for each decision day">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={COLORS.border}
              strokeOpacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="label"
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
            <Tooltip content={<DailyTooltip />} cursor={{ fill: 'rgba(71, 85, 105, 0.18)' }} />
            <Legend
              verticalAlign="bottom"
              height={28}
              wrapperStyle={{ fontSize: 12, color: COLORS.muted, width: '100%', maxWidth: '100%' }}
            />
            <ReferenceLine y={0} stroke={COLORS.border} strokeDasharray="3 3" />
            <Bar
              dataKey="mae_mw"
              name="Average miss"
              fill={COLORS.actual}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="bias_mw"
              name="Ran high (+)"
              type="monotone"
              stroke={COLORS.forecast}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 text-xs leading-snug text-muted">
        {CHART_SUBTITLES.daily}
      </figcaption>
      <ChartTable
        caption="Average miss by decision day"
        testId="table-daily-error"
        columns={[
          { label: 'Decision date' },
          { label: 'Delivery date' },
          { label: 'Average miss (MW)', numeric: true },
          { label: 'Big-miss (MW)', numeric: true },
          { label: 'Ran high (MW)', numeric: true },
          { label: 'Hours', numeric: true },
        ]}
        rows={rows.map((row) => [
          formatDay(row.decision_date),
          formatDay(row.delivery_date),
          formatNumber(row.mae_mw),
          formatNumber(row.rmse_mw),
          formatSignedNumber(row.bias_mw),
          formatNumber(row.hours_evaluated),
        ])}
      />
    </figure>
  )
}
