/**
 * Builds a matchViewSchema row from a `matches` DB row — shared by
 * MatchesService and SnapshotService (fields[].liveMatch) so `endsAt`'s
 * math lives in exactly one place.
 */
import { inArray } from 'drizzle-orm'
import type { CaptainView, MatchView } from 'shared'
import type { CaptainStats } from '../captains/session-stats'
import { getCaptainSessionStats } from '../captains/session-stats'
import type { Database, Transaction } from '../db/db.module'
import { captains } from '../db/schema'

export type MatchRow = typeof import('../db/schema').matches.$inferSelect
type CaptainRow = typeof captains.$inferSelect

/** endsAt only exists while the clock is actually running (`live`) — a
 * paused match has no countdown, and accumulatedPauseSec (added back on
 * every resume) is what keeps a match's total playable time correct after
 * one or more pauses. */
export function computeEndsAt(startedAt: Date, plannedDurationSec: number, accumulatedPauseSec: number): string {
  return new Date(startedAt.getTime() + (plannedDurationSec + accumulatedPauseSec) * 1000).toISOString()
}

export function toCaptainView(captain: CaptainRow, stats?: CaptainStats): CaptainView {
  const s = stats ?? { gamesToday: 0, lastPlayedAt: null }
  return { id: captain.id, name: captain.name, nickname: captain.nickname, gamesToday: s.gamesToday, lastPlayedAt: s.lastPlayedAt }
}

export async function buildMatchView(db: Database | Transaction, row: MatchRow): Promise<MatchView> {
  const captainRows = await db.select().from(captains).where(inArray(captains.id, [row.captainAId, row.captainBId]))
  const stats = await getCaptainSessionStats(db, row.sessionId, [row.captainAId, row.captainBId])

  const captainA = captainRows.find((c) => c.id === row.captainAId)
  const captainB = captainRows.find((c) => c.id === row.captainBId)
  if (!captainA || !captainB) throw new Error('captain not found for match')

  return {
    id: row.id,
    captainA: toCaptainView(captainA, stats.get(captainA.id)),
    captainB: toCaptainView(captainB, stats.get(captainB.id)),
    status: row.status as MatchView['status'],
    plannedDurationSec: row.plannedDurationSec,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    pausedAt: row.pausedAt ? row.pausedAt.toISOString() : null,
    accumulatedPauseSec: row.accumulatedPauseSec,
    endsAt: row.status === 'live' && row.startedAt ? computeEndsAt(row.startedAt, row.plannedDurationSec, row.accumulatedPauseSec) : null,
  }
}
