import { useCallback, useState } from 'react'
import type { TabId } from './lib/constants'
import { TopBar } from './components/layout/TopBar'
import { OverviewPage } from './pages/OverviewPage'
import { DecisionDayPage } from './pages/DecisionDayPage'
import { MethodPage } from './pages/MethodPage'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [selectedDecisionDate, setSelectedDecisionDate] = useState<string | null>(null)

  const openMethod = useCallback(() => setActiveTab('method'), [])

  return (
    <div className="min-h-screen bg-bg text-fg">
      <a
        href="#main-content"
        className="sr-only rounded focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Skip to main content
      </a>
      <TopBar activeTab={activeTab} onSelectTab={setActiveTab} />
      <main id="main-content">
        {activeTab === 'overview' ? (
          <section
            role="tabpanel"
            id="panel-overview"
            aria-labelledby="tab-overview"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <OverviewPage onOpenMethod={openMethod} />
          </section>
        ) : null}

        {activeTab === 'decision' ? (
          <section
            role="tabpanel"
            id="panel-decision"
            aria-labelledby="tab-decision"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <DecisionDayPage
              selectedDate={selectedDecisionDate}
              onSelectDate={setSelectedDecisionDate}
              onOpenMethod={openMethod}
            />
          </section>
        ) : null}

        {activeTab === 'method' ? (
          <section
            role="tabpanel"
            id="panel-method"
            aria-labelledby="tab-method"
            tabIndex={0}
            className="focus-visible:outline-none"
          >
            <MethodPage />
          </section>
        ) : null}
      </main>
      <p className="sr-only" aria-live="polite">
        {activeTab === 'overview'
          ? 'Overview panel shown'
          : activeTab === 'decision'
            ? 'Decision Day panel shown'
            : 'Method panel shown'}
      </p>
    </div>
  )
}
