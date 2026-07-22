/**
 * Privacy-safe analytics contract for the read-only public line. The public
 * endpoint accepts only bounded aggregate values: no names, free text,
 * referrers, user-agent strings, or persistent device identifiers.
 */
import { z } from 'zod'

export const publicLineViewportSchema = z.enum(['mobile', 'tablet', 'desktop'])
export type PublicLineViewport = z.infer<typeof publicLineViewportSchema>

export const publicLineDisplayModeSchema = z.enum(['browser', 'standalone'])
export type PublicLineDisplayMode = z.infer<typeof publicLineDisplayModeSchema>

const visitIdSchema = z.uuid()
const countSchema = z.number().int().min(0).max(1_000)
const waitSecSchema = z.number().int().min(0).max(24 * 60 * 60).nullable()

export const publicLineViewedEventSchema = z
  .object({
    type: z.literal('viewed'),
    visitId: visitIdSchema,
    viewport: publicLineViewportSchema,
    displayMode: publicLineDisplayModeSchema,
    queueCount: countSchema,
    pairCount: countSchema,
    hasUnpairedTeam: z.boolean(),
    hasLiveMatch: z.boolean(),
    firstWaitSec: waitSecSchema,
    lastWaitSec: waitSecSchema,
  })
  .strict()

export const publicLineVisitEndedEventSchema = z
  .object({
    type: z.literal('visit_ended'),
    visitId: visitIdSchema,
    viewport: publicLineViewportSchema,
    displayMode: publicLineDisplayModeSchema,
    durationSec: z.number().int().min(0).max(24 * 60 * 60),
    visibleSec: z.number().int().min(0).max(24 * 60 * 60),
    snapshotCount: z.number().int().min(1).max(100_000),
    offlineCount: countSchema,
    maxQueueCount: countSchema,
    maxPairCount: countSchema,
    sawLiveMatch: z.boolean(),
  })
  .strict()
  .refine((event) => event.visibleSec <= event.durationSec, {
    message: 'visibleSec cannot exceed durationSec',
    path: ['visibleSec'],
  })

export const publicLineTelemetryEventSchema = z.discriminatedUnion('type', [
  publicLineViewedEventSchema,
  publicLineVisitEndedEventSchema,
])
export type PublicLineTelemetryEvent = z.infer<typeof publicLineTelemetryEventSchema>
export type PublicLineViewedEvent = z.infer<typeof publicLineViewedEventSchema>
export type PublicLineVisitEndedEvent = z.infer<typeof publicLineVisitEndedEventSchema>
