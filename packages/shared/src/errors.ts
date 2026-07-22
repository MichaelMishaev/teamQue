/**
 * Domain error codes and the API error envelope (technical-prd §8).
 * `code` is the client's i18n key input; UI never displays raw server messages.
 */
import { z } from 'zod'

export const errorCodeSchema = z.enum([
  'INVALID_TRANSITION',
  'CAPTAIN_ALREADY_PLAYING',
  'FIELD_OCCUPIED',
  'LINE_TOO_SHORT',
  'UNDO_EXPIRED',
  'SESSION_CLOSED',
  'SESSION_ALREADY_ACTIVE',
  'SESSION_HAS_LIVE_MATCH',
  'FIELD_CLOSED',
  'PIN_LOCKED',
  'VALIDATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
])
export type ErrorCode = z.infer<typeof errorCodeSchema>

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  details: z.unknown().optional(),
  correlationId: z.uuid().optional(),
})
export type ApiError = z.infer<typeof apiErrorSchema>
