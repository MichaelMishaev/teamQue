/**
 * Unit test: HttpExceptionFilter's unhandled-exception branch (technical-prd
 * §8) must still return a body that parses with shared's apiErrorSchema —
 * carried-over review finding. Full detail is logged via pino; the response
 * body stays generic (no internals leaked to the client).
 */
import type { ArgumentsHost } from '@nestjs/common'
import { apiErrorSchema } from 'shared'
import { describe, expect, it, vi } from 'vitest'
import { HttpExceptionFilter } from './http-exception.filter'

function makeHost(): { host: ArgumentsHost; json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> } {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost
  return { host, json, status }
}

describe('HttpExceptionFilter', () => {
  it('an unknown thrown value -> 500 with an apiErrorSchema-shaped INTERNAL_ERROR body', () => {
    const filter = new HttpExceptionFilter()
    const { host, json, status } = makeHost()

    filter.catch(new Error('something exploded with sensitive detail'), host)

    expect(status).toHaveBeenCalledWith(500)
    const body = json.mock.calls[0]?.[0]
    expect(apiErrorSchema.safeParse(body).success).toBe(true)
    expect(body).toEqual({ code: 'INTERNAL_ERROR', message: 'unexpected error' })
  })

  it('a non-Error thrown value also maps to the same generic body', () => {
    const filter = new HttpExceptionFilter()
    const { host, json, status } = makeHost()

    filter.catch('a plain string throw', host)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith({ code: 'INTERNAL_ERROR', message: 'unexpected error' })
  })
})
