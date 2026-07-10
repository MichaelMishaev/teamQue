/**
 * API request body schemas (technical-prd §7).
 */
import { z } from 'zod'
import { captainIdSchema, fieldIdSchema, matchIdSchema, staffIdSchema } from './ids.js'

const captainRefSchema = z.union([captainIdSchema, z.object({ newName: z.string().min(1).max(60) })])

export const quickAddMatchSchema = z.object({
  captainA: captainRefSchema,
  captainB: captainRefSchema,
})
export type QuickAddMatchBody = z.infer<typeof quickAddMatchSchema>

export const reorderQueueSchema = z.object({
  matchIds: z.array(matchIdSchema).min(1),
})
export type ReorderQueueBody = z.infer<typeof reorderQueueSchema>

export const startMatchSchema = z.object({
  fieldId: fieldIdSchema.optional(),
})
export type StartMatchBody = z.infer<typeof startMatchSchema>

export const extendMatchSchema = z.object({
  addSec: z.number().int().positive().max(600),
})
export type ExtendMatchBody = z.infer<typeof extendMatchSchema>

export const loginSchema = z.object({
  staffId: staffIdSchema,
  pin: z.string().regex(/^\d{4}$/),
})
export type LoginBody = z.infer<typeof loginSchema>

export const centerUnlockSchema = z.object({
  pin: z.string().min(4).max(12),
})
export type CenterUnlockBody = z.infer<typeof centerUnlockSchema>

export const openSessionSchema = z.object({
  location: z.string().max(120).optional(),
  matchDurationSec: z.number().int().min(60).max(3600),
})
export type OpenSessionBody = z.infer<typeof openSessionSchema>

export const updateSessionSchema = z.object({
  matchDurationSec: z.number().int().min(60).max(3600).optional(),
  location: z.string().max(120).optional(),
})
export type UpdateSessionBody = z.infer<typeof updateSessionSchema>

export const createCaptainSchema = z.object({
  name: z.string().min(1).max(60),
  nickname: z.string().max(60).optional(),
  note: z.string().max(500).optional(),
  tags: z.array(z.string()).max(10).optional(),
})
export type CreateCaptainBody = z.infer<typeof createCaptainSchema>

export const updateCaptainSchema = createCaptainSchema.partial()
export type UpdateCaptainBody = z.infer<typeof updateCaptainSchema>
