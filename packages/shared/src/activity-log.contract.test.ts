import { describe, expect, it } from 'vitest'
import { activityEntrySchema, activityLogPageSchema, apiErrorSchema } from './index.js'

const actionId = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
const exceptionId = '4c2f9b1a-6e21-4a3d-9f3a-1b2c3d4e5f60'
const sessionId = '9e107d9d-372b-4b76-8b53-01a9b0c0f9f1'
const staffId = '7f1fdbd3-bbfd-4b20-9276-1ff9c312b847'
const createdAt = '2026-07-17T18:55:23.000Z'

const successfulAction = {
  id: actionId,
  sessionId,
  staffId,
  staffName: 'שרה',
  eventKind: 'action',
  outcome: 'success',
  action: 'line.added',
  entityType: 'queueEntry',
  entityId: actionId,
  statusCode: null,
  errorCode: null,
  requestMethod: null,
  requestPath: null,
  correlationId: null,
  beforeJson: null,
  afterJson: { position: 1 },
  createdAt,
}

const rejectedRequest = {
  id: exceptionId,
  sessionId,
  staffId,
  staffName: 'שרה',
  eventKind: 'exception',
  outcome: 'rejected',
  action: 'PATCH /sessions/:id/line',
  entityType: 'request',
  entityId: exceptionId,
  statusCode: 409,
  errorCode: 'VALIDATION_FAILED',
  requestMethod: 'PATCH',
  requestPath: '/sessions/:id/line',
  correlationId: exceptionId,
  beforeJson: null,
  afterJson: null,
  createdAt,
}

describe('full activity log contracts', () => {
  it('accepts successful actions and rejected requests as distinct event kinds', () => {
    expect(activityEntrySchema.safeParse(successfulAction).success).toBe(true)
    expect(activityEntrySchema.safeParse(rejectedRequest).success).toBe(true)
    expect(activityEntrySchema.safeParse({ ...rejectedRequest, outcome: 'success' }).success).toBe(false)
  })

  it('carries an opaque cursor plus action and actor facets for filtering', () => {
    const page = {
      items: [successfulAction, rejectedRequest],
      nextCursor: 'opaque-next-page',
      actions: [
        { action: 'line.added', count: 1 },
        { action: 'PATCH /sessions/:id/line', count: 1 },
      ],
      actors: [{ staffId, staffName: 'שרה', count: 2 }],
    }

    expect(activityLogPageSchema.safeParse(page).success).toBe(true)
    expect(activityLogPageSchema.safeParse({ ...page, nextCursor: 42 }).success).toBe(false)
  })

  it('allows the safe API error envelope to return a correlation id', () => {
    expect(
      apiErrorSchema.safeParse({
        code: 'INTERNAL_ERROR',
        message: 'unexpected error',
        correlationId: exceptionId,
      }).success,
    ).toBe(true)
  })
})
