import type { ApiErrorBody, ValidationDetail } from './types'

export const API_BASE = '/api'

interface ApiErrorOptions {
  nonJson?: boolean
  timedOut?: boolean
}

/** A transport or HTTP error from the API. `status === 0` means no HTTP response. */
export class ApiError extends Error {
  readonly status: number
  readonly detail: string | ValidationDetail[]
  readonly path: string
  readonly nonJson: boolean
  readonly timedOut: boolean

  constructor(
    status: number,
    detail: string | ValidationDetail[],
    path: string,
    options: ApiErrorOptions = {},
  ) {
    super(typeof detail === 'string' ? detail : detail.map((item) => item.msg).join('; '))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.path = path
    this.nonJson = options.nonJson ?? false
    this.timedOut = options.timedOut ?? false
  }
}

/** A 200 response that violates the frozen contract. Never a waiting state. */
export class ApiShapeError extends Error {
  readonly path: string
  readonly field: string

  constructor(path: string, field: string, message?: string) {
    super(message ?? `API shape violation at ${path}: ${field}`)
    this.name = 'ApiShapeError'
    this.path = path
    this.field = field
  }
}

function parseDetail(body: unknown): string | ValidationDetail[] {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as ApiErrorBody).detail
    if (typeof detail === 'string' || Array.isArray(detail)) return detail
  }
  return 'Unexpected response body'
}

export function isValidationDetailArray(
  detail: string | ValidationDetail[],
): detail is ValidationDetail[] {
  return Array.isArray(detail)
}

/**
 * Waiting classifications during the parallel build (API_CONTRACT.md §10):
 * network failure, 503, a bare 404 route miss, or a non-JSON proxy 500/502/504.
 */
export function isWaitingError(error: unknown): error is ApiError {
  if (!(error instanceof ApiError)) return false
  if (error.status === 0) return true
  if (error.status === 503) return true
  if (error.status === 404 && error.detail === 'Not Found') return true
  if (
    (error.status === 500 || error.status === 502 || error.status === 504) &&
    error.nonJson
  ) {
    return true
  }
  return false
}

/** A 404 carrying a window-specific detail: a real empty-day state, not a retry loop. */
export function isEmptyDayError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 404 &&
    typeof error.detail === 'string' &&
    error.detail !== 'Not Found'
  )
}

export function describeApiError(error: unknown): string {
  if (error instanceof ApiShapeError) return error.message
  if (error instanceof ApiError) {
    if (isValidationDetailArray(error.detail)) {
      const message = error.detail[0]?.msg ?? 'Invalid request'
      return `${message} (HTTP ${error.status})`
    }
    return error.detail
  }
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

export interface FetchOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/**
 * Fetch JSON from the same-origin `/api` path. Timeout aborts and merged caller
 * signals are handled here; every failure becomes an ApiError or a rethrown abort.
 */
export async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { signal, timeoutMs = 8000 } = options
  const controller = new AbortController()
  let timedOut = false

  const forwardAbort = () => controller.abort(signal?.reason)
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', forwardAbort)
  }

  const timer = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })

    const raw = await response.text()
    let parsed = false
    let body: unknown
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw)
        parsed = true
      } catch {
        parsed = false
      }
    }

    if (!response.ok) {
      const detail = parsed
        ? parseDetail(body)
        : raw.trim().slice(0, 300) || `HTTP ${response.status}`
      throw new ApiError(response.status, detail, path, { nonJson: !parsed })
    }

    if (!parsed) {
      throw new ApiError(response.status, 'Expected a JSON response body', path, {
        nonJson: true,
      })
    }

    return body as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) {
      throw new ApiError(0, `Request timed out after ${timeoutMs} ms`, path, {
        timedOut: true,
      })
    }
    if (signal?.aborted) throw error
    throw new ApiError(0, 'Network unreachable', path)
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', forwardAbort)
  }
}
