import type { ArgumentsHost } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { ExceptionActivityWriter } from '../activity/exception-activity.writer'
import { ReorderMismatchError } from '../queue/errors'
import { HttpExceptionFilter } from './http-exception.filter'

const sessionId = '9e107d9d-372b-4b76-8b53-01a9b0c0f9f1'
const centerId = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const staffId = '7f1fdbd3-bbfd-4b20-9276-1ff9c312b847'

function makeHost() {
  const json = vi.fn()
  const setHeader = vi.fn()
  const status = vi.fn(() => ({ json }))
  const request = {
    centerId,
    staff: { staffId, centerId, role: 'staff' },
    method: 'PATCH',
    originalUrl: `/sessions/${sessionId}/line?source=drag`,
    params: { id: sessionId },
  }
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ status, setHeader }),
    }),
  } as unknown as ArgumentsHost
  return { host, json, setHeader, status }
}

describe('HttpExceptionFilter audit trail', () => {
  it('records a normalized, center-scoped rejection and returns its correlation id', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const writer = { write } as unknown as ExceptionActivityWriter
    const filter = new HttpExceptionFilter(writer)
    const { host, json, setHeader, status } = makeHost()

    await filter.catch(new ReorderMismatchError(), host)

    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        centerId,
        sessionId,
        staffId,
        outcome: 'rejected',
        action: 'PATCH /sessions/:id/line',
        statusCode: 409,
        errorCode: 'VALIDATION_FAILED',
        requestMethod: 'PATCH',
        requestPath: '/sessions/:id/line',
        correlationId: expect.any(String),
      }),
    )
    const recorded = write.mock.calls[0]?.[0]
    expect(() => randomUUID({ disableEntropyCache: true })).not.toThrow()
    expect(status).toHaveBeenCalledWith(409)
    expect(setHeader).toHaveBeenCalledWith('X-Correlation-Id', recorded.correlationId)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_FAILED', correlationId: recorded.correlationId }),
    )
  })

  it('records unknown failures generically and never exposes their message', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const filter = new HttpExceptionFilter({ write } as unknown as ExceptionActivityWriter)
    const { host, json } = makeHost()

    await filter.catch(new Error('database password leaked here'), host)

    expect(write).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed', statusCode: 500, errorCode: 'INTERNAL_ERROR' }))
    expect(JSON.stringify(write.mock.calls[0]?.[0])).not.toContain('database password')
    expect(json).toHaveBeenCalledWith(expect.not.objectContaining({ message: 'database password leaked here' }))
  })
})
