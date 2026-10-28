import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ByHorizonRow } from '../../api/types'
import { CHART_SUBTITLES, COLORS } from '../../lib/constants'
import { toHorizonRows } from '../../lib/derived'
import { formatMwAxis, formatNumber, formatSignedNumber } from '../../lib/format'
import { ChartTable } from './ChartTable'

interface HorizonTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: ReturnType<typeof toHorizonRows>[number] }>
}

function HorizonTooltip({ active, payload }: HorizonTooltipProps) {
  const row = payload?.[0]?.payload
  if (!active || !row) return null
  return (
    <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-xs shadow-card">
      <p className="font-semibold text-fg">
        {row.horizon_start_h}–{row.horizon_end_h} h horizon
      </p>
      <dl className="mt-1 space-y-0.5 text-muted">
        <div className="flex justify-between gap-4">
          <dt>MAE</dt>
          <dd className="num text-fg">{formatNumber(row.mae_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>RMSE</dt>
          <dd className="num text-fg">{formatNumber(row.rmse_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Bias</dt>
          <dd className="num text-forecast">{formatSignedNumber(row.bias_mw)} MW</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Pairs</dt>
          <dd className="num text-fg">{formatNumber(row.count)}</dd>
        </div>
      </dl>
    </div>
  )
}

export function HorizonChart({ rows }: { rows: ByHorizonRow[] }) {
  const chartRows = toHorizonRows(rows)
  return (
    <figure aria-label="Grouped bars of MAE and RMSE by forecast horizon bucket">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartRows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid
              stroke={COLORS.border}
              strokeOpacity={0.35}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: COLORS.muted, fontSize: 10 }}
              axisLine={{ stroke: COLORS.border }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tickFormatter={formatMwAxis}
              width={72}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<HorizonTooltip />} cursor={{ fill: 'rgba(71, 85, 105, 0.18)' }} />
            <Legend
              verticalAlign="bottom"
              height={28}
              wrapperStyle={{ fontSize: 12, color: COLORS.muted, width: '100%', maxWidth: '100%' }}
            />
            <Bar
              dataKey="mae_mw"
              name="MAE (MW)"
              fill={COLORS.actual}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
            <Bar
              dataKey="rmse_mw"
              name="RMSE (MW)"
              fill={COLORS.forecast}
              fillOpacity={0.75}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-3 text-xs leading-snug text-muted">
        {CHART_SUBTITLES.horizon}
      </figcaption>
      <ChartTable
        caption="Error by forecast horizon bucket"
        testId="table-horizon"
        columns={[
          { label: 'Horizon' },
          { label: 'MAE (MW)', numeric: true },
          { label: 'RMSE (MW)', numeric: true },
          { label: 'Bias (MW)', numeric: true },
          { label: 'Pairs', numeric: true },
        ]}
        rows={rows.map((row) => [
          `${row.horizon_start_h}–${row.horizon_end_h} h`,
          formatNumber(row.mae_mw),
          formatNumber(row.rmse_mw),
          formatSignedNumber(row.bias_mw),
          formatNumber(row.count),
        ])}
      />
    </figure>
  )
}
