/**
 * Low-level line (queue_entries) helpers shared by LineService, MatchesService
 * (kickoff consumes two entries) and the undo path — kept table-operation-only
 * (no activity logging, no ownership checks) so every caller composes them
 * inside its own transaction after calling lockSessionLine (common/session-lock.ts).
 *
 * toQueueEntryView also lives here (not in line.service.ts) deliberately: it's
 * a pure view-shaping function with no DI dependencies, imported by
 * SnapshotService and MatchesService too. Defining it in line.service.ts
 * would make those imports pull in LineService's SessionEventsService
 * dependency, closing a circular import (line.service -> realtime ->
 * snapshot.service -> line.service).
 */
import { and, asc, eq } from 'drizzle-orm'
import type { QueueEntryView } from 'shared'
import type { CaptainStats } from '../captains/session-stats'
import type { Database, Transaction } from '../db/db.module'
import { captains, queueEntries } from '../db/schema'

export type QueueEntryRow = typeof queueEntries.$inferSelect
type CaptainRow = typeof captains.$inferSelect

/** The session's line, position-ordered. A plain read, so callers that
 * only need to display the line (e.g. SnapshotService) may pass the plain
 * Database; callers doing read-then-write must hold the session's advisory
 * lock first (and therefore always pass a Transaction) for the sequence to
 * be race-free. */
export async function listLine(db: Database | Transaction, sessionId: string): Promise<QueueEntryRow[]> {
  return db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
}

/** Sets positions to 1..n following `orderedIds` exactly. Every id must
 * already belong to the session's line — callers validate the full-set
 * match (or construct orderedIds from a just-read listLine()) before
 * calling this, so no id is silently dropped or duplicated. */
export async function applyOrder(tx: Transaction, sessionId: string, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]
    if (!id) continue
    await tx
      .update(queueEntries)
      .set({ position: i + 1 })
      .where(and(eq(queueEntries.id, id), eq(queueEntries.sessionId, sessionId)))
  }
}

/** True iff `a` and `b` contain exactly the same ids (order-independent,
 * each exactly once) — used both to validate a reorder's entryIds against
 * the current line and to detect an undo(line.reordered) superseded by a
 * later add/remove. */
export function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const setA = new Set(a)
  if (setA.size !== a.length) return false
  const setB = new Set(b)
  if (setB.size !== b.length) return false
  for (const id of setA) if (!setB.has(id)) return false
  return true
}

export function toQueueEntryView(entry: QueueEntryRow, captain: CaptainRow, stats: CaptainStats): QueueEntryView {
  return {
    id: entry.id,
    position: entry.position,
    team: {
      id: captain.id,
      name: captain.name,
      nickname: captain.nickname,
      gamesToday: stats.gamesToday,
      lastPlayedAt: stats.lastPlayedAt,
    },
  }
}
