/**
 * Builds the full-session snapshot (technical-prd §5) used by both
 * GET /sessions/active (REST fallback) and the socket broadcast. Task 3b
 * fills in `queue` and each field's `liveMatch`; this is the seed both
 * extend, kept as its own service so neither has to re-derive session +
 * fields shaping.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import type { SessionSnapshot } from 'shared'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { fields, sessions } from '../db/schema'

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

    const sessionFields = await this.db
      .select()
      .from(fields)
      .where(eq(fields.sessionId, session.id))
      .orderBy(asc(fields.position))

    const now = new Date().toISOString()
    return {
      session: {
        id: session.id,
        date: session.date,
        location: session.location,
        matchDurationSec: session.matchDurationSec,
        status: session.status as SessionSnapshot['session']['status'],
      },
      fields: sessionFields.map((f) => ({ id: f.id, name: f.name, position: f.position, liveMatch: null })),
      queue: [],
      emittedAt: now,
      serverNow: now,
    }
  }
}
