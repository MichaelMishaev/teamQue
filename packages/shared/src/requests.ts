/**
 * API request body schemas (technical-prd §7).
 */
import { z } from 'zod'
import { captainIdSchema, fieldIdSchema, queueEntryIdSchema, staffIdSchema } from './ids.js'

export const captainRefSchema = z.union([captainIdSchema, z.object({ newName: z.string().min(1).max(60) })])
export type CaptainRef = z.infer<typeof captainRefSchema>

/** Add ONE team to the line (line-manager model). Create inline if newName. */
export const addToLineSchema = z.object({
  team: captainRefSchema,
})
export type AddToLineBody = z.infer<typeof addToLineSchema>

/** Reorder the line — a full permutation of the current queue-entry ids. */
export const reorderLineSchema = z.object({
  entryIds: z.array(queueEntryIdSchema).min(1),
})
export type ReorderLineBody = z.infer<typeof reorderLineSchema>

/**
 * Start a match on a field by pairing two teams from the line. Omit entryIds to
 * pair the FRONT TWO of the line (the default kickoff); provide exactly two to
 * pair specific teams. fieldId optional — inferred on the single-field MVP.
 */
export const startMatchSchema = z.object({
  fieldId: fieldIdSchema.optional(),
  entryIds: z.tuple([queueEntryIdSchema, queueEntryIdSchema]).optional(),
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

/** Open-fields pivot: anyone creates a field (backed 1:1 by a session). */
export const createFieldSchema = z.object({
  name: z.string().min(1).max(40),
  matchDurationSec: z.number().int().min(60).max(3600),
})
export type CreateFieldBody = z.infer<typeof createFieldSchema>

/** First-mutation identity: a visitor picks a nickname, gets a cookie. */
export const visitorHelloSchema = z.object({
  nickname: z.string().min(1).max(30),
})
export type VisitorHelloBody = z.infer<typeof visitorHelloSchema>
