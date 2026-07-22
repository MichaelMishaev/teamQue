/**
 * Typed fetch wrapper for apps/api (technical-prd §7/§8). Every non-2xx response
 * (and every network failure) surfaces as an ApiRequestError carrying the
 * shared ErrorCode so screens can branch on `code` instead of parsing prose.
 */
import { apiErrorSchema, type ErrorCode } from 'shared'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'

export class ApiRequestError extends Error {
  readonly code: ErrorCode
  readonly details: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.details = details
  }
}

/** Best-effort status → code mapping when the response body isn't a shared ApiError. */
function codeForStatus(status: number): ErrorCode {
  if (status === 401) return 'UNAUTHORIZED'
  if (status === 403) return 'FORBIDDEN'
  if (status === 404) return 'NOT_FOUND'
  return 'VALIDATION_FAILED'
}

async function errorFromResponse(response: Response): Promise<ApiRequestError> {
  try {
    const body: unknown = await response.json()
    const parsed = apiErrorSchema.safeParse(body)
    if (parsed.success) {
      return new ApiRequestError(parsed.data.code, parsed.data.message, parsed.data.details)
    }
  } catch {
    // response body wasn't valid JSON — fall through to the status-based mapping
  }
  return new ApiRequestError(codeForStatus(response.status), response.statusText || 'Request failed')
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  keepalive?: boolean
}

/** Low-level request; prefer apiGet/apiPost below. */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const hasBody = options.body !== undefined

  let response: Response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      credentials: 'include',
      keepalive: options.keepalive ?? false,
      ...(hasBody ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options.body) } : {}),
    })
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Network request failed'
    throw new ApiRequestError('VALIDATION_FAILED', message)
  }

  if (!response.ok) {
    throw await errorFromResponse(response)
  }

  return (await response.json()) as T
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' })
}

export function apiPost<T>(path: string, body?: unknown, options: { keepalive?: boolean } = {}): Promise<T> {
  return apiRequest<T>(path, { method: 'POST', body: body ?? {}, keepalive: options.keepalive ?? false })
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: 'PATCH', body: body ?? {} })
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' })
}
