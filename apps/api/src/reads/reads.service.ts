/**
 * Read-only endpoints (technical-prd §7): the activity feed, a session's
 * finished-match history, past sessions, and a session's end-of-day
 * summary. None of these mutate — no ActivityWriter, no transactions.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, getTableColumns, gte, isNotNull, lte, lt, or, sql, type SQL } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  activityIdSchema,
  type ActivityEntry,
  type ActivityEventKind,
  type ActivityLogPage,
  type ActivityOutcome,
  type HistoryEntry,
  type SessionListItem,
  type SessionSummary,
} from 'shared'
import { NotFoundError, ValidationFailedError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { activityLog, captains, fields, matches, sessions, staff } from '../db/schema'

const DEFAULT_ACTIVITY_LIMIT = 50
const activityColumns = { ...getTableColumns(activityLog), staffName: staff.name }
type ActivityRow = typeof activityLog.$inferSelect & { staffName: string | null }

export interface ActivityLogFilters {
  sessionId?: string | undefined
  eventKind?: ActivityEventKind | undefined
  outcome?: ActivityOutcome | undefined
  action?: string | undefined
  staffId?: string | undefined
  statusCode?: number | undefined
  from?: string | undefined
  to?: string | undefined
  cursor?: string | undefined
  limit?: number | undefined
}

@Injectable()
export class ReadsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** GET /activity?sessionId=&limit= — newest first. */
  async activity(centerId: string, sessionId: string | undefined, limit: number): Promise<ActivityEntry[]> {
    const rows = await this.db
      .select(activityColumns)
      .from(activityLog)
      .leftJoin(staff, eq(staff.id, activityLog.staffId))
      .where(and(eq(activityLog.centerId, centerId), sessionId ? eq(activityLog.sessionId, sessionId) : undefined))
      .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
      .limit(limit || DEFAULT_ACTIVITY_LIMIT)

    return rows.map(toActivityEntry)
  }

  /** GET /activity/log — complete center history, stable cursor pagination. */
  async activityLogPage(centerId: string, filters: ActivityLogFilters): Promise<ActivityLogPage> {
    const limit = filters.limit ?? DEFAULT_ACTIVITY_LIMIT
    const conditions = activityConditions(centerId, filters, { includeAction: true, includeCursor: true })

    const [rows, actionRows, actorRows] = await Promise.all([
      this.db
        .select(activityColumns)
        .from(activityLog)
        .leftJoin(staff, eq(staff.id, activityLog.staffId))
        .where(and(...conditions))
        .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
        .limit(limit + 1),
      this.db
        .select({ action: activityLog.action, count: sql<number>`count(*)::int` })
        .from(activityLog)
        .where(and(...activityConditions(centerId, filters, { includeAction: false, includeCursor: false })))
        .groupBy(activityLog.action)
        .orderBy(desc(sql`count(*)`), activityLog.action),
      this.db
        .select({ staffId: staff.id, staffName: staff.name, count: sql<number>`count(*)::int` })
        .from(activityLog)
        .innerJoin(staff, eq(staff.id, activityLog.staffId))
        .where(
          and(
            ...activityConditions(centerId, filters, { includeAction: false, includeCursor: false }),
            isNotNull(activityLog.staffId),
          ),
        )
        .groupBy(staff.id, staff.name)
        .orderBy(desc(sql`count(*)`), staff.name),
    ])

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const last = pageRows.at(-1)

    return {
      items: pageRows.map(toActivityEntry),
      nextCursor: hasMore && last ? encodeActivityCursor(last.createdAt, last.id) : null,
      actions: actionRows.map((row) => ({ action: row.action, count: Number(row.count) })),
      actors: actorRows
        .filter((row): row is typeof row & { staffId: string; staffName: string } => row.staffId !== null && row.staffName !== null)
        .map((row) => ({ staffId: row.staffId, staffName: row.staffName, count: Number(row.count) })),
    }
  }

  /** GET /sessions/:id/history — finished matches, newest first. */
  async history(centerId: string, sessionId: string): Promise<HistoryEntry[]> {
    await this.findOwnedSession(centerId, sessionId)

    const captainA = alias(captains, 'captain_a')
    const captainB = alias(captains, 'captain_b')
    const startedByStaff = alias(staff, 'started_by_staff')
    const endedByStaff = alias(staff, 'ended_by_staff')

    const rows = await this.db
      .select({
        id: matches.id,
        captainAId: matches.captainAId,
        captainAName: captainA.name,
        captainBId: matches.captainBId,
        captainBName: captainB.name,
        fieldName: fields.name,
        startedAt: matches.startedAt,
        endedAt: matches.endedAt,
        endReason: matches.endReason,
        plannedDurationSec: matches.plannedDurationSec,
        accumulatedPauseSec: matches.accumulatedPauseSec,
        startedByName: startedByStaff.name,
        endedByName: endedByStaff.name,
      })
      .from(matches)
      .innerJoin(captainA, eq(captainA.id, matches.captainAId))
      .innerJoin(captainB, eq(captainB.id, matches.captainBId))
      .leftJoin(fields, eq(fields.id, matches.fieldId))
      .leftJoin(startedByStaff, eq(startedByStaff.id, matches.startedBy))
      .leftJoin(endedByStaff, eq(endedByStaff.id, matches.endedBy))
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
        fieldName: row.fieldName,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        endReason: row.endReason as HistoryEntry['endReason'],
        plannedDurationSec: row.plannedDurationSec,
        actualDurationSec: actualDurationSec(row.startedAt, row.endedAt, row.accumulatedPauseSec),
        startedByName: row.startedByName,
        endedByName: row.endedByName,
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

function toActivityEntry(row: ActivityRow): ActivityEntry {
  const common = {
    id: row.id,
    sessionId: row.sessionId,
    staffId: row.staffId,
    staffName: row.staffName,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    createdAt: row.createdAt.toISOString(),
  }

  if (row.eventKind === 'exception') {
    if (
      (row.outcome !== 'rejected' && row.outcome !== 'failed') ||
      row.statusCode === null ||
      row.errorCode === null ||
      row.requestMethod === null ||
      row.requestPath === null ||
      row.correlationId === null
    ) {
      throw new Error('Malformed exception activity row')
    }
    return {
      ...common,
      eventKind: 'exception',
      outcome: row.outcome,
      statusCode: row.statusCode,
      errorCode: row.errorCode,
      requestMethod: row.requestMethod,
      requestPath: row.requestPath,
      correlationId: row.correlationId,
      beforeJson: null,
      afterJson: null,
    }
  }

  return {
    ...common,
    eventKind: 'action',
    outcome: 'success',
    statusCode: null,
    errorCode: null,
    requestMethod: null,
    requestPath: null,
    correlationId: null,
    beforeJson: row.beforeJson,
    afterJson: row.afterJson,
  }
}

function activityConditions(
  centerId: string,
  filters: ActivityLogFilters,
  options: { includeAction: boolean; includeCursor: boolean },
): SQL[] {
  const conditions: SQL[] = [eq(activityLog.centerId, centerId)]
  if (filters.sessionId) conditions.push(eq(activityLog.sessionId, filters.sessionId))
  if (filters.eventKind) conditions.push(eq(activityLog.eventKind, filters.eventKind))
  if (filters.outcome) conditions.push(eq(activityLog.outcome, filters.outcome))
  if (options.includeAction && filters.action) conditions.push(eq(activityLog.action, filters.action))
  if (filters.staffId) conditions.push(eq(activityLog.staffId, filters.staffId))
  if (filters.statusCode !== undefined) conditions.push(eq(activityLog.statusCode, filters.statusCode))
  if (filters.from) conditions.push(gte(activityLog.createdAt, new Date(filters.from)))
  if (filters.to) conditions.push(lte(activityLog.createdAt, new Date(filters.to)))

  if (options.includeCursor && filters.cursor) {
    const cursor = decodeActivityCursor(filters.cursor)
    const cursorCondition = or(
      lt(activityLog.createdAt, cursor.createdAt),
      and(eq(activityLog.createdAt, cursor.createdAt), lt(activityLog.id, cursor.id)),
    )
    if (cursorCondition) conditions.push(cursorCondition)
  }

  return conditions
}

function encodeActivityCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), 'utf8').toString('base64url')
}

function decodeActivityCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (typeof decoded !== 'object' || decoded === null) throw new Error('cursor is not an object')
    const createdAt = Reflect.get(decoded, 'createdAt')
    const id = Reflect.get(decoded, 'id')
    const parsedDate = typeof createdAt === 'string' ? new Date(createdAt) : new Date(Number.NaN)
    if (Number.isNaN(parsedDate.getTime()) || !activityIdSchema.safeParse(id).success) {
      throw new Error('cursor fields are invalid')
    }
    return { createdAt: parsedDate, id: id as string }
  } catch {
    throw new ValidationFailedError('Invalid activity cursor')
  }
}

function actualDurationSec(startedAt: Date, endedAt: Date, accumulatedPauseSec: number): number {
  const wallClockSec = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)
  return Math.max(0, wallClockSec - accumulatedPauseSec)
}
