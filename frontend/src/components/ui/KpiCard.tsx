import type { ReactNode } from 'react'

type Tone = 'default' | 'forecast' | 'risk' | 'positive'

const toneStyles: Record<Tone, string> = {
  default: 'text-fg',
  forecast: 'text-forecast',
  risk: 'text-risk',
  positive: 'text-positive',
}

interface KpiCardProps {
  label: string
  value?: string
  sub?: string
  tone?: Tone
  footnote?: ReactNode
  children?: ReactNode
}

export function KpiCard({
  label,
  value,
  sub,
  tone = 'default',
  footnote,
  children,
}: KpiCardProps) {
  return (
    <article className="flex min-h-[7.5rem] flex-col justify-between rounded-xl border border-border/60 bg-card p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        {label}
      </p>
      <div className="mt-2">
        {value !== undefined ? (
          <p className={`num text-2xl font-medium leading-tight sm:text-3xl ${toneStyles[tone]}`}>
            {value}
          </p>
        ) : (
          children
        )}
        {sub ? <p className="mt-1.5 text-sm leading-snug text-muted">{sub}</p> : null}
        {footnote ? <div className="mt-2 text-xs leading-snug text-muted">{footnote}</div> : null}
      </div>
    </article>
  )
}
