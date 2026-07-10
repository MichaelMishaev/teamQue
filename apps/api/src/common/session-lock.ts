/**
 * Serializes every mutation that touches a session's line or its field's
 * live-match occupancy (add/reorder/move/remove-from-line, start-match,
 * session-close, and the undo of any of those) behind a Postgres
 * transaction-scoped advisory lock, keyed by session id. Released
 * automatically on commit/rollback (`pg_advisory_xact_lock`), so callers
 * never unlock explicitly.
 *
 * Why: the line has no single row that naturally serializes "read the
 * line, then act on it" (adding needs `max(position)+1`; starting a match
 * spans two tables). A lock keyed by session id turns every such mutation
 * into an effectively single-threaded sequence per session, which is what
 * makes gapless renumbering and single-field-single-live-match hold under
 * concurrent requests (N-9). Call this FIRST inside the transaction, before
 * any read the mutation depends on.
 */
import { sql } from 'drizzle-orm'
import type { Transaction } from '../db/db.module'

export async function lockSessionLine(tx: Transaction, sessionId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`)
}
