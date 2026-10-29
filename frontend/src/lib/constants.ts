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
  daily: 'Each bar is one January trading day; the line shows how far the forecast ran above or below what arrived.',
  hour: 'Which times of day are hardest to call. The shaded band covers 9 in 10 January hours.',
  horizon: 'The same forecast, scored from a few hours ahead to two days ahead — earlier calls miss by more.',
  scatter:
    'Each dot is one delivery hour. Dots above the diagonal mean the forecast was too high, so the desk had to buy more at short notice.',
  dayForecast:
    'The forecast the desk had at the 09:50 cut-off, against what wind actually delivered.',
  fan: 'Every forecast version issued on the decision date. Only versions published before the 09:50 cut-off could be used; the 09:30 one is scored here.',
} as const

export const CHART_TITLES = {
  daily: 'Average miss, day by day',
  hour: 'Average miss by time of day',
  horizon: 'Miss grows the further ahead you look',
  scatter: 'Forecast vs what actually arrived',
  dayForecast: 'Forecast at the cut-off vs actual wind',
  fan: 'Forecast versions issued that day',
} as const

export const AXIS_LABELS = {
  mw: 'MW',
  horizon: 'Hours ahead of delivery',
  hour: 'Time of day (UTC)',
  actual: 'Actual wind (MW)',
  forecast: 'Forecast wind (MW)',
} as const

export const BAND_LABEL =
  'Shaded band: where 9 in 10 January hours landed for this time of day.'
