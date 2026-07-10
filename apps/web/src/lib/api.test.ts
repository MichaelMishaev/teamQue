import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiRequestError, apiGet, apiPost } from './api'

function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: () => Promise.resolve(body),
  } as Response
}

describe('api', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('happy: resolves with the parsed JSON body on a 2xx response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, value: 42 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiGet<{ ok: boolean; value: number }>('/auth/me')

    expect(result).toEqual({ ok: true, value: 42 })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/auth/me',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    )
  })

  it('sends a JSON body and includes credentials on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: '1' }))
    vi.stubGlobal('fetch', fetchMock)

    await apiPost('/auth/center', { pin: '1234' })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/auth/center',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ pin: '1234' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
  })

  it('error-body parse: throws ApiRequestError with the parsed code/message/details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        { code: 'FIELD_OCCUPIED', message: 'field busy', details: { fieldId: 'f1' } },
        { status: 409 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiGet('/fields')).rejects.toMatchObject({
      code: 'FIELD_OCCUPIED',
      message: 'field busy',
      details: { fieldId: 'f1' },
    })
  })

  it('maps a 401 with an unparseable body to UNAUTHORIZED', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiGet('/auth/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).code).toBe('UNAUTHORIZED')
  })

  it('maps a 403 with a non-matching body to FORBIDDEN', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ nonsense: true }, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiGet('/staff').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).code).toBe('FORBIDDEN')
  })

  it('maps a 404 with a non-matching body to NOT_FOUND', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiGet('/captains/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).code).toBe('NOT_FOUND')
  })

  it('unparseable body: falls back to VALIDATION_FAILED for an unmapped status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new SyntaxError('bad json')),
    } as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiGet('/anything').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).code).toBe('VALIDATION_FAILED')
  })

  it('network failure: a rejected fetch throws an ApiRequestError instead of leaking the raw error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    const error = await apiGet('/auth/me').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiRequestError)
    expect((error as ApiRequestError).code).toBe('VALIDATION_FAILED')
  })
})
