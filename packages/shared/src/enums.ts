/**
 * Domain enums (technical-prd §3 data model CHECK constraints).
 */
import { z } from 'zod'

export const matchStatusSchema = z.enum(['queued', 'live', 'paused', 'finished', 'cancelled'])
export type MatchStatus = z.infer<typeof matchStatusSchema>

export const endReasonSchema = z.enum(['auto', 'manual', 'cancelled'])
export type EndReason = z.infer<typeof endReasonSchema>

export const staffRoleSchema = z.enum(['manager', 'staff'])
export type StaffRole = z.infer<typeof staffRoleSchema>

export const sessionStatusSchema = z.enum(['active', 'closed'])
export type SessionStatus = z.infer<typeof sessionStatusSchema>
