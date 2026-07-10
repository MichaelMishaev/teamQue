/**
 * Entity id schemas — all UUIDs (technical-prd §3: UUID v7 primary keys).
 */
import { z } from 'zod'

export const centerIdSchema = z.uuid()
export const staffIdSchema = z.uuid()
export const captainIdSchema = z.uuid()
export const sessionIdSchema = z.uuid()
export const fieldIdSchema = z.uuid()
export const matchIdSchema = z.uuid()
export const activityIdSchema = z.uuid()

export type CenterId = z.infer<typeof centerIdSchema>
export type StaffId = z.infer<typeof staffIdSchema>
export type CaptainId = z.infer<typeof captainIdSchema>
export type SessionId = z.infer<typeof sessionIdSchema>
export type FieldId = z.infer<typeof fieldIdSchema>
export type MatchId = z.infer<typeof matchIdSchema>
export type ActivityId = z.infer<typeof activityIdSchema>
