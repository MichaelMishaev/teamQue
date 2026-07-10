/**
 * Read models carried by the session snapshot (technical-prd §5).
 */
import { z } from 'zod'
import { captainIdSchema, fieldIdSchema, matchIdSchema } from './ids.js'
import { matchStatusSchema } from './enums.js'

export const captainViewSchema = z.object({
  id: captainIdSchema,
  name: z.string().min(1).max(60),
  nickname: z.string().max(60).nullable(),
  gamesToday: z.number().int().min(0),
  lastPlayedAt: z.iso.datetime().nullable(),
})
export type CaptainView = z.infer<typeof captainViewSchema>

export const matchViewSchema = z.object({
  id: matchIdSchema,
  captainA: captainViewSchema,
  captainB: captainViewSchema,
  status: matchStatusSchema,
  queuePosition: z.number().int().min(1).nullable(),
  plannedDurationSec: z.number().int().positive(),
  startedAt: z.iso.datetime().nullable(),
  pausedAt: z.iso.datetime().nullable(),
  accumulatedPauseSec: z.number().int().min(0),
  endsAt: z.iso.datetime().nullable(),
})
export type MatchView = z.infer<typeof matchViewSchema>

export const fieldViewSchema = z.object({
  id: fieldIdSchema,
  name: z.string().min(1).max(40),
  position: z.number().int().min(0),
  liveMatch: matchViewSchema.nullable(),
})
export type FieldView = z.infer<typeof fieldViewSchema>
