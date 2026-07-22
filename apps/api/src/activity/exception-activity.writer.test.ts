import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/db.module'
import { ExceptionActivityWriter } from './exception-activity.writer'

function makeDb(): { db: Database; values: ReturnType<typeof vi.fn> } {
  const values = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn(() => ({ values }))
  return { db: { insert } as unknown as Database, values }
}

describe('ExceptionActivityWriter', () => {
  it('persists rejected requests outside the rolled-back domain transaction without storing an exception message', async () => {
    const { db, values } = makeDb()
    const writer = new ExceptionActivityWriter(db)
    const correlationId = '4c2f9b1a-6e21-4a3d-9f3a-1b2c3d4e5f60'

    await writer.write({
      centerId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      sessionId: '9e107d9d-372b-4b76-8b53-01a9b0c0f9f1',
      staffId: '7f1fdbd3-bbfd-4b20-9276-1ff9c312b847',
      outcome: 'rejected',
      action: 'PATCH /sessions/:id/line',
      statusCode: 409,
      errorCode: 'VALIDATION_FAILED',
      requestMethod: 'PATCH',
      requestPath: '/sessions/:id/line',
      correlationId,
    })

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKind: 'exception',
        outcome: 'rejected',
        entityType: 'request',
        entityId: correlationId,
        correlationId,
        beforeJson: null,
        afterJson: null,
        createdAt: expect.any(Date),
      }),
    )
    const inserted = values.mock.calls[0]?.[0]
    expect(JSON.stringify(inserted)).not.toContain('message')
    expect(JSON.stringify(inserted)).not.toContain('stack')
  })
})
