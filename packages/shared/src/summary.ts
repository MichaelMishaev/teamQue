/**
 * End-of-session report shape (technical-prd §7, GET /sessions/:id/summary).
 */
import { z } from 'zod'
import { captainIdSchema } from './ids'

export const sessionSummarySchema = z.object({
  totalMatches: z.number().int().min(0),
  uniqueCaptains: z.number().int().min(0),
  totalPlaySec: z.number().int().min(0),
  firstMatchAt: z.iso.datetime().nullable(),
  lastMatchEndedAt: z.iso.datetime().nullable(),
  avgActualDurationSec: z.number().min(0),
  topCaptains: z
    .array(
      z.object({
        captainId: captainIdSchema,
        name: z.string(),
        games: z.number().int().min(1),
      }),
    )
    .max(3),
  extensions: z.number().int().min(0),
  manualFinishes: z.number().int().min(0),
  autoFinishes: z.number().int().min(0),
})
export type SessionSummary = z.infer<typeof sessionSummarySchema>
