import { useRef } from 'react'
import type { KeyboardEvent } from 'react'
import type { MetaResponse } from '../../api/types'
import { useApiResource } from '../../api/useApiResource'
import { NAV_ITEMS } from '../../lib/constants'
import type { TabId } from '../../lib/constants'
import { formatDayShort, formatTimestamp } from '../../lib/format'
import { Badge } from '../ui/Badge'

interface TopBarProps {
  activeTab: TabId
  onSelectTab: (tab: TabId) => void
}

function TurbineMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 40 40"
      className="h-9 w-9 shrink-0"
      fill="none"
    >
      <rect width="40" height="40" rx="9" fill="#0F172A" />
      <path d="M20 18v16" stroke="#F8FAFC" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="20" cy="16" r="2.5" fill="#F59E0B" />
      <path
        d="M20 16 30 9M20 16 29 25M20 16 10 12"
        stroke="#22C55E"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function TopBar({ activeTab, onSelectTab }: TopBarProps) {
  const meta = useApiResource<MetaResponse>('/meta')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % NAV_ITEMS.length
    if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + NAV_ITEMS.length) % NAV_ITEMS.length
    }
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = NAV_ITEMS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    onSelectTab(NAV_ITEMS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

  let badge: { tone: 'neutral' | 'forecast' | 'risk'; text: string }
  if (meta.status === 'ready' && meta.data) {
    badge = {
      tone: meta.data.data_vintage.last_sync_status === 'ok' ? 'neutral' : 'forecast',
      text: `Data through ${formatDayShort(
        meta.data.window.decision_date_to,
      )} · synced ${formatTimestamp(meta.data.data_vintage.last_sync_at)}`,
    }
  } else if (meta.status === 'error') {
    badge = { tone: 'risk', text: 'API unavailable' }
  } else {
    badge = { tone: 'forecast', text: 'Connecting to API…' }
  }

  return (
    <header className="border-b border-border/50 bg-card/60">
      <div className="mx-auto flex w-full max-w-content flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <TurbineMark />
          <div>
            <p className="text-sm font-semibold leading-tight text-fg sm:text-base">
              Wind Forecast Insights Portal
            </p>
            <p className="text-xs text-muted">
              Gate-closure forecast quality · GB national wind
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
          <nav aria-label="Primary">
            <div
              role="tablist"
              aria-label="Sections"
              className="flex gap-1 rounded-lg border border-border/50 bg-bg/60 p-1"
            >
              {NAV_ITEMS.map((item, index) => {
                const selected = item.id === activeTab
                return (
                  <button
                    key={item.id}
                    ref={(element) => {
                      tabRefs.current[index] = element
                    }}
                    id={`tab-${item.id}`}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    aria-controls={item.panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => onSelectTab(item.id)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${
                      selected
                        ? 'bg-card text-fg shadow-sm'
                        : 'text-muted hover:bg-border/20 hover:text-fg'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </nav>
          <div aria-live="polite" className="lg:min-w-[19rem] lg:text-right">
            <Badge tone={badge.tone}>{badge.text}</Badge>
          </div>
        </div>
      </div>
    </header>
  )
}
