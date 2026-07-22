import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/db.module'
import { PublicLineTelemetryWriter } from './public-line-telemetry.writer'

const centerId = '956e3c61-b90a-4b24-8705-9e0b11964c75'
const sessionId = '593dbb7f-eec3-4dc0-b1c8-6f1b0d221229'
const visitId = '2e2c6e34-69f6-48a8-a8d5-4d436e9b9270'

function makeDb(scope: { centerId: string; sessionId: string } | undefined): {
  db: Database
  insert: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
} {
  const limit = vi.fn().mockResolvedValue(scope ? [scope] : [])
  const where = vi.fn(() => ({ limit }))
  const innerJoin = vi.fn(() => ({ where }))
  const from = vi.fn(() => ({ innerJoin }))
  const select = vi.fn(() => ({ from }))
  const values = vi.fn().mockResolvedValue(undefined)
  const insert = vi.fn(() => ({ values }))
  return { db: { select, insert } as unknown as Database, insert, values }
}

describe('PublicLineTelemetryWriter', () => {
  it('writes a privacy-safe view event with server-derived ownership and no staff attribution', async () => {
    const { db, values } = makeDb({ centerId, sessionId })
    const writer = new PublicLineTelemetryWriter(db)
    const event = {
      type: 'viewed' as const,
      visitId,
      viewport: 'mobile' as const,
      displayMode: 'standalone' as const,
      queueCount: 5,
      pairCount: 3,
      hasUnpairedTeam: true,
      hasLiveMatch: true,
      firstWaitSec: 240,
      lastWaitSec: 960,
    }

    await writer.write(centerId, 'abc234', event)

    expect(values).toHaveBeenCalledWith({
      centerId,
      sessionId,
      staffId: null,
      action: 'public_line.viewed',
      entityType: 'public_line_visit',
      entityId: visitId,
      beforeJson: null,
      afterJson: event,
      createdAt: expect.any(Date),
    })
    expect(JSON.stringify(values.mock.calls[0]?.[0])).not.toContain('captain')
  })

  it('does not write when the slug is outside the fixed active public court', async () => {
    const { db, insert } = makeDb(undefined)
    const writer = new PublicLineTelemetryWriter(db)

    await expect(
      writer.write(centerId, 'bad234', {
        type: 'viewed',
        visitId,
        viewport: 'mobile',
        displayMode: 'browser',
        queueCount: 0,
        pairCount: 0,
        hasUnpairedTeam: false,
        hasLiveMatch: false,
        firstWaitSec: null,
        lastWaitSec: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(insert).not.toHaveBeenCalled()
  })
})
