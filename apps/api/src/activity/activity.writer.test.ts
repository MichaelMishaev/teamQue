/**
 * Unit test (mock tx, no DB): ActivityWriter.write must set `createdAt`
 * explicitly. `activityLog.createdAt` (src/db/schema.ts) is `.notNull()`
 * with NO `.defaultNow()` — deliberate, so the log row's timestamp always
 * comes from the same transaction as its mutation (N-12). Omitting it here
 * would fail the NOT NULL constraint on the first real insert.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Transaction } from '../db/db.module'
import { ActivityWriter } from './activity.writer'

function makeTx(): { tx: Transaction; values: ReturnType<typeof vi.fn> } {
  const values = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn(() => ({ values }))
  const tx = { insert } as unknown as Transaction
  return { tx, values }
}

describe('ActivityWriter', () => {
  it('sets createdAt explicitly to a Date instance', async () => {
    const writer = new ActivityWriter()
    const { tx, values } = makeTx()

    await writer.write(tx, {
      centerId: 'center-1',
      staffId: 'staff-1',
      action: 'captain.created',
      entityType: 'captain',
      entityId: 'captain-1',
    })

    const inserted = values.mock.calls[0]?.[0]
    expect(inserted.createdAt).toBeInstanceOf(Date)
  })

  it('defaults sessionId/staffId/beforeJson/afterJson to null when omitted', async () => {
    const writer = new ActivityWriter()
    const { tx, values } = makeTx()

    await writer.write(tx, {
      centerId: 'center-1',
      action: 'session.opened',
      entityType: 'session',
      entityId: 'session-1',
    })

    const inserted = values.mock.calls[0]?.[0]
    expect(inserted).toMatchObject({
      centerId: 'center-1',
      sessionId: null,
      staffId: null,
      action: 'session.opened',
      entityType: 'session',
      entityId: 'session-1',
      beforeJson: null,
      afterJson: null,
    })
  })

  it('passes through sessionId, beforeJson, and afterJson when provided', async () => {
    const writer = new ActivityWriter()
    const { tx, values } = makeTx()

    await writer.write(tx, {
      centerId: 'center-1',
      sessionId: 'session-1',
      staffId: 'staff-1',
      action: 'captain.updated',
      entityType: 'captain',
      entityId: 'captain-1',
      beforeJson: { name: 'before' },
      afterJson: { name: 'after' },
    })

    const inserted = values.mock.calls[0]?.[0]
    expect(inserted).toMatchObject({
      sessionId: 'session-1',
      beforeJson: { name: 'before' },
      afterJson: { name: 'after' },
    })
  })
})
