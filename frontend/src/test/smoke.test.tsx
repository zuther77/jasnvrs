import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { metaFixture } from './fixtures/meta'
import { summaryFixture } from './fixtures/summary'
import { daysFixture } from './fixtures/days'
import { makeDayFixture } from './fixtures/day'
import { makeForecastFixture } from './fixtures/forecast'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function installRoutes(): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const raw =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const path = raw.replace(/^https?:\/\/[^/]+/, '')

    if (path === '/api/meta') return jsonResponse(metaFixture)
    if (path === '/api/summary') return jsonResponse(summaryFixture)
    if (path === '/api/days') return jsonResponse(daysFixture)

    const dayMatch = /^\/api\/days\/(\d{4}-\d{2}-\d{2})$/.exec(path)
    if (dayMatch) return jsonResponse(makeDayFixture(dayMatch[1]))

    const forecastMatch = /^\/api\/forecast\/(\d{4}-\d{2}-\d{2})$/.exec(path)
    if (forecastMatch) return jsonResponse(makeForecastFixture(forecastMatch[1]))

    return jsonResponse({ detail: 'Not Found' }, 404)
  })

  vi.stubGlobal('fetch', fetchMock)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Wind Forecast Insights Portal smoke tests', () => {
  it('renders Overview KPIs and the 31-row daily table from a stubbed summary', async () => {
    installRoutes()
    render(<App />)

    expect(await screen.findByText('What this means')).toBeInTheDocument()
    expect(screen.getAllByText('2,013 MW').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2,506 MW').length).toBeGreaterThan(0)
    expect(screen.getAllByText('+1,730 MW').length).toBeGreaterThan(0)
    expect(screen.getAllByText('84.3%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Forecasts ran high on average').length).toBeGreaterThan(0)

    const dailyTable = await screen.findByTestId('table-daily-error')
    expect(dailyTable.querySelectorAll('tbody tr')).toHaveLength(31)
  })

  it('renders the 5 Jan decision header, gate-closure pill and energy row', async () => {
    const user = userEvent.setup()
    installRoutes()
    render(<App />)

    await user.click(screen.getByRole('tab', { name: 'Decision Day' }))

    const picker = await screen.findByLabelText('Decision date')
    await user.selectOptions(picker, '2026-01-05')

    expect(
      await screen.findByText('Forecast as known at 09:30 UTC, 5 Jan 2026'),
    ).toBeInTheDocument()
    expect(screen.getByText('Gate closure 09:50 UTC')).toBeInTheDocument()
    expect(screen.getAllByText('275.1 GWh').length).toBeGreaterThan(0)
    expect(screen.getAllByText('226.8 GWh').length).toBeGreaterThan(0)

    const seriesTable = await screen.findByTestId('table-day-series')
    expect(seriesTable.querySelectorAll('tbody tr')).toHaveLength(24)
  })

  it('shows a waiting state with no numeric MW or GWh output when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )

    render(<App />)
    const states = await screen.findAllByTestId('waiting-api')
    expect(states.length).toBeGreaterThan(0)

    const text = document.body.textContent ?? ''
    expect(text).toContain('Waiting for API')
    expect(text).not.toMatch(/\d[\d,.]*\s*(MW|GWh)/)
  })
})
