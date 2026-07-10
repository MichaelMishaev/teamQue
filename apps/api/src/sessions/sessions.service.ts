/**
 * Session lifecycle: open, update (settings), close (technical-prd §3/§7,
 * features-prd US-010/011/012). Match start/queue lives in Task 3b.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import type { OpenSessionBody, UpdateSessionBody } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { fields, matches, sessions } from '../db/schema'
import { todayInJerusalem } from './date'
import { SessionAlreadyActiveError, SessionClosedError, SessionHasLiveMatchError } from './errors'

const MAIN_FIELD_NAME = 'מגרש ראשי'
const ONE_ACTIVE_SESSION_CONSTRAINT = 'one_active_session'
const LIVE_MATCH_STATUSES = ['live', 'paused'] as const

export type SessionView = {
  id: string
  date: string
  location: string | null
  matchDurationSec: number
  status: 'active' | 'closed'
}

@Injectable()
export class SessionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
  ) {}

  /** US-010: opens today's session + its single field in one transaction.
   * A second concurrent open hits the DB's partial unique index and is
   * mapped to 409 SESSION_ALREADY_ACTIVE here. */
  async open(centerId: string, staffId: string, body: OpenSessionBody): Promise<SessionView> {
    try {
      const session = await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(sessions)
          .values({
            centerId,
            date: todayInJerusalem(),
            location: body.location ?? null,
            matchDurationSec: body.matchDurationSec,
            status: 'active',
            createdBy: staffId,
          })
          .returning()
        if (!row) throw new Error('session insert returned no row')

        await tx.insert(fields).values({ sessionId: row.id, centerId, name: MAIN_FIELD_NAME, position: 0 })

        await this.activity.write(tx, {
          centerId,
          sessionId: row.id,
          staffId,
          action: 'session.opened',
          entityType: 'session',
          entityId: row.id,
          afterJson: row,
        })

        return row
      })

      return this.toView(session)
    } catch (error) {
      if (isUniqueViolation(error, ONE_ACTIVE_SESSION_CONSTRAINT)) throw new SessionAlreadyActiveError()
      throw error
    }
  }

  /** US-012: updates the ACTIVE session's settings; applies to matches
   * started afterwards (nothing to touch on live matches at the row level). */
  async update(centerId: string, staffId: string, id: string, body: UpdateSessionBody): Promise<SessionView> {
    const existing = await this.findOwned(centerId, id)
    if (existing.status === 'closed') throw new SessionClosedError()

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(sessions)
        .set({
          ...(body.matchDurationSec !== undefined && { matchDurationSec: body.matchDurationSec }),
          ...(body.location !== undefined && { location: body.location }),
        })
        .where(eq(sessions.id, id))
        .returning()
      if (!row) throw new NotFoundError('Session not found')

      await this.activity.write(tx, {
        centerId,
        sessionId: id,
        staffId,
        action: 'session.updated',
        entityType: 'session',
        entityId: id,
        beforeJson: existing,
        afterJson: row,
      })

      return row
    })

    return this.toView(updated)
  }

  /** US-011: closes the session iff no match is live/paused, cancelling any
   * still-queued matches. One activity row for the close + one per
   * cancelled match, all in one transaction. */
  async close(centerId: string, staffId: string, id: string): Promise<SessionView> {
    const existing = await this.findOwned(centerId, id)
    if (existing.status === 'closed') throw new SessionClosedError()

    const [liveMatch] = await this.db
      .select({ id: matches.id })
      .from(matches)
      .where(and(eq(matches.sessionId, id), inArray(matches.status, LIVE_MATCH_STATUSES)))
      .limit(1)
    if (liveMatch) throw new SessionHasLiveMatchError()

    const closed = await this.db.transaction(async (tx) => {
      const cancelled = await tx
        .update(matches)
        .set({ status: 'cancelled', endReason: 'cancelled', endedAt: new Date(), endedBy: staffId })
        .where(and(eq(matches.sessionId, id), eq(matches.status, 'queued')))
        .returning()

      for (const match of cancelled) {
        await this.activity.write(tx, {
          centerId,
          sessionId: id,
          staffId,
          action: 'match.cancelled',
          entityType: 'match',
          entityId: match.id,
          afterJson: match,
        })
      }

      const [row] = await tx.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, id)).returning()
      if (!row) throw new NotFoundError('Session not found')

      await this.activity.write(tx, {
        centerId,
        sessionId: id,
        staffId,
        action: 'session.closed',
        entityType: 'session',
        entityId: id,
        beforeJson: existing,
        afterJson: row,
      })

      return row
    })

    return this.toView(closed)
  }

  /** Nonexistent id or an id belonging to another center -> 404, and the two
   * cases are deliberately indistinguishable (see NotFoundError). */
  private async findOwned(centerId: string, id: string): Promise<typeof sessions.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, id), eq(sessions.centerId, centerId)))
      .limit(1)
    if (!row) throw new NotFoundError('Session not found')
    return row
  }

  private toView(row: typeof sessions.$inferSelect): SessionView {
    return {
      id: row.id,
      date: row.date,
      location: row.location,
      matchDurationSec: row.matchDurationSec,
      status: row.status as SessionView['status'],
    }
  }
}

/** drizzle-orm wraps the driver's error in a DrizzleQueryError; the
 * Postgres error fields (code/constraint) live on its `.cause`, not on the
 * wrapper itself — check both so this works regardless of which one a
 * given drizzle/pg version surfaces the fields on. */
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
