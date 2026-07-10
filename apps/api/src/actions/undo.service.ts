/**
 * Undo (POST /actions/:activityId/undo): line.removed and line.reordered
 * (5s), match.finished manual (30s). Every restore takes the session's
 * advisory lock (common/session-lock.ts) so it can't interleave with a
 * concurrent line mutation or kickoff, and re-checks the underlying state
 * is still what it was when the original activity was written — anything
 * else (window passed, state superseded, already undone, or an action kind
 * that was never undoable) is UNDO_EXPIRED.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { UndoResult } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { lockSessionLine } from '../common/session-lock'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database, type Transaction } from '../db/db.module'
import { activityLog, matches, queueEntries, sessions } from '../db/schema'
import { applyOrder, listLine, sameIdSet } from '../queue/line.repo'
import { FieldOccupiedError } from '../matches/errors'
import { UndoExpiredError } from './errors'

const LINE_UNDO_WINDOW_SEC = 5
const FINISH_UNDO_WINDOW_SEC = 30
const LIVE_STATUSES = ['live', 'paused'] as const

type ActivityRow = typeof activityLog.$inferSelect

@Injectable()
export class UndoService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
  ) {}

  async undo(centerId: string, staffId: string, activityId: string): Promise<UndoResult> {
    const original = await this.findOwnedActivity(centerId, activityId)

    switch (original.action) {
      case 'line.removed':
        await this.undoLineRemoved(centerId, staffId, original)
        break
      case 'line.reordered':
        await this.undoLineReordered(centerId, staffId, original)
        break
      case 'match.finished':
        await this.undoMatchFinished(centerId, staffId, original)
        break
      default:
        throw new UndoExpiredError()
    }

    return { ok: true }
  }

  private async undoLineRemoved(centerId: string, staffId: string, original: ActivityRow): Promise<void> {
    if (!withinWindow(original.createdAt, LINE_UNDO_WINDOW_SEC)) throw new UndoExpiredError()
    if (!original.sessionId) throw new UndoExpiredError()

    const before = asRemovedEntrySnapshot(original.beforeJson)
    if (!before) throw new UndoExpiredError()

    const session = await this.findActiveSession(original.sessionId)
    if (!session) throw new UndoExpiredError()

    await this.db.transaction(async (tx) => {
      await lockSessionLine(tx, original.sessionId as string)
      await this.assertNotAlreadyUndone(tx, original.id)

      const current = await listLine(tx, original.sessionId as string)
      const [row] = await tx
        .insert(queueEntries)
        .values({ sessionId: original.sessionId as string, centerId, captainId: before.captainId, position: before.formerPosition, createdAt: new Date() })
        .returning()
      if (!row) throw new Error('queue entry insert returned no row')

      const orderedIds = current.map((entry) => entry.id)
      const insertIndex = Math.min(Math.max(before.formerPosition - 1, 0), orderedIds.length)
      orderedIds.splice(insertIndex, 0, row.id)
      await applyOrder(tx, original.sessionId as string, orderedIds)

      await this.writeUndoActivity(tx, centerId, staffId, original, 'queueEntry', row.id)
    })
  }

  private async undoLineReordered(centerId: string, staffId: string, original: ActivityRow): Promise<void> {
    if (!withinWindow(original.createdAt, LINE_UNDO_WINDOW_SEC)) throw new UndoExpiredError()
    if (!original.sessionId) throw new UndoExpiredError()

    const before = asReorderSnapshot(original.beforeJson)
    if (!before) throw new UndoExpiredError()

    const session = await this.findActiveSession(original.sessionId)
    if (!session) throw new UndoExpiredError()

    await this.db.transaction(async (tx) => {
      await lockSessionLine(tx, original.sessionId as string)
      await this.assertNotAlreadyUndone(tx, original.id)

      const current = await listLine(tx, original.sessionId as string)
      if (!sameIdSet(current.map((entry) => entry.id), before.entryIds)) throw new UndoExpiredError()

      await applyOrder(tx, original.sessionId as string, before.entryIds)

      await this.writeUndoActivity(tx, centerId, staffId, original, 'session', original.sessionId as string)
    })
  }

  private async undoMatchFinished(centerId: string, staffId: string, original: ActivityRow): Promise<void> {
    if (!withinWindow(original.createdAt, FINISH_UNDO_WINDOW_SEC)) throw new UndoExpiredError()
    if (!original.sessionId) throw new UndoExpiredError()
    const matchId = original.entityId

    await this.db.transaction(async (tx) => {
      await lockSessionLine(tx, original.sessionId as string)
      await this.assertNotAlreadyUndone(tx, original.id)

      const [current] = await tx.select().from(matches).where(and(eq(matches.id, matchId), eq(matches.centerId, centerId))).limit(1)
      if (!current) throw new UndoExpiredError()
      if (current.status !== 'finished' || current.endReason !== 'manual' || !current.fieldId) throw new UndoExpiredError()

      const [occupied] = await tx
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.fieldId, current.fieldId), inArray(matches.status, LIVE_STATUSES)))
        .limit(1)
      if (occupied) throw new FieldOccupiedError()

      const [row] = await tx
        .update(matches)
        .set({ status: 'live', endedAt: null, endReason: null, endedBy: null })
        .where(and(eq(matches.id, matchId), eq(matches.status, 'finished')))
        .returning()
      if (!row) throw new UndoExpiredError()

      await this.writeUndoActivity(tx, centerId, staffId, original, 'match', matchId)
    })
  }

  private async writeUndoActivity(
    tx: Transaction,
    centerId: string,
    staffId: string,
    original: ActivityRow,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await this.activity.write(tx, {
      centerId,
      sessionId: original.sessionId,
      staffId,
      action: 'undo',
      entityType,
      entityId,
      afterJson: { undoneActivityId: original.id, undoneAction: original.action },
    })
  }

  /** Serializes against a concurrent second undo of the SAME activity: both
   * take the same session's advisory lock first, so the second call only
   * reaches this check after the first has committed its `undo` row. */
  private async assertNotAlreadyUndone(tx: Transaction, activityId: string): Promise<void> {
    const [row] = await tx
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(and(eq(activityLog.action, 'undo'), sql`${activityLog.afterJson} ->> 'undoneActivityId' = ${activityId}`))
      .limit(1)
    if (row) throw new UndoExpiredError()
  }

  private async findOwnedActivity(centerId: string, activityId: string): Promise<ActivityRow> {
    const [row] = await this.db.select().from(activityLog).where(and(eq(activityLog.id, activityId), eq(activityLog.centerId, centerId))).limit(1)
    if (!row) throw new NotFoundError('Activity not found')
    return row
  }

  private async findActiveSession(sessionId: string): Promise<typeof sessions.$inferSelect | undefined> {
    const [row] = await this.db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.status, 'active'))).limit(1)
    return row
  }
}

function withinWindow(createdAt: Date, seconds: number): boolean {
  return Date.now() - createdAt.getTime() <= seconds * 1000
}

function asRemovedEntrySnapshot(value: unknown): { captainId: string; formerPosition: number } | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.captainId !== 'string' || typeof v.formerPosition !== 'number') return null
  return { captainId: v.captainId, formerPosition: v.formerPosition }
}

function asReorderSnapshot(value: unknown): { entryIds: string[] } | null {
  if (typeof value !== 'object' || value === null) return null
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.entryIds) || !v.entryIds.every((id) => typeof id === 'string')) return null
  return { entryIds: v.entryIds }
}
