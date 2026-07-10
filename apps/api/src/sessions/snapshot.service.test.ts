/**
 * Unit test (mock db): SnapshotService shapes raw session/field rows into
 * the exact sessionSnapshotSchema contract (technical-prd §5). Matches/queue
 * are always empty here — Task 3b wires them in; this test locks the seed
 * shape so that extension can't silently break session/fields shaping.
 */
import { sessionSnapshotSchema } from 'shared'
import { describe, expect, it, vi } from 'vitest'
import type { Database } from '../db/db.module'
import { SnapshotService } from './snapshot.service'

// Minimal stand-in for drizzle's chainable select builder: each method
// returns `this` so calls can chain in any order the service uses, and the
// object is thenable so `await` resolves it to the given rows.
function chain<T>(rows: T[]): PromiseLike<T[]> & Record<string, unknown> {
  const builder: Record<string, unknown> = {
    from: () => builder,
    where: () => builder,
    limit: () => builder,
    orderBy: () => builder,
    then: (resolve: (rows: T[]) => unknown) => resolve(rows),
  }
  return builder as PromiseLike<T[]> & Record<string, unknown>
}

const centerId = '11111111-1111-4111-8111-111111111111'
const sessionId = '22222222-2222-4222-8222-222222222222'
const fieldId = '33333333-3333-4333-8333-333333333333'
const staffId = '44444444-4444-4444-8444-444444444444'

describe('SnapshotService.buildActiveSnapshot', () => {
  it('throws NotFoundError when the center has no active session', async () => {
    const select = vi.fn().mockReturnValueOnce(chain([]))
    const db = { select } as unknown as Database
    const service = new SnapshotService(db)

    await expect(service.buildActiveSnapshot(centerId)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('shapes the active session + its fields into a valid sessionSnapshotSchema with empty queue', async () => {
    const sessionRow = {
      id: sessionId,
      centerId,
      date: '2026-07-10',
      location: 'Center Court',
      matchDurationSec: 360,
      status: 'active',
      createdBy: staffId,
      createdAt: new Date('2026-07-10T17:00:00.000Z'),
    }
    const fieldRows = [{ id: fieldId, sessionId, centerId, name: 'מגרש ראשי', position: 0 }]

    const select = vi.fn().mockReturnValueOnce(chain([sessionRow])).mockReturnValueOnce(chain(fieldRows))
    const db = { select } as unknown as Database
    const service = new SnapshotService(db)

    const snapshot = await service.buildActiveSnapshot(centerId)

    expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(true)
    expect(snapshot.session).toEqual({
      id: sessionId,
      date: '2026-07-10',
      location: 'Center Court',
      matchDurationSec: 360,
      status: 'active',
    })
    expect(snapshot.fields).toEqual([{ id: fieldId, name: 'מגרש ראשי', position: 0, liveMatch: null }])
    expect(snapshot.queue).toEqual([])
    expect(select).toHaveBeenCalledTimes(2)
  })
})
