export const COLORS = {
  bg: '#0F172A',
  card: '#1B2336',
  fg: '#F8FAFC',
  muted: '#94A3B8',
  border: '#475569',
  actual: '#3B82F6',
  forecast: '#F59E0B',
  risk: '#EF4444',
  positive: '#22C55E',
  accent: '#22C55E',
  preGate: '#64748B',
} as const

export const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', panelId: 'panel-overview' },
  { id: 'decision', label: 'Decision Day', panelId: 'panel-decision' },
  { id: 'method', label: 'Method', panelId: 'panel-method' },
] as const

export type TabId = (typeof NAV_ITEMS)[number]['id']

export const CHART_SUBTITLES = {
  daily: 'Average miss and signed bias for each of the 31 January decision days.',
  hour: 'Which delivery hours are hardest to forecast; band is the 5–95% error range.',
  horizon: 'How error grows with lead time — the cost of forecasting earlier.',
  scatter: 'Every evaluated hour: points above the diagonal were over-forecast.',
  dayForecast:
    'The forecast the desk could act on at gate closure, against what wind actually delivered.',
  fan: 'Every forecast published on the decision date; the gate-closure issue is highlighted.',
} as const

export const CHART_TITLES = {
  daily: 'Daily error and bias',
  hour: 'Hour-of-day error profile',
  horizon: 'Error by forecast horizon',
  scatter: 'Forecast vs actual, every hour',
  dayForecast: 'Gate-closure forecast against delivery',
  fan: 'Forecast vintage fan',
} as const

export const AXIS_LABELS = {
  mw: 'MW',
  horizon: 'Forecast horizon',
  hour: 'Delivery hour (UTC)',
  actual: 'Actual wind (MW)',
  forecast: 'Forecast wind (MW)',
} as const

export const BAND_LABEL =
  'Historical 5–95% actual range for this hour (January 2026), from the window error percentiles.'
