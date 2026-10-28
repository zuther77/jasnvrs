import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  badge?: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ title, badge, children, className = '' }: ChartCardProps) {
  return (
    <section
      className={`rounded-xl border border-border/60 bg-card p-5 shadow-card ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  )
}
