import type { ReactNode } from 'react'
import { describeApiError, ApiError } from '../../api/client'
import { formatTimestamp } from '../../lib/format'
import { Button } from './Button'

export function LoadingState({ label = 'Loading data' }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className="space-y-3 py-2">
      <span className="sr-only">{label}</span>
      <div className="h-6 w-2/3 animate-pulse rounded bg-border/40 motion-reduce:animate-none" />
      <div className="h-6 w-1/2 animate-pulse rounded bg-border/30 motion-reduce:animate-none" />
      <div className="h-24 w-full animate-pulse rounded bg-border/20 motion-reduce:animate-none" />
    </div>
  )
}

interface ErrorStateProps {
  error: unknown
  endpoint: string
  onRetry: () => void
  compact?: boolean
}

export function ErrorState({ error, endpoint, onRetry, compact = false }: ErrorStateProps) {
  const status = error instanceof ApiError ? `HTTP ${error.status}` : 'Contract mismatch'
  return (
    <div
      role="alert"
      className={`rounded-lg border border-risk/50 bg-risk/5 ${compact ? 'p-3' : 'p-4'}`}
    >
      <p className="text-sm font-semibold text-riskText">Could not load this panel</p>
      <p className="mt-1 text-sm text-fg">{describeApiError(error)}</p>
      <p className="mt-1 text-xs text-muted">
        <code className="num text-xs text-muted">{endpoint}</code> · {status}
      </p>
      <Button className="mt-3" onClick={onRetry}>
        Retry
      </Button>
    </div>
  )
}

interface WaitingForApiProps {
  endpoint: string
  attempt: number
  lastAttemptAt?: string | null
  onRetry: () => void
  compact?: boolean
}

/**
 * Explicit build-time state. It deliberately renders no numeric placeholder:
 * a missing endpoint must never look like a plausible measurement.
 */
export function WaitingForApi({
  endpoint,
  attempt,
  lastAttemptAt,
  onRetry,
  compact = false,
}: WaitingForApiProps) {
  return (
    <div
      data-testid="waiting-api"
      role="status"
      aria-live="polite"
      className={`rounded-lg border border-forecast/40 bg-forecast/5 ${compact ? 'p-3' : 'p-4'}`}
    >
      <p className="text-sm font-semibold text-forecast">Waiting for API</p>
      <p className="mt-1 text-sm leading-snug text-fg">
        Waiting for API — this panel will populate automatically.
      </p>
      <p className="mt-1 text-xs text-muted">
        Endpoint <code className="num text-xs text-muted">{endpoint}</code>
        {attempt > 0 ? <> · attempt {attempt}</> : null}
        {lastAttemptAt ? <> · last tried {formatTimestamp(lastAttemptAt)}</> : null}
      </p>
      <Button className="mt-3" onClick={onRetry}>
        Retry now
      </Button>
    </div>
  )
}

interface EmptyDayProps {
  detail: string
  onBackToLatest: () => void
}

export function EmptyDay({ detail, onBackToLatest }: EmptyDayProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-bg/30 p-4">
      <p className="text-sm font-semibold text-fg">
        No evaluated data for this decision date
      </p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
      <Button className="mt-3" onClick={onBackToLatest}>
        Back to latest day
      </Button>
    </div>
  )
}

export function StateShell({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>
}
