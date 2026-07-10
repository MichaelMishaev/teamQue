/**
 * Read-only endpoints (technical-prd §7): the activity feed, a session's
 * finished-match history, past sessions, and a session's end-of-day
 * summary. None of these mutate — no ActivityWriter, no transactions.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { ActivityEntry, HistoryEntry, SessionListItem, SessionSummary } from 'shared'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { activityLog, captains, matches, sessions } from '../db/schema'

const DEFAULT_ACTIVITY_LIMIT = 50

@Injectable()
export class ReadsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** GET /activity?sessionId=&limit= — newest first. */
  async activity(centerId: string, sessionId: string | undefined, limit: number): Promise<ActivityEntry[]> {
    const rows = await this.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.centerId, centerId), sessionId ? eq(activityLog.sessionId, sessionId) : undefined))
      .orderBy(desc(activityLog.createdAt))
      .limit(limit || DEFAULT_ACTIVITY_LIMIT)

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      staffId: row.staffId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      beforeJson: row.beforeJson,
      afterJson: row.afterJson,
      createdAt: row.createdAt.toISOString(),
    }))
  }

  /** GET /sessions/:id/history — finished matches, newest first. */
  async history(centerId: string, sessionId: string): Promise<HistoryEntry[]> {
    await this.findOwnedSession(centerId, sessionId)

    const captainA = alias(captains, 'captain_a')
    const captainB = alias(captains, 'captain_b')

    const rows = await this.db
      .select({
        id: matches.id,
        captainAId: matches.captainAId,
        captainAName: captainA.name,
        captainBId: matches.captainBId,
        captainBName: captainB.name,
        startedAt: matches.startedAt,
        endedAt: matches.endedAt,
        endReason: matches.endReason,
        plannedDurationSec: matches.plannedDurationSec,
        accumulatedPauseSec: matches.accumulatedPauseSec,
      })
      .from(matches)
      .innerJoin(captainA, eq(captainA.id, matches.captainAId))
      .innerJoin(captainB, eq(captainB.id, matches.captainBId))
      .where(and(eq(matches.sessionId, sessionId), eq(matches.status, 'finished')))
      .orderBy(desc(matches.endedAt))

    return rows
      .filter((row): row is typeof row & { startedAt: Date; endedAt: Date; endReason: string } => row.startedAt !== null && row.endedAt !== null && row.endReason !== null)
      .map((row) => ({
        id: row.id,
        captainAId: row.captainAId,
        captainAName: row.captainAName,
        captainBId: row.captainBId,
        captainBName: row.captainBName,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        endReason: row.endReason as HistoryEntry['endReason'],
        actualDurationSec: actualDurationSec(row.startedAt, row.endedAt, row.accumulatedPauseSec),
      }))
  }

  /** GET /sessions?from=&to= — past sessions, newest first. */
  async sessionsList(centerId: string, from: string | undefined, to: string | undefined): Promise<SessionListItem[]> {
    const rows = await this.db
      .select({
        id: sessions.id,
        date: sessions.date,
        location: sessions.location,
        status: sessions.status,
        matchCount: sql<number>`count(${matches.id}) filter (where ${matches.status} = 'finished')::int`,
      })
      .from(sessions)
      .leftJoin(matches, eq(matches.sessionId, sessions.id))
      .where(and(eq(sessions.centerId, centerId), from ? gte(sessions.date, from) : undefined, to ? lte(sessions.date, to) : undefined))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.date))

    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      location: row.location,
      status: row.status as SessionListItem['status'],
      matchCount: Number(row.matchCount),
    }))
  }

  /** GET /sessions/:id/summary — end-of-day aggregate over finished
   * matches. 3 queries total regardless of match count (N-21): ownership,
   * one scalar-aggregate query, one topCaptains query. */
  async summary(centerId: string, sessionId: string): Promise<SessionSummary> {
    await this.findOwnedSession(centerId, sessionId)

    const aggResult = await this.db.execute<{
      total_matches: number
      unique_captains: number
      total_play_sec: number
      avg_actual_duration_sec: number | string
      first_match_at: Date | null
      last_match_ended_at: Date | null
      manual_finishes: number
      auto_finishes: number
      extensions: number
    }>(sql`
      WITH finished AS (
        SELECT * FROM ${matches} WHERE ${matches.sessionId} = ${sessionId} AND ${matches.status} = 'finished'
      ),
      roles AS (
        SELECT captain_a_id AS captain_id FROM finished
        UNION ALL
        SELECT captain_b_id AS captain_id FROM finished
      )
      SELECT
        (SELECT count(*) FROM finished)::int AS total_matches,
        (SELECT count(DISTINCT captain_id) FROM roles)::int AS unique_captains,
        (SELECT coalesce(sum(extract(epoch FROM (ended_at - started_at))::int - accumulated_pause_sec), 0) FROM finished)::int AS total_play_sec,
        (SELECT coalesce(avg(extract(epoch FROM (ended_at - started_at))::int - accumulated_pause_sec), 0) FROM finished) AS avg_actual_duration_sec,
        (SELECT min(started_at) FROM finished) AS first_match_at,
        (SELECT max(ended_at) FROM finished) AS last_match_ended_at,
        (SELECT count(*) FROM finished WHERE end_reason = 'manual')::int AS manual_finishes,
        (SELECT count(*) FROM finished WHERE end_reason = 'auto')::int AS auto_finishes,
        (SELECT count(*) FROM ${activityLog} WHERE ${activityLog.sessionId} = ${sessionId} AND ${activityLog.action} = 'match.extended')::int AS extensions
    `)
    const agg = aggResult.rows[0]

    const topResult = await this.db.execute<{ captain_id: string; name: string; games: number }>(sql`
      SELECT c.id AS captain_id, c.name AS name, count(*)::int AS games
      FROM (
        SELECT captain_a_id AS captain_id FROM ${matches} WHERE ${matches.sessionId} = ${sessionId} AND ${matches.status} = 'finished'
        UNION ALL
        SELECT captain_b_id AS captain_id FROM ${matches} WHERE ${matches.sessionId} = ${sessionId} AND ${matches.status} = 'finished'
      ) roles
      JOIN ${captains} c ON c.id = roles.captain_id
      GROUP BY c.id, c.name
      ORDER BY games DESC, c.name ASC
      LIMIT 3
    `)

    return {
      totalMatches: Number(agg?.total_matches ?? 0),
      uniqueCaptains: Number(agg?.unique_captains ?? 0),
      totalPlaySec: Number(agg?.total_play_sec ?? 0),
      firstMatchAt: agg?.first_match_at ? new Date(agg.first_match_at).toISOString() : null,
      lastMatchEndedAt: agg?.last_match_ended_at ? new Date(agg.last_match_ended_at).toISOString() : null,
      avgActualDurationSec: Number(agg?.avg_actual_duration_sec ?? 0),
      topCaptains: topResult.rows.map((row) => ({ captainId: row.captain_id, name: row.name, games: Number(row.games) })),
      extensions: Number(agg?.extensions ?? 0),
      manualFinishes: Number(agg?.manual_finishes ?? 0),
      autoFinishes: Number(agg?.auto_finishes ?? 0),
    }
  }

  private async findOwnedSession(centerId: string, sessionId: string): Promise<void> {
    const [row] = await this.db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.centerId, centerId))).limit(1)
    if (!row) throw new NotFoundError('Session not found')
  }
}

function actualDurationSec(startedAt: Date, endedAt: Date, accumulatedPauseSec: number): number {
  const wallClockSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  return Math.max(0, wallClockSec - accumulatedPauseSec)
}
