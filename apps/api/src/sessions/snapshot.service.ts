/**
 * Builds the full-session snapshot (technical-prd §5) used by both
 * GET /sessions/active (REST fallback) and the socket broadcast:
 * `queue` = the line, position-ordered; each field's `liveMatch` = its
 * live/paused match, if any. Fixed query count regardless of line length
 * or number of live matches (N-21) — no per-row queries.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { SessionSnapshot } from 'shared'
import { getCaptainSessionStats } from '../captains/session-stats'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { captains, fields, matches, sessions } from '../db/schema'
import { buildMatchView } from '../matches/match-view'
import { listLine, toQueueEntryView } from '../queue/line.repo'

const LIVE_STATUSES = ['live', 'paused'] as const

@Injectable()
export class SnapshotService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async buildActiveSnapshot(centerId: string): Promise<SessionSnapshot> {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.centerId, centerId), eq(sessions.status, 'active')))
      .limit(1)
    if (!session) throw new NotFoundError('No active session')

    return this.buildForSession(session)
  }

  /** Used by the realtime broadcast (src/realtime/session-events.service.ts):
   * callers there already know the session id and may be broadcasting its
   * FINAL snapshot (e.g. right after it closed), so — unlike
   * buildActiveSnapshot — this doesn't filter by status='active'. */
  async buildSnapshotBySessionId(sessionId: string): Promise<SessionSnapshot> {
    const [session] = await this.db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
    if (!session) throw new NotFoundError('Session not found')

    return this.buildForSession(session)
  }

  private async buildForSession(session: typeof sessions.$inferSelect): Promise<SessionSnapshot> {
    const sessionFields = await this.db
      .select()
      .from(fields)
      .where(eq(fields.sessionId, session.id))
      .orderBy(asc(fields.position))

    const [queue, liveMatchByFieldId] = await Promise.all([
      this.buildQueue(session.id),
      this.buildLiveMatchesByFieldId(sessionFields.map((f) => f.id)),
    ])

    const now = new Date().toISOString()
    return {
      session: {
        id: session.id,
        slug: session.slug,
        date: session.date,
        location: session.location,
        matchDurationSec: session.matchDurationSec,
        status: session.status as SessionSnapshot['session']['status'],
      },
      fields: sessionFields.map((f) => ({ id: f.id, name: f.name, position: f.position, liveMatch: liveMatchByFieldId.get(f.id) ?? null })),
      queue,
      emittedAt: now,
      serverNow: now,
    }
  }

  private async buildQueue(sessionId: string): Promise<SessionSnapshot['queue']> {
    const entries = await listLine(this.db, sessionId)
    if (entries.length === 0) return []

    const captainIds = entries.map((entry) => entry.captainId)
    const [captainRows, stats] = await Promise.all([
      this.db.select().from(captains).where(inArray(captains.id, captainIds)),
      getCaptainSessionStats(this.db, sessionId, captainIds),
    ])

    return entries.map((entry) => {
      const captain = captainRows.find((row) => row.id === entry.captainId)
      if (!captain) throw new Error('captain not found for queue entry')
      return toQueueEntryView(entry, captain, stats.get(captain.id) ?? { gamesToday: 0, lastPlayedAt: null })
    })
  }

  private async buildLiveMatchesByFieldId(fieldIds: string[]): Promise<Map<string, SessionSnapshot['fields'][number]['liveMatch']>> {
    const result = new Map<string, SessionSnapshot['fields'][number]['liveMatch']>()
    if (fieldIds.length === 0) return result

    const liveRows = await this.db
      .select()
      .from(matches)
      .where(and(inArray(matches.fieldId, fieldIds), inArray(matches.status, LIVE_STATUSES)))
    for (const row of liveRows) {
      if (!row.fieldId) continue
      result.set(row.fieldId, await buildMatchView(this.db, row))
    }
    return result
  }
}
