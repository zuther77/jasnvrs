import type { ReactNode } from 'react'

type Tone = 'neutral' | 'forecast' | 'risk' | 'positive'

const toneStyles: Record<Tone, string> = {
  neutral: 'border-border/70 bg-border/20 text-fg',
  forecast: 'border-forecast/50 bg-forecast/10 text-forecast',
  risk: 'border-risk/50 bg-risk/10 text-riskText',
  positive: 'border-positive/50 bg-positive/10 text-positive',
}

interface BadgeProps {
  tone?: Tone
  children: ReactNode
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium leading-none ${toneStyles[tone]}`}
    >
      {children}
    </span>
  )
}
