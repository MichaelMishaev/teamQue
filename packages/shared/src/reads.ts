/**
 * Read-model shapes for the history/activity/session-list endpoints
 * (technical-prd §7). Re-added after the line-manager refactor removed the
 * old matches-in-queue model — these shapes are model-agnostic (they never
 * described a queue entry), so they carry over unchanged.
 */
import { z } from 'zod'
import { activityIdSchema, captainIdSchema, matchIdSchema, sessionIdSchema, staffIdSchema } from './ids.js'
import { endReasonSchema, sessionStatusSchema } from './enums.js'

/** GET /activity row shape — one activity_log entry. */
export const activityEntrySchema = z.object({
  id: activityIdSchema,
  sessionId: sessionIdSchema.nullable(),
  staffId: staffIdSchema.nullable(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
  createdAt: z.iso.datetime(),
})
export type ActivityEntry = z.infer<typeof activityEntrySchema>

/** GET /sessions/:id/history row shape — one finished match. */
export const historyEntrySchema = z.object({
  id: matchIdSchema,
  captainAId: captainIdSchema,
  captainAName: z.string(),
  captainBId: captainIdSchema,
  captainBName: z.string(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  endReason: endReasonSchema,
  actualDurationSec: z.number().int().min(0),
})
export type HistoryEntry = z.infer<typeof historyEntrySchema>

/** GET /sessions?from=&to= row shape — one past session. */
export const sessionListItemSchema = z.object({
  id: sessionIdSchema,
  date: z.iso.date(),
  location: z.string().nullable(),
  status: sessionStatusSchema,
  matchCount: z.number().int().min(0),
})
export type SessionListItem = z.infer<typeof sessionListItemSchema>
