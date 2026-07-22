/**
 * Read-model shapes for the history/activity/session-list endpoints
 * (technical-prd §7). Re-added after the line-manager refactor removed the
 * old matches-in-queue model — these shapes are model-agnostic (they never
 * described a queue entry), so they carry over unchanged.
 */
import { z } from 'zod'
import { activityIdSchema, captainIdSchema, matchIdSchema, sessionIdSchema, staffIdSchema } from './ids.js'
import { errorCodeSchema } from './errors.js'
import { endReasonSchema, sessionStatusSchema } from './enums.js'

export const activityEventKindSchema = z.enum(['action', 'exception'])
export type ActivityEventKind = z.infer<typeof activityEventKindSchema>

export const activityOutcomeSchema = z.enum(['success', 'rejected', 'failed'])
export type ActivityOutcome = z.infer<typeof activityOutcomeSchema>

const activityEntryBaseSchema = z.object({
  id: activityIdSchema,
  sessionId: sessionIdSchema.nullable(),
  staffId: staffIdSchema.nullable(),
  staffName: z.string().nullable(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string(),
  createdAt: z.iso.datetime(),
})

const successfulActivityEntrySchema = activityEntryBaseSchema.extend({
  eventKind: z.literal('action'),
  outcome: z.literal('success'),
  statusCode: z.null(),
  errorCode: z.null(),
  requestMethod: z.null(),
  requestPath: z.null(),
  correlationId: z.null(),
  beforeJson: z.unknown().nullable(),
  afterJson: z.unknown().nullable(),
})

const exceptionActivityEntrySchema = activityEntryBaseSchema.extend({
  eventKind: z.literal('exception'),
  outcome: z.enum(['rejected', 'failed']),
  statusCode: z.number().int().min(400).max(599),
  errorCode: errorCodeSchema,
  requestMethod: z.string().min(1),
  requestPath: z.string().startsWith('/'),
  correlationId: z.uuid(),
  beforeJson: z.null(),
  afterJson: z.null(),
})

/** Transitional parser for the original GET /activity response shape. */
const legacyActivityEntrySchema = z
  .object({
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
  .strict()
  .transform((entry) => ({
    ...entry,
    staffName: null,
    eventKind: 'action' as const,
    outcome: 'success' as const,
    statusCode: null,
    errorCode: null,
    requestMethod: null,
    requestPath: null,
    correlationId: null,
  }))

/** GET /activity row shape — one successful action or safe exception record. */
export const activityEntrySchema = z.union([
  z.discriminatedUnion('eventKind', [successfulActivityEntrySchema, exceptionActivityEntrySchema]),
  legacyActivityEntrySchema,
])
export type ActivityEntry = z.infer<typeof activityEntrySchema>

export const activityActionFacetSchema = z.object({
  action: z.string().min(1),
  count: z.number().int().min(0),
})
export type ActivityActionFacet = z.infer<typeof activityActionFacetSchema>

export const activityActorFacetSchema = z.object({
  staffId: staffIdSchema,
  staffName: z.string(),
  count: z.number().int().min(0),
})
export type ActivityActorFacet = z.infer<typeof activityActorFacetSchema>

/** GET /activity/log — stable cursor pagination plus filter facets. */
export const activityLogPageSchema = z.object({
  items: z.array(activityEntrySchema),
  nextCursor: z.string().min(1).nullable(),
  actions: z.array(activityActionFacetSchema),
  actors: z.array(activityActorFacetSchema),
})
export type ActivityLogPage = z.infer<typeof activityLogPageSchema>

/** GET /sessions/:id/history row shape — one finished match. */
export const historyEntrySchema = z.object({
  id: matchIdSchema,
  captainAId: captainIdSchema,
  captainAName: z.string(),
  captainBId: captainIdSchema,
  captainBName: z.string(),
  fieldName: z.string().nullable(),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime(),
  endReason: endReasonSchema,
  plannedDurationSec: z.number().int().positive(),
  actualDurationSec: z.number().int().min(0),
  startedByName: z.string().nullable(),
  endedByName: z.string().nullable(),
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

/** GET /fields row shape — one active public field. */
export const fieldListItemSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(40),
  createdAt: z.iso.datetime(),
  queueLength: z.number().int().min(0),
  hasLiveMatch: z.boolean(),
})
export type FieldListItem = z.infer<typeof fieldListItemSchema>
