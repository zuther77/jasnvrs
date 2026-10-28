import { useCallback, useEffect, useState } from 'react'
import { ApiShapeError, isWaitingError } from './client'
import type { ApiError } from './client'
import { fetchApiPath } from './endpoints'

export type ResourceStatus = 'loading' | 'ready' | 'waiting' | 'error'

export interface ApiResource<T> {
  status: ResourceStatus
  data: T | null
  error: ApiError | ApiShapeError | Error | null
  retry: () => void
  lastAttemptAt: string | null
  attempt: number
  endpoint: string
}

interface ResourceState<T> {
  status: ResourceStatus
  data: T | null
  error: ApiError | ApiShapeError | Error | null
  lastAttemptAt: string | null
  attempt: number
  endpoint: string
}

const RETRY_FAST_MS = 10_000
const RETRY_SLOW_MS = 30_000
const FAST_ATTEMPTS = 6

/**
 * One resource per endpoint: loading -> ready | waiting | error.
 * Waiting retries every 10 s for the first 6 attempts, then every 30 s.
 * Polling pauses while the document is hidden and resumes on visibilitychange.
 */
export function useApiResource<T>(
  path: string,
  opts: { enabled?: boolean; pollWhileWaiting?: boolean } = {},
): ApiResource<T> {
  const { enabled = true, pollWhileWaiting = true } = opts
  const [nonce, setNonce] = useState(0)
  const [state, setState] = useState<ResourceState<T>>({
    status: 'loading',
    data: null,
    error: null,
    lastAttemptAt: null,
    attempt: 0,
    endpoint: path ? `/api${path}` : '',
  })

  const retry = useCallback(() => {
    setState({
      status: 'loading',
      data: null,
      error: null,
      lastAttemptAt: null,
      attempt: 0,
      endpoint: path ? `/api${path}` : '',
    })
    setNonce((value) => value + 1)
  }, [path])

  useEffect(() => {
    const endpoint = path ? `/api${path}` : ''

    if (!enabled || !path) {
      setState({
        status: 'loading',
        data: null,
        error: null,
        lastAttemptAt: null,
        attempt: 0,
        endpoint,
      })
      return
    }

    let cancelled = false
    let attempt = 0
    let timer: number | null = null
    let pendingWhileHidden = false
    let controller: AbortController | null = null

    setState({
      status: 'loading',
      data: null,
      error: null,
      lastAttemptAt: null,
      attempt: 0,
      endpoint,
    })

    const clearTimer = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const scheduleRetry = () => {
      if (!pollWhileWaiting || cancelled) return
      clearTimer()
      if (document.hidden) {
        pendingWhileHidden = true
        return
      }
      const delay = attempt <= FAST_ATTEMPTS ? RETRY_FAST_MS : RETRY_SLOW_MS
      timer = window.setTimeout(() => {
        timer = null
        void run()
      }, delay)
    }

    const run = async (): Promise<void> => {
      if (cancelled) return
      clearTimer()
      attempt += 1
      const startedAt = new Date().toISOString()

      setState((previous) => ({
        ...previous,
        endpoint,
        attempt,
        lastAttemptAt: startedAt,
        status: attempt === 1 ? 'loading' : previous.status,
      }))

      controller?.abort()
      const local = new AbortController()
      controller = local

      try {
        const data = await fetchApiPath<T>(path, { signal: local.signal })
        if (cancelled) return
        setState({
          status: 'ready',
          data,
          error: null,
          lastAttemptAt: startedAt,
          attempt,
          endpoint,
        })
      } catch (error) {
        if (cancelled) return
        if (error instanceof DOMException && error.name === 'AbortError') return

        if (isWaitingError(error)) {
          setState({
            status: 'waiting',
            data: null,
            error,
            lastAttemptAt: startedAt,
            attempt,
            endpoint,
          })
          scheduleRetry()
          return
        }

        setState({
          status: 'error',
          data: null,
          error:
            error instanceof Error
              ? error
              : new ApiShapeError(path, 'unknown', 'Unknown error while loading'),
          lastAttemptAt: startedAt,
          attempt,
          endpoint,
        })
      }
    }

    const onVisibilityChange = () => {
      if (cancelled) return
      if (document.hidden) {
        clearTimer()
        pendingWhileHidden = true
        return
      }
      if (pendingWhileHidden) {
        pendingWhileHidden = false
        void run()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    void run()

    return () => {
      cancelled = true
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      controller?.abort()
    }
  }, [path, enabled, pollWhileWaiting, nonce])

  const currentEndpoint = path ? `/api${path}` : ''
  const visibleState: ResourceState<T> =
    !enabled || !path
      ? {
          status: 'loading',
          data: null,
          error: null,
          lastAttemptAt: null,
          attempt: 0,
          endpoint: currentEndpoint,
        }
      : state.endpoint === currentEndpoint
        ? state
        : {
            status: 'loading',
            data: null,
            error: null,
            lastAttemptAt: null,
            attempt: 0,
            endpoint: currentEndpoint,
          }

  return { ...visibleState, retry }
}
