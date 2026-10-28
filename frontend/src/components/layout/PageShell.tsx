import type { ReactNode } from 'react'

interface PageShellProps {
  title: string
  purpose: string
  children: ReactNode
}

export function PageShell({ title, purpose, children }: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-content px-4 pb-10 pt-6 sm:px-6">
      <div className="mb-6 max-w-4xl">
        <h1 className="text-2xl font-semibold leading-tight text-fg sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base">{purpose}</p>
      </div>
      <div className="space-y-6">{children}</div>
      <footer className="mt-10 border-t border-border/40 pt-4 text-xs leading-relaxed text-muted">
        <p>
          Sources: Elexon BMRS <span className="text-fg">FUELHH</span> (wind
          actuals) and <span className="text-fg">WINDFOR</span> (wind forecasts).
          All times UTC. Metrics are descriptive statistics of the analysis window,
          not a probabilistic forecast product.
        </p>
      </footer>
    </div>
  )
}
