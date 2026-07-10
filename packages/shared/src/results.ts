/**
 * Mutation result shapes that carry more than the mutated entity itself —
 * mostly the `activityId` a client needs to call POST /actions/:id/undo
 * (technical-prd §7). Re-added after the line-manager refactor removed the
 * old matches module (these were dropped along with it, not because the
 * shapes changed).
 */
import { z } from 'zod'
import { activityIdSchema } from './ids.js'
import { matchViewSchema } from './views.js'

/** DELETE /line/:entryId result — undoable via activityId (5s). */
export const removeFromLineResultSchema = z.object({
  activityId: activityIdSchema,
})
export type RemoveFromLineResult = z.infer<typeof removeFromLineResultSchema>

/** PATCH /sessions/:id/line result — undoable via activityId (5s). */
export const reorderLineResultSchema = z.object({
  activityId: activityIdSchema,
})
export type ReorderLineResult = z.infer<typeof reorderLineResultSchema>

/** POST /matches/:id/finish result — undoable via activityId (30s). */
export const finishMatchResultSchema = z.object({
  match: matchViewSchema,
  activityId: activityIdSchema,
})
export type FinishMatchResult = z.infer<typeof finishMatchResultSchema>

/** POST /actions/:activityId/undo result. */
export const undoResultSchema = z.object({
  ok: z.literal(true),
})
export type UndoResult = z.infer<typeof undoResultSchema>
