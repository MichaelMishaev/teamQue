/**
 * Read models carried by the session snapshot (technical-prd §5).
 */
import { z } from 'zod'
import { captainIdSchema, fieldIdSchema, matchIdSchema, queueEntryIdSchema } from './ids.js'
import { matchStatusSchema } from './enums.js'

export const captainViewSchema = z.object({
  id: captainIdSchema,
  name: z.string().min(1).max(60),
  nickname: z.string().max(60).nullable(),
  gamesToday: z.number().int().min(0),
  lastPlayedAt: z.iso.datetime().nullable(),
})
export type CaptainView = z.infer<typeof captainViewSchema>

/** GET/POST/PATCH /captains row shape (features-prd US-022/US-023): captainView
 * plus the staff-only fields (private note, tags) and all-time match count. */
export const captainSearchResultSchema = captainViewSchema.extend({
  note: z.string().max(500).nullable(),
  tags: z.array(z.string()).max(10),
  totalMatches: z.number().int().min(0),
})
export type CaptainSearchResult = z.infer<typeof captainSearchResultSchema>

/**
 * The LINE is a list of single teams waiting (line-manager model): one team per
 * entry, position-ordered. Two teams pair into a match only at kickoff — a queue
 * entry is never "A vs B". Carries the team's fairness stats inline (gamesToday /
 * lastPlayedAt) so the manager sees them at a glance while managing the line.
 */
export const queueEntryViewSchema = z.object({
  id: queueEntryIdSchema,
  position: z.number().int().min(1),
  team: captainViewSchema,
})
export type QueueEntryView = z.infer<typeof queueEntryViewSchema>

/**
 * A match = two teams playing on a field. Only ever live | paused | finished |
 * cancelled — matches are created directly as live at kickoff, never queued
 * (the queue holds single teams, not matches).
 */
export const matchViewSchema = z.object({
  id: matchIdSchema,
  captainA: captainViewSchema,
  captainB: captainViewSchema,
  status: matchStatusSchema,
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
