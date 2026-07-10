/**
 * Every mutation writes an activity_log row in the SAME transaction (N-12,
 * technical-prd §3). Called with the caller's own `tx`, never DRIZZLE
 * directly, so the log row can never commit without its mutation (or vice
 * versa).
 *
 * LANDMINE: `activityLog.createdAt` (src/db/schema.ts) is `.notNull()` with
 * NO `.defaultNow()` — deliberate, so the log's timestamp always comes from
 * the same transaction as its mutation. It MUST be set explicitly here or
 * the insert fails on NOT NULL.
 *
 * `write()` returns the created row's id — the undo domain (POST
 * /actions/:activityId/undo) needs it to reference the exact activity a
 * mutation produced.
 */
import { Injectable } from '@nestjs/common'
import type { Transaction } from '../db/db.module'
import { activityLog } from '../db/schema'

export type ActivityEntry = {
  centerId: string
  sessionId?: string | null
  staffId?: string | null
  action: string
  entityType: string
  entityId: string
  beforeJson?: unknown
  afterJson?: unknown
}

@Injectable()
export class ActivityWriter {
  async write(tx: Transaction, entry: ActivityEntry): Promise<string> {
    const [row] = await tx
      .insert(activityLog)
      .values({
        centerId: entry.centerId,
        sessionId: entry.sessionId ?? null,
        staffId: entry.staffId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeJson: entry.beforeJson ?? null,
        afterJson: entry.afterJson ?? null,
        createdAt: new Date(),
      })
      .returning({ id: activityLog.id })
    if (!row) throw new Error('activity_log insert returned no row')
    return row.id
  }
}
