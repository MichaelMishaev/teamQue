/**
 * Auto-finish scheduler (technical-prd §4). Every 5s: one query finds
 * `live` matches whose computed end time (`started_at + planned_duration_sec
 * + accumulated_pause_sec`, in SQL) has passed, across all sessions. Each
 * due match is finished with a conditional `UPDATE ... WHERE status='live'`
 * — 0 rows means someone else (manual finish, or another tick) already
 * finished it, so this is idempotent and never double-fires (N-9). Derives
 * purely from DB state, so it survives API restarts.
 */
import { Inject, Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { and, eq, sql } from 'drizzle-orm'
import { ActivityWriter } from '../activity/activity.writer'
import { DRIZZLE, type Database } from '../db/db.module'
import { matches } from '../db/schema'
import { SessionEventsService } from './session-events.service'

const TICK_INTERVAL_MS = 5000

type DueMatch = { id: string; sessionId: string; centerId: string }

@Injectable()
export class AutoFinishService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
    @Inject(SessionEventsService) private readonly sessionEvents: SessionEventsService,
  ) {}

  @Interval(TICK_INTERVAL_MS)
  async tick(): Promise<void> {
    const due = await this.db
      .select({ id: matches.id, sessionId: matches.sessionId, centerId: matches.centerId })
      .from(matches)
      .where(
        and(
          eq(matches.status, 'live'),
          sql`${matches.startedAt} + ((${matches.plannedDurationSec} + ${matches.accumulatedPauseSec}) * interval '1 second') <= now()`,
        ),
      )
    if (due.length === 0) return

    const sessionIdsToBroadcast = new Set<string>()
    for (const match of due) {
      if (await this.finishOne(match)) sessionIdsToBroadcast.add(match.sessionId)
    }

    for (const sessionId of sessionIdsToBroadcast) {
      await this.sessionEvents.broadcast(sessionId)
    }
  }

  /** Returns whether THIS call was the one that finished the match (false
   * if it was already finished by a concurrent tick or a manual finish). */
  private async finishOne(due: DueMatch): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(matches)
        .set({ status: 'finished', endedAt: new Date(), endReason: 'auto', endedBy: null })
        .where(and(eq(matches.id, due.id), eq(matches.status, 'live')))
        .returning()
      if (!row) return false

      await this.activity.write(tx, {
        centerId: due.centerId,
        sessionId: due.sessionId,
        staffId: null,
        action: 'match.finished',
        entityType: 'match',
        entityId: due.id,
        beforeJson: { status: 'live' },
        afterJson: row,
      })

      return true
    })
  }
}
