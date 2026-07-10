/**
 * The line: single-team queue entries waiting for a field (line-manager
 * model). Every mutation takes the session's advisory lock first
 * (common/session-lock.ts) so add/reorder/move/remove/start-match race
 * safely against each other (N-9).
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, sql } from 'drizzle-orm'
import type { AddToLineBody, CaptainRef, QueueEntryView, ReorderLineBody, ReorderLineResult, RemoveFromLineResult } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { getCaptainSessionStats, type CaptainStats } from '../captains/session-stats'
import { lockSessionLine } from '../common/session-lock'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database, type Transaction } from '../db/db.module'
import { captains, queueEntries, sessions } from '../db/schema'
import { SessionClosedError } from '../sessions/errors'
import { applyOrder, listLine, type QueueEntryRow } from './line.repo'
import { ReorderMismatchError } from './errors'

type CaptainRow = typeof captains.$inferSelect
type SessionRow = typeof sessions.$inferSelect

@Injectable()
export class LineService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
  ) {}

  /** Adds ONE team to the line bottom (position = current max + 1).
   * Inline-creates the captain in the same tx when `team` is `{newName}`. */
  async addToLine(centerId: string, staffId: string, sessionId: string, body: AddToLineBody): Promise<QueueEntryView> {
    await this.findOwnedActiveSession(centerId, sessionId)

    return this.db.transaction(async (tx) => {
      await lockSessionLine(tx, sessionId)

      const captainRow = await this.resolveCaptain(tx, centerId, body.team)

      const [maxRow] = await tx
        .select({ maxPosition: sql<number>`coalesce(max(${queueEntries.position}), 0)` })
        .from(queueEntries)
        .where(eq(queueEntries.sessionId, sessionId))
      const nextPosition = Number(maxRow?.maxPosition ?? 0) + 1

      const [entryRow] = await tx
        .insert(queueEntries)
        .values({ sessionId, centerId, captainId: captainRow.id, position: nextPosition, createdAt: new Date() })
        .returning()
      if (!entryRow) throw new Error('queue entry insert returned no row')

      await this.activity.write(tx, {
        centerId,
        sessionId,
        staffId,
        action: 'line.added',
        entityType: 'queueEntry',
        entityId: entryRow.id,
        afterJson: entryRow,
      })

      const stats = await getCaptainSessionStats(tx, sessionId, [captainRow.id])
      return toQueueEntryView(entryRow, captainRow, stats.get(captainRow.id) ?? { gamesToday: 0, lastPlayedAt: null })
    })
  }

  /** Full permutation of the current line's entry ids -> renumber 1..n.
   * A set mismatch means someone else changed the line first (409, the
   * client refetches the snapshot rather than silently reconciling). */
  async reorderLine(centerId: string, staffId: string, sessionId: string, body: ReorderLineBody): Promise<ReorderLineResult> {
    await this.findOwnedActiveSession(centerId, sessionId)

    return this.db.transaction(async (tx) => {
      await lockSessionLine(tx, sessionId)

      const current = await listLine(tx, sessionId)
      const currentIds = current.map((row) => row.id)
      if (!sameIdSet(currentIds, body.entryIds)) throw new ReorderMismatchError()

      await applyOrder(tx, sessionId, body.entryIds)

      const activityId = await this.activity.write(tx, {
        centerId,
        sessionId,
        staffId,
        action: 'line.reordered',
        entityType: 'session',
        entityId: sessionId,
        beforeJson: { entryIds: currentIds },
        afterJson: { entryIds: body.entryIds },
      })

      return { activityId }
    })
  }

  /** Moves one entry to the front of the line, renumbers. */
  async moveTop(centerId: string, staffId: string, entryId: string): Promise<QueueEntryView> {
    return this.move(centerId, staffId, entryId, 'top')
  }

  /** Moves one entry to the back of the line, renumbers. */
  async moveBottom(centerId: string, staffId: string, entryId: string): Promise<QueueEntryView> {
    return this.move(centerId, staffId, entryId, 'bottom')
  }

  /** Removes one team from the line, closes the gap. Undoable (5s ->
   * restore to its former position). */
  async removeFromLine(centerId: string, staffId: string, entryId: string): Promise<RemoveFromLineResult> {
    const owned = await this.findOwnedEntry(centerId, entryId)

    return this.db.transaction(async (tx) => {
      await lockSessionLine(tx, owned.sessionId)

      const current = await listLine(tx, owned.sessionId)
      const target = current.find((row) => row.id === entryId)
      if (!target) throw new NotFoundError('Queue entry not found')

      await tx.delete(queueEntries).where(eq(queueEntries.id, entryId))

      const remainingIds = current.filter((row) => row.id !== entryId).map((row) => row.id)
      await applyOrder(tx, owned.sessionId, remainingIds)

      const activityId = await this.activity.write(tx, {
        centerId,
        sessionId: owned.sessionId,
        staffId,
        action: 'line.removed',
        entityType: 'queueEntry',
        entityId: entryId,
        beforeJson: { ...target, formerPosition: target.position },
      })

      return { activityId }
    })
  }

  private async move(centerId: string, staffId: string, entryId: string, to: 'top' | 'bottom'): Promise<QueueEntryView> {
    const owned = await this.findOwnedEntry(centerId, entryId)

    return this.db.transaction(async (tx) => {
      await lockSessionLine(tx, owned.sessionId)

      const current = await listLine(tx, owned.sessionId)
      const target = current.find((row) => row.id === entryId)
      if (!target) throw new NotFoundError('Queue entry not found')

      const others = current.filter((row) => row.id !== entryId).map((row) => row.id)
      const orderedIds = to === 'top' ? [entryId, ...others] : [...others, entryId]
      await applyOrder(tx, owned.sessionId, orderedIds)

      await this.activity.write(tx, {
        centerId,
        sessionId: owned.sessionId,
        staffId,
        action: 'line.moved',
        entityType: 'queueEntry',
        entityId: entryId,
        beforeJson: { position: target.position },
        afterJson: { position: to === 'top' ? 1 : orderedIds.length },
      })

      const [captainRow] = await tx.select().from(captains).where(eq(captains.id, target.captainId)).limit(1)
      if (!captainRow) throw new NotFoundError('Captain not found')
      const stats = await getCaptainSessionStats(tx, owned.sessionId, [captainRow.id])
      const newPosition = to === 'top' ? 1 : orderedIds.length
      return toQueueEntryView(
        { ...target, position: newPosition },
        captainRow,
        stats.get(captainRow.id) ?? { gamesToday: 0, lastPlayedAt: null },
      )
    })
  }

  private async resolveCaptain(tx: Transaction, centerId: string, ref: CaptainRef): Promise<CaptainRow> {
    if (typeof ref === 'string') {
      const [row] = await tx
        .select()
        .from(captains)
        .where(and(eq(captains.id, ref), eq(captains.centerId, centerId)))
        .limit(1)
      if (!row) throw new NotFoundError('Captain not found')
      return row
    }

    const [row] = await tx.insert(captains).values({ centerId, name: ref.newName }).returning()
    if (!row) throw new Error('captain insert returned no row')
    return row
  }

  private async findOwnedActiveSession(centerId: string, sessionId: string): Promise<SessionRow> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.centerId, centerId)))
      .limit(1)
    if (!row) throw new NotFoundError('Session not found')
    if (row.status !== 'active') throw new SessionClosedError()
    return row
  }

  /** Nonexistent id or an id belonging to another center -> 404
   * (indistinguishable, same rationale as common/errors.ts's NotFoundError). */
  private async findOwnedEntry(centerId: string, entryId: string): Promise<QueueEntryRow> {
    const [row] = await this.db
      .select()
      .from(queueEntries)
      .where(and(eq(queueEntries.id, entryId), eq(queueEntries.centerId, centerId)))
      .limit(1)
    if (!row) throw new NotFoundError('Queue entry not found')
    return row
  }
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  if (setA.size !== a.length) return false
  const setB = new Set(b)
  if (setB.size !== b.length) return false
  for (const id of setA) if (!setB.has(id)) return false
  return true
}

export function toQueueEntryView(entry: QueueEntryRow, captain: CaptainRow, stats: CaptainStats): QueueEntryView {
  return {
    id: entry.id,
    position: entry.position,
    team: {
      id: captain.id,
      name: captain.name,
      nickname: captain.nickname,
      gamesToday: stats.gamesToday,
      lastPlayedAt: stats.lastPlayedAt,
    },
  }
}
