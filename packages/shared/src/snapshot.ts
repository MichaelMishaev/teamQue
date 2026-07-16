/**
 * Full-session snapshot broadcast over the socket (technical-prd §5).
 * The client is a dumb renderer of the latest snapshot.
 */
import { z } from 'zod'
import { sessionIdSchema } from './ids.js'
import { sessionStatusSchema } from './enums.js'
import { fieldViewSchema, queueEntryViewSchema } from './views.js'

export const sessionSnapshotSchema = z.object({
  session: z.object({
    id: sessionIdSchema,
    slug: z.string().min(1),
    date: z.iso.date(),
    location: z.string().max(120).nullable(),
    matchDurationSec: z.number().int().positive(),
    status: sessionStatusSchema,
  }),
  fields: z.array(fieldViewSchema),
  // The line of waiting teams — single-team entries, not matches.
  queue: z.array(queueEntryViewSchema),
  emittedAt: z.iso.datetime(),
  serverNow: z.iso.datetime(),
})
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>

export const SOCKET_EVENTS = { snapshot: 'session:snapshot' } as const
