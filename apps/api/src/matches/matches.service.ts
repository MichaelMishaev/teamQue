/**
 * Match lifecycle: kickoff (pairs two teams from the line onto the
 * session's field) through pause/resume/extend/finish, plus replay
 * (finished match's two teams rejoin the line). Kickoff and every
 * transition are a single guarded conditional UPDATE/INSERT + one
 * activity row, all in one transaction (N-9, N-12).
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { ExtendMatchBody, FinishMatchResult, MatchView, QueueEntryView, StartMatchBody } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { getCaptainSessionStats } from '../captains/session-stats'
import { lockSessionLine } from '../common/session-lock'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database, type Transaction } from '../db/db.module'
import { captains, fields, queueEntries, sessions, matches } from '../db/schema'
import { applyOrder, listLine, type QueueEntryRow } from '../queue/line.repo'
import { toQueueEntryView } from '../queue/line.service'
import { SessionClosedError } from '../sessions/errors'
import { CaptainAlreadyPlayingError, FieldOccupiedError, InvalidTransitionError, LineTooShortError } from './errors'
import { buildMatchView, type MatchRow } from './match-view'

const LIVE_STATUSES = ['live', 'paused'] as const
const ONE_LIVE_MATCH_PER_FIELD = 'one_live_match_per_field'

@Injectable()
export class MatchesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
  ) {}

  /** Pairs two teams from the line onto the session's field, directly as
   * `live` (matches are never `queued` in the line-manager model). */
  async start(centerId: string, staffId: string, sessionId: string, body: StartMatchBody): Promise<MatchView> {
    const session = await this.findOwnedActiveSession(centerId, sessionId)
    const field = await this.findSingleField(centerId, sessionId)
    if (body.fieldId && body.fieldId !== field.id) throw new NotFoundError('Field not found')

    return this.db.transaction(async (tx) => {
      await lockSessionLine(tx, sessionId)

      const line = await listLine(tx, sessionId)
      const [entryA, entryB] = pickFrontTwo(line, body.entryIds)
      if (!entryA || !entryB) throw new LineTooShortError()
      if (entryA.captainId === entryB.captainId) throw new CaptainAlreadyPlayingError()

      const [occupied] = await tx
        .select({ id: matches.id })
        .from(matches)
        .where(and(eq(matches.fieldId, field.id), inArray(matches.status, LIVE_STATUSES)))
        .limit(1)
      if (occupied) throw new FieldOccupiedError()

      const captainIds = [entryA.captainId, entryB.captainId]
      const [busy] = await tx
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.sessionId, sessionId),
            inArray(matches.status, LIVE_STATUSES),
            inArray(matches.captainAId, captainIds),
          ),
        )
        .limit(1)
      const [busyB] = await tx
        .select({ id: matches.id })
        .from(matches)
        .where(
          and(
            eq(matches.sessionId, sessionId),
            inArray(matches.status, LIVE_STATUSES),
            inArray(matches.captainBId, captainIds),
          ),
        )
        .limit(1)
      if (busy || busyB) throw new CaptainAlreadyPlayingError()

      await tx.delete(queueEntries).where(inArray(queueEntries.id, [entryA.id, entryB.id]))
      const remainingIds = line.filter((row) => row.id !== entryA.id && row.id !== entryB.id).map((row) => row.id)
      await applyOrder(tx, sessionId, remainingIds)

      let matchRow: MatchRow | undefined
      try {
        ;[matchRow] = await tx
          .insert(matches)
          .values({
            sessionId,
            centerId,
            fieldId: field.id,
            captainAId: entryA.captainId,
            captainBId: entryB.captainId,
            status: 'live',
            plannedDurationSec: session.matchDurationSec,
            startedAt: new Date(),
            startedBy: staffId,
          })
          .returning()
      } catch (error) {
        if (isUniqueViolation(error, ONE_LIVE_MATCH_PER_FIELD)) throw new FieldOccupiedError()
        throw error
      }
      if (!matchRow) throw new Error('match insert returned no row')

      await this.activity.write(tx, {
        centerId,
        sessionId,
        staffId,
        action: 'match.started',
        entityType: 'match',
        entityId: matchRow.id,
        afterJson: matchRow,
      })

      return buildMatchView(tx, matchRow)
    })
  }

  async pause(centerId: string, staffId: string, matchId: string): Promise<MatchView> {
    const row = await this.transition(centerId, staffId, matchId, ['live'], { status: 'paused', pausedAt: new Date() }, 'match.paused')
    return buildMatchView(this.db, row)
  }

  async resume(centerId: string, staffId: string, matchId: string): Promise<MatchView> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(matches).where(and(eq(matches.id, matchId), eq(matches.centerId, centerId))).limit(1)
      if (!current) throw new NotFoundError('Match not found')
      if (current.status !== 'paused' || !current.pausedAt) throw new InvalidTransitionError()

      const pausedForSec = Math.max(0, Math.round((Date.now() - current.pausedAt.getTime()) / 1000))
      const [row] = await tx
        .update(matches)
        .set({ status: 'live', pausedAt: null, accumulatedPauseSec: current.accumulatedPauseSec + pausedForSec })
        .where(and(eq(matches.id, matchId), eq(matches.status, 'paused')))
        .returning()
      if (!row) throw new InvalidTransitionError()

      await this.activity.write(tx, {
        centerId,
        sessionId: row.sessionId,
        staffId,
        action: 'match.resumed',
        entityType: 'match',
        entityId: matchId,
        afterJson: row,
      })

      return buildMatchView(tx, row)
    })
  }

  async extend(centerId: string, staffId: string, matchId: string, body: ExtendMatchBody): Promise<MatchView> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(matches)
        .set({ plannedDurationSec: sql`${matches.plannedDurationSec} + ${body.addSec}` })
        .where(and(eq(matches.id, matchId), eq(matches.centerId, centerId), inArray(matches.status, LIVE_STATUSES)))
        .returning()
      if (!row) await this.assertExistsOrThrowNotFound(tx, centerId, matchId)
      if (!row) throw new InvalidTransitionError()

      await this.activity.write(tx, {
        centerId,
        sessionId: row.sessionId,
        staffId,
        action: 'match.extended',
        entityType: 'match',
        entityId: matchId,
        beforeJson: { plannedDurationSec: row.plannedDurationSec - body.addSec },
        afterJson: row,
      })

      return buildMatchView(tx, row)
    })
  }

  /** live|paused -> finished, end_reason='manual'. Undoable 30s (restores
   * to `live` if the field is still free — see ActionsService). */
  async finish(centerId: string, staffId: string, matchId: string): Promise<FinishMatchResult> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(matches).where(and(eq(matches.id, matchId), eq(matches.centerId, centerId))).limit(1)
      if (!before) throw new NotFoundError('Match not found')
      if (!LIVE_STATUSES.includes(before.status as (typeof LIVE_STATUSES)[number])) throw new InvalidTransitionError()

      const [row] = await tx
        .update(matches)
        .set({ status: 'finished', endedAt: new Date(), endReason: 'manual', endedBy: staffId })
        .where(and(eq(matches.id, matchId), inArray(matches.status, LIVE_STATUSES)))
        .returning()
      if (!row) throw new InvalidTransitionError()

      const activityId = await this.activity.write(tx, {
        centerId,
        sessionId: row.sessionId,
        staffId,
        action: 'match.finished',
        entityType: 'match',
        entityId: matchId,
        beforeJson: before,
        afterJson: row,
      })

      const match = await buildMatchView(tx, row)
      return { match, activityId }
    })
  }

  /** A finished match's two teams rejoin the line bottom as two NEW queue
   * entries (that's how a team "plays again" in the line-manager model). */
  async replay(centerId: string, staffId: string, matchId: string): Promise<QueueEntryView[]> {
    const [matchRow] = await this.db.select().from(matches).where(and(eq(matches.id, matchId), eq(matches.centerId, centerId))).limit(1)
    if (!matchRow) throw new NotFoundError('Match not found')
    if (matchRow.status !== 'finished') throw new InvalidTransitionError()

    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, matchRow.sessionId)).limit(1)
    if (!session) throw new NotFoundError('Session not found')
    if (session.status !== 'active') throw new SessionClosedError()

    return this.db.transaction(async (tx) => {
      await lockSessionLine(tx, matchRow.sessionId)

      const [maxRow] = await tx
        .select({ maxPosition: sql<number>`coalesce(max(${queueEntries.position}), 0)` })
        .from(queueEntries)
        .where(eq(queueEntries.sessionId, matchRow.sessionId))
      let nextPosition = Number(maxRow?.maxPosition ?? 0) + 1

      const created: QueueEntryRow[] = []
      for (const captainId of [matchRow.captainAId, matchRow.captainBId]) {
        const [row] = await tx
          .insert(queueEntries)
          .values({ sessionId: matchRow.sessionId, centerId, captainId, position: nextPosition, createdAt: new Date() })
          .returning()
        if (!row) throw new Error('queue entry insert returned no row')
        created.push(row)
        nextPosition += 1

        await this.activity.write(tx, {
          centerId,
          sessionId: matchRow.sessionId,
          staffId,
          action: 'line.added',
          entityType: 'queueEntry',
          entityId: row.id,
          afterJson: row,
        })
      }

      await this.activity.write(tx, {
        centerId,
        sessionId: matchRow.sessionId,
        staffId,
        action: 'match.replayed',
        entityType: 'match',
        entityId: matchId,
        afterJson: { queueEntryIds: created.map((row) => row.id) },
      })

      const captainRows = await tx.select().from(captains).where(inArray(captains.id, [matchRow.captainAId, matchRow.captainBId]))
      const stats = await getCaptainSessionStats(tx, matchRow.sessionId, [matchRow.captainAId, matchRow.captainBId])

      return created.map((row) => {
        const captain = captainRows.find((c) => c.id === row.captainId)
        if (!captain) throw new Error('captain not found for replay')
        return toQueueEntryView(row, captain, stats.get(captain.id) ?? { gamesToday: 0, lastPlayedAt: null })
      })
    })
  }

  private async transition(
    centerId: string,
    staffId: string,
    matchId: string,
    from: (typeof LIVE_STATUSES)[number][],
    set: Partial<typeof matches.$inferInsert>,
    action: string,
  ): Promise<MatchRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(matches)
        .set(set)
        .where(and(eq(matches.id, matchId), eq(matches.centerId, centerId), inArray(matches.status, from)))
        .returning()
      if (!row) await this.assertExistsOrThrowNotFound(tx, centerId, matchId)
      if (!row) throw new InvalidTransitionError()

      await this.activity.write(tx, {
        centerId,
        sessionId: row.sessionId,
        staffId,
        action,
        entityType: 'match',
        entityId: matchId,
        afterJson: row,
      })

      return row
    })
  }

  /** Distinguishes "no such match" (404) from "wrong state" (409): only
   * throws when the id truly doesn't belong to this center. */
  private async assertExistsOrThrowNotFound(tx: Transaction, centerId: string, matchId: string): Promise<void> {
    const [row] = await tx.select({ id: matches.id }).from(matches).where(and(eq(matches.id, matchId), eq(matches.centerId, centerId))).limit(1)
    if (!row) throw new NotFoundError('Match not found')
  }

  private async findOwnedActiveSession(centerId: string, sessionId: string): Promise<typeof sessions.$inferSelect> {
    const [row] = await this.db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.centerId, centerId))).limit(1)
    if (!row) throw new NotFoundError('Session not found')
    if (row.status !== 'active') throw new SessionClosedError()
    return row
  }

  private async findSingleField(centerId: string, sessionId: string): Promise<typeof fields.$inferSelect> {
    const [row] = await this.db.select().from(fields).where(and(eq(fields.sessionId, sessionId), eq(fields.centerId, centerId))).limit(1)
    if (!row) throw new NotFoundError('Field not found')
    return row
  }
}

function pickFrontTwo(
  line: QueueEntryRow[],
  entryIds?: readonly [string, string],
): [QueueEntryRow | undefined, QueueEntryRow | undefined] {
  if (!entryIds) return [line[0], line[1]]
  const [idA, idB] = entryIds
  return [line.find((row) => row.id === idA), line.find((row) => row.id === idB)]
}

/** drizzle-orm wraps the driver's error in a DrizzleQueryError; the
 * Postgres error fields (code/constraint) live on its `.cause` — see the
 * identical helper + comment in sessions/sessions.service.ts. */
function isUniqueViolation(error: unknown, constraint: string): boolean {
  const candidates = [error, hasCause(error) ? error.cause : undefined]
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === constraint,
  )
}

function hasCause(error: unknown): error is { cause: unknown } {
  return typeof error === 'object' && error !== null && 'cause' in error
}
