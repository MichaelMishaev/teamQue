/**
 * Drizzle schema — technical-prd §3, implemented verbatim.
 * Enum value lists are sourced from `shared`'s zod enums so the DB and the
 * API/web contracts cannot drift.
 */
import { endReasonSchema, matchStatusSchema, sessionStatusSchema, staffRoleSchema } from 'shared'
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

// zod v4's `.options` is typed as `string[]`, not pgEnum's required
// `[string, ...string[]]` tuple. The cast is safe: these always come from a
// non-empty zod enum, and this is the only place the mismatch is absorbed —
// every value still flows from the shared schema, so DB and contracts can't drift.
function enumValues(options: readonly string[]): [string, ...string[]] {
  return options as [string, ...string[]]
}

export const staffRoleEnum = pgEnum('staff_role', enumValues(staffRoleSchema.options))
export const sessionStatusEnum = pgEnum('session_status', enumValues(sessionStatusSchema.options))
export const matchStatusEnum = pgEnum('match_status', enumValues(matchStatusSchema.options))
export const endReasonEnum = pgEnum('end_reason', enumValues(endReasonSchema.options))

export const centers = pgTable('centers', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  pinHash: text('pin_hash').notNull(),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const staff = pgTable('staff', {
  id: uuid('id').primaryKey().defaultRandom(),
  centerId: uuid('center_id')
    .notNull()
    .references(() => centers.id),
  name: text('name').notNull(),
  role: staffRoleEnum('role').notNull(),
  pinHash: text('pin_hash').notNull(),
  active: boolean('active').notNull().default(true),
  // Phase 2b lockout (planned columns, added now per PRD staff-lockout note).
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const captains = pgTable('captains', {
  id: uuid('id').primaryKey().defaultRandom(),
  centerId: uuid('center_id')
    .notNull()
    .references(() => centers.id),
  name: text('name').notNull(),
  nickname: text('nickname'),
  note: text('note'),
  tags: text('tags').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    centerId: uuid('center_id')
      .notNull()
      .references(() => centers.id),
    date: date('date').notNull(),
    location: text('location'),
    matchDurationSec: integer('match_duration_sec').notNull(),
    status: sessionStatusEnum('status').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('one_active_session').on(table.centerId).where(sql`${table.status} = 'active'`),
  ],
)

export const fields = pgTable('fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => sessions.id),
  centerId: uuid('center_id').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
})

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    centerId: uuid('center_id').notNull(),
    fieldId: uuid('field_id').references(() => fields.id),
    captainAId: uuid('captain_a_id')
      .notNull()
      .references(() => captains.id),
    captainBId: uuid('captain_b_id')
      .notNull()
      .references(() => captains.id),
    status: matchStatusEnum('status').notNull(),
    queuePosition: integer('queue_position'),
    plannedDurationSec: integer('planned_duration_sec').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    accumulatedPauseSec: integer('accumulated_pause_sec').notNull().default(0),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    endReason: endReasonEnum('end_reason'),
    startedBy: uuid('started_by').references(() => staff.id),
    endedBy: uuid('ended_by').references(() => staff.id),
  },
  (table) => [
    uniqueIndex('one_live_match_per_field')
      .on(table.fieldId)
      .where(sql`${table.status} IN ('live','paused')`),
    index('matches_session_status_idx').on(table.sessionId, table.status),
    index('matches_session_captain_a_idx').on(table.sessionId, table.captainAId),
    index('matches_session_captain_b_idx').on(table.sessionId, table.captainBId),
    check('captain_a_ne_captain_b', sql`${table.captainAId} <> ${table.captainBId}`),
  ],
)

/**
 * The line: single-team entries waiting for a field (line-manager model,
 * technical-prd refactor). A row is ONE team, never "A vs B" — two entries
 * pair into a `matches` row only at kickoff (POST /sessions/:id/start),
 * which deletes both rows here. `position` is renumbered 1..n on every
 * line mutation; see queue/line.service.ts for the per-session advisory
 * lock that keeps renumbering race-free.
 */
export const queueEntries = pgTable(
  'queue_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id),
    centerId: uuid('center_id').notNull(),
    captainId: uuid('captain_id')
      .notNull()
      .references(() => captains.id),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('queue_entries_session_position_idx').on(table.sessionId, table.position)],
)

export const activityLog = pgTable('activity_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  centerId: uuid('center_id').notNull(),
  sessionId: uuid('session_id').references(() => sessions.id),
  staffId: uuid('staff_id').references(() => staff.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})
