/**
 * gamesToday/lastPlayedAt for a known set of captains, scoped to ONE known
 * session (not "the center's active session" — callers here already have a
 * sessionId in hand: the line, the field's live match, snapshot building).
 * Reuses the same "played = live/paused/finished" rule as
 * captains/captains.service.ts. One query regardless of captainIds.length.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import type { Database, Transaction } from '../db/db.module'
import { captains, matches } from '../db/schema'

export type CaptainStats = { gamesToday: number; lastPlayedAt: string | null }

export async function getCaptainSessionStats(
  db: Database | Transaction,
  sessionId: string,
  captainIds: string[],
): Promise<Map<string, CaptainStats>> {
  if (captainIds.length === 0) return new Map()

  const playedFilter = sql`${matches.status} in ('live','paused','finished')`

  const aggA = db
    .select({
      captainId: matches.captainAId,
      gamesToday: sql<number>`count(*) filter (where ${playedFilter})::int`.as('games_today_a'),
      lastPlayedAt: sql<Date | null>`max(${matches.startedAt}) filter (where ${playedFilter})`.as('last_played_a'),
    })
    .from(matches)
    .where(and(eq(matches.sessionId, sessionId), inArray(matches.captainAId, captainIds)))
    .groupBy(matches.captainAId)
    .as('agg_a')

  const aggB = db
    .select({
      captainId: matches.captainBId,
      gamesToday: sql<number>`count(*) filter (where ${playedFilter})::int`.as('games_today_b'),
      lastPlayedAt: sql<Date | null>`max(${matches.startedAt}) filter (where ${playedFilter})`.as('last_played_b'),
    })
    .from(matches)
    .where(and(eq(matches.sessionId, sessionId), inArray(matches.captainBId, captainIds)))
    .groupBy(matches.captainBId)
    .as('agg_b')

  const rows = await db
    .select({
      id: captains.id,
      gamesToday: sql<number>`coalesce(${aggA.gamesToday}, 0) + coalesce(${aggB.gamesToday}, 0)`,
      lastPlayedAt: sql<Date | null>`greatest(${aggA.lastPlayedAt}, ${aggB.lastPlayedAt})`,
    })
    .from(captains)
    .leftJoin(aggA, eq(aggA.captainId, captains.id))
    .leftJoin(aggB, eq(aggB.captainId, captains.id))
    .where(inArray(captains.id, captainIds))

  return new Map(
    rows.map((r) => [
      r.id,
      { gamesToday: Number(r.gamesToday), lastPlayedAt: r.lastPlayedAt ? new Date(r.lastPlayedAt).toISOString() : null },
    ]),
  )
}
