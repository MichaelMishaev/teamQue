/**
 * Captains: search + create + update (technical-prd §3/§7, features-prd
 * US-020..023). Search must be a FIXED number of queries regardless of
 * result count (N-21, no per-row queries) — see the query-count comment on
 * `search()`.
 *
 * "Games today" / "last played" are derived, never stored (technical-prd
 * §3): scoped to the center's ACTIVE session, computed from matches that
 * have actually started (status live/paused/finished) — a still-queued
 * match hasn't been "played" yet. "Total matches" is the all-time count of
 * FINISHED matches across every session (task brief). When there is no
 * active session, every captain's games-today/last-played is 0/null.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq, ilike, inArray, or, type SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { CaptainSearchResult, CreateCaptainBody, UpdateCaptainBody } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { captains, matches, sessions } from '../db/schema'
import { sortCaptainSearchResults, type CaptainSearchRow } from './search-order'

const SEARCH_LIMIT = 20
// A session_id that can never match a real row (all real ids are gen_random_uuid()).
// Used to scope the games-today/last-played aggregate to "nothing" when the
// center has no active session, instead of branching the query shape.
const NIL_SESSION_ID = '00000000-0000-0000-0000-000000000000'

@Injectable()
export class CaptainsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
  ) {}

  /**
   * Exactly 3 queries, independent of how many captains match `q`:
   *   1. find the center's active session id (or none)
   *   2. candidates: captains filtered by center + name/nickname ILIKE,
   *      LEFT JOINed with two grouped subqueries (one per captain role)
   *      aggregating games-today/last-played for that session
   *   3. totalMatches for just the <=20 winners, after sorting in-process
   */
  async search(centerId: string, q: string): Promise<CaptainSearchResult[]> {
    const pattern = `%${q}%`
    const nameOrNickname = or(ilike(captains.name, pattern), ilike(captains.nickname, pattern)) as SQL

    const rows = await this.findCaptainsWithSessionStats(centerId, nameOrNickname)
    const winners = sortCaptainSearchResults(rows, q).slice(0, SEARCH_LIMIT)
    return this.attachTotalMatches(winners)
  }

  async create(centerId: string, staffId: string, body: CreateCaptainBody): Promise<CaptainSearchResult> {
    const created = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(captains)
        .values({
          centerId,
          name: body.name,
          nickname: body.nickname ?? null,
          note: body.note ?? null,
          tags: body.tags ?? [],
        })
        .returning()
      if (!row) throw new Error('captain insert returned no row')

      await this.activity.write(tx, {
        centerId,
        staffId,
        action: 'captain.created',
        entityType: 'captain',
        entityId: row.id,
        afterJson: row,
      })

      return row
    })

    return {
      id: created.id,
      name: created.name,
      nickname: created.nickname,
      note: created.note,
      tags: created.tags,
      gamesToday: 0,
      lastPlayedAt: null,
      totalMatches: 0,
    }
  }

  async update(centerId: string, staffId: string, id: string, body: UpdateCaptainBody): Promise<CaptainSearchResult> {
    const existing = await this.findOwned(centerId, id)

    const updated = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(captains)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.nickname !== undefined && { nickname: body.nickname }),
          ...(body.note !== undefined && { note: body.note }),
          ...(body.tags !== undefined && { tags: body.tags }),
        })
        .where(eq(captains.id, id))
        .returning()
      if (!row) throw new NotFoundError('Captain not found')

      await this.activity.write(tx, {
        centerId,
        staffId,
        action: 'captain.updated',
        entityType: 'captain',
        entityId: id,
        beforeJson: existing,
        afterJson: row,
      })

      return row
    })

    const [statsRow] = await this.findCaptainsWithSessionStats(centerId, eq(captains.id, id))
    const totals = await this.totalMatchesByIds([id])

    return {
      id: updated.id,
      name: updated.name,
      nickname: updated.nickname,
      note: updated.note,
      tags: updated.tags,
      gamesToday: statsRow?.gamesToday ?? 0,
      lastPlayedAt: toIso(statsRow?.lastPlayedAt ?? null),
      totalMatches: totals.get(id) ?? 0,
    }
  }

  private async findOwned(centerId: string, id: string): Promise<typeof captains.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(captains)
      .where(and(eq(captains.id, id), eq(captains.centerId, centerId)))
      .limit(1)
    if (!row) throw new NotFoundError('Captain not found')
    return row
  }

  /** Query 1 (of search's 3): the center's active session id, or a sentinel
   * that matches nothing so the aggregate joins below naturally yield 0/null. */
  private async activeSessionIdOrNil(centerId: string): Promise<string> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.centerId, centerId), eq(sessions.status, 'active')))
      .limit(1)
    return row?.id ?? NIL_SESSION_ID
  }

  /** Query 2 (of search's 3): captains matching `extraWhere`, joined with
   * their games-today/last-played for the center's active session. Also
   * reused by update() for a single known id. */
  private async findCaptainsWithSessionStats(centerId: string, extraWhere: SQL): Promise<CaptainSearchRow[]> {
    const scopeSessionId = await this.activeSessionIdOrNil(centerId)
    const playedFilter = sql`${matches.status} in ('live','paused','finished')`

    const aggA = this.db
      .select({
        captainId: matches.captainAId,
        gamesToday: sql<number>`count(*) filter (where ${playedFilter})::int`.as('games_today_a'),
        lastPlayedAt: sql<Date | null>`max(${matches.startedAt}) filter (where ${playedFilter})`.as('last_played_a'),
      })
      .from(matches)
      .where(eq(matches.sessionId, scopeSessionId))
      .groupBy(matches.captainAId)
      .as('agg_a')

    const aggB = this.db
      .select({
        captainId: matches.captainBId,
        gamesToday: sql<number>`count(*) filter (where ${playedFilter})::int`.as('games_today_b'),
        lastPlayedAt: sql<Date | null>`max(${matches.startedAt}) filter (where ${playedFilter})`.as('last_played_b'),
      })
      .from(matches)
      .where(eq(matches.sessionId, scopeSessionId))
      .groupBy(matches.captainBId)
      .as('agg_b')

    const rows = await this.db
      .select({
        id: captains.id,
        name: captains.name,
        nickname: captains.nickname,
        note: captains.note,
        tags: captains.tags,
        createdAt: captains.createdAt,
        gamesToday: sql<number>`coalesce(${aggA.gamesToday}, 0) + coalesce(${aggB.gamesToday}, 0)`,
        lastPlayedAt: sql<Date | null>`greatest(${aggA.lastPlayedAt}, ${aggB.lastPlayedAt})`,
      })
      .from(captains)
      .leftJoin(aggA, eq(aggA.captainId, captains.id))
      .leftJoin(aggB, eq(aggB.captainId, captains.id))
      .where(and(eq(captains.centerId, centerId), extraWhere))

    return rows.map((r) => ({
      ...r,
      gamesToday: Number(r.gamesToday),
      lastPlayedAt: r.lastPlayedAt ? new Date(r.lastPlayedAt) : null,
      createdAt: new Date(r.createdAt),
    }))
  }

  /** Query 3 (of search's 3, and reused by update()): all-time FINISHED
   * match count per captain id, in one query regardless of `ids.length`. */
  private async totalMatchesByIds(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map()

    const totalsA = this.db
      .select({
        captainId: matches.captainAId,
        count: sql<number>`count(*)::int`.as('total_a'),
      })
      .from(matches)
      .where(and(inArray(matches.captainAId, ids), eq(matches.status, 'finished')))
      .groupBy(matches.captainAId)
      .as('totals_a')

    const totalsB = this.db
      .select({
        captainId: matches.captainBId,
        count: sql<number>`count(*)::int`.as('total_b'),
      })
      .from(matches)
      .where(and(inArray(matches.captainBId, ids), eq(matches.status, 'finished')))
      .groupBy(matches.captainBId)
      .as('totals_b')

    const rows = await this.db
      .select({
        id: captains.id,
        totalMatches: sql<number>`coalesce(${totalsA.count}, 0) + coalesce(${totalsB.count}, 0)`,
      })
      .from(captains)
      .leftJoin(totalsA, eq(totalsA.captainId, captains.id))
      .leftJoin(totalsB, eq(totalsB.captainId, captains.id))
      .where(inArray(captains.id, ids))

    return new Map(rows.map((r) => [r.id, Number(r.totalMatches)]))
  }

  private async attachTotalMatches(rows: CaptainSearchRow[]): Promise<CaptainSearchResult[]> {
    if (rows.length === 0) return []
    const totals = await this.totalMatchesByIds(rows.map((r) => r.id))

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      nickname: r.nickname,
      note: r.note,
      tags: r.tags,
      gamesToday: r.gamesToday,
      lastPlayedAt: toIso(r.lastPlayedAt),
      totalMatches: totals.get(r.id) ?? 0,
    }))
  }
}

function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null
}
