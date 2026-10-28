import {
  Area,
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
import type { ByHourRow } from '../../api/types'
import { CHART_SUBTITLES, COLORS } from '../../lib/constants'
import { toHourRows } from '../../lib/derived'
import {
  formatHourSpan,
  formatMwAxis,
  formatNumber,
  formatSignedNumber,
} from '../../lib/format'
import { ChartTable } from './ChartTable'

interface HourTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ReturnType<typeof toHourRows>[number] }>
}

function HourTooltip({ active, payload }: HourTooltipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-fg">{formatHourSpan(row.hour_of_day)} UTC</p>
      <dl className="mt-1 space-y-0.5 text-muted">
        <div className="flex justify-between gap-4">
          <dt>MAE</dt>
          <dd className="num text-fg">{formatNumber(row.mae_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Bias</dt>
          <dd className="num text-forecast">{formatSignedNumber(row.bias_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Error P05–P95</dt>
          <dd className="num text-fg">
            {formatSignedNumber(row.p05_mw)} to {formatSignedNumber(row.p95_mw)} MW
          </dd>
        </div>
      </dl>
    </div>
  )
}

export function HourProfileChart({ rows }: { rows: ByHourRow[] }) {
  const chartRows = toHourRows(rows)
  return (
    <figure aria-label="Hour-of-day mean absolute error bars, bias line and P05 to P95 error band">
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
              interval={1}
              tick={{ fill: COLORS.muted, fontSize: 10 }}
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
            <Tooltip content={<HourTooltip />} cursor={{ fill: 'rgba(71, 85, 105, 0.18)' }} />
            <Legend
              verticalAlign="bottom"
              height={28}
              wrapperStyle={{ fontSize: 12, color: COLORS.muted, width: '100%', maxWidth: '100%' }}
            />
            <ReferenceLine y={0} stroke={COLORS.border} strokeDasharray="3 3" />
            <Area
              dataKey="band"
              name="P05–P95 error range"
              fill={COLORS.muted}
              fillOpacity={0.18}
              stroke="none"
              isAnimationActive={false}
            />
            <Bar
              dataKey="mae_mw"
              name="MAE (MW)"
              fill={COLORS.actual}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            <Line
              dataKey="bias_mw"
              name="Bias (MW, positive = ran high)"
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
        {CHART_SUBTITLES.hour}
      </figcaption>
      <ChartTable
        caption="Hour-of-day error profile"
        testId="table-hour-profile"
        columns={[
          { label: 'Delivery hour (UTC)' },
          { label: 'MAE (MW)', numeric: true },
          { label: 'Bias (MW)', numeric: true },
          { label: 'P05 error (MW)', numeric: true },
          { label: 'P50 error (MW)', numeric: true },
          { label: 'P95 error (MW)', numeric: true },
          { label: 'Hours', numeric: true },
        ]}
        rows={rows.map((row) => [
          formatHourSpan(row.hour_of_day),
          formatNumber(row.mae_mw),
          formatSignedNumber(row.bias_mw),
          formatSignedNumber(row.p05_mw),
          formatSignedNumber(row.p50_mw),
          formatSignedNumber(row.p95_mw),
          formatNumber(row.count),
        ])}
      />
    </figure>
  )
}
