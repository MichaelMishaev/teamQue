/**
 * Open-fields service (spec §3/§4): a public "field" is one sessions row +
 * its single child fields row. create() retries slug collisions against the
 * sessions_slug_unique index; forceClose() is close-regardless — it cancels
 * live/paused matches first (public fields have no owner to wait for), then
 * reuses the same clear-line + close shape as SessionsService.close.
 */
import { ConflictException, Inject, Injectable } from '@nestjs/common'
import { hash, verify } from '@node-rs/argon2'
import { and, asc, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import {
  DAILY_RESET_WARNING_SEC,
  DEFAULT_FIELD_NAME,
  dailyResetWarningSeconds,
  nextJerusalemDailyResetAt,
  type CreateFieldBody,
  type FieldListItem,
  type SessionSnapshot,
} from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { NotFoundError } from '../common/errors'
import { lockSessionLine } from '../common/session-lock'
import { DRIZZLE, type Database } from '../db/db.module'
import { activityLog, centers, fields, matches, queueEntries, sessions } from '../db/schema'
import { SessionEventsService } from '../realtime/session-events.service'
import { SnapshotService } from '../sessions/snapshot.service'
import { todayInJerusalem } from '../sessions/date'
import { generateSlug } from './slug'

const SLUG_UNIQUE_CONSTRAINT = 'sessions_slug_unique'
const CREATE_RETRIES = 3
const DAILY_RESET_ACTION = 'field.daily_reset'
const DAILY_RESET_STOP_ACTION = 'field.daily_reset.stopped'

@Injectable()
export class FieldsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
    @Inject(SessionEventsService) private readonly sessionEvents: SessionEventsService,
  ) {}

  async create(centerId: string, staffId: string, body: CreateFieldBody): Promise<{ slug: string; snapshot: SessionSnapshot }> {
    const accessPinHash = body.password === undefined ? null : await hash(body.password)
    let lastError: unknown = null
    for (let attempt = 0; attempt < CREATE_RETRIES; attempt += 1) {
      const slug = generateSlug()
      try {
        const session = await this.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(sessions)
            .values({
              centerId,
              date: todayInJerusalem(),
              location: null,
              slug,
              accessPinHash,
              matchDurationSec: body.matchDurationSec,
              status: 'active',
              createdBy: staffId,
            })
            .returning()
          if (!row) throw new Error('session insert returned no row')

          await tx.insert(fields).values({ sessionId: row.id, centerId, name: body.name, position: 0 })

          await this.activity.write(tx, {
            centerId,
            sessionId: row.id,
            staffId,
            action: 'field.created',
            entityType: 'session',
            entityId: row.id,
            afterJson: row,
          })
          return row
        })

        await this.sessionEvents.broadcast(session.id)
        return { slug, snapshot: await this.snapshotService.buildSnapshotBySessionId(session.id) }
      } catch (error) {
        if (!isSlugCollision(error)) throw error
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('slug generation exhausted retries')
  }

  async list(centerId: string): Promise<FieldListItem[]> {
    const rows = await this.db
      .select({
        slug: sessions.slug,
        createdAt: sessions.createdAt,
        name: fields.name,
        queueLength: sql<number>`(SELECT count(*) FROM ${queueEntries} WHERE ${queueEntries.sessionId} = ${sessions.id})::int`,
        hasLiveMatch: sql<boolean>`EXISTS (SELECT 1 FROM ${matches} WHERE ${matches.sessionId} = ${sessions.id} AND ${matches.status} IN ('live','paused'))`,
      })
      .from(sessions)
      .innerJoin(fields, eq(fields.sessionId, sessions.id))
      .where(and(eq(sessions.centerId, centerId), eq(sessions.status, 'active'), eq(fields.position, 0)))
      .orderBy(desc(sessions.createdAt))

    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      queueLength: Number(row.queueLength),
      hasLiveMatch: row.hasLiveMatch,
    }))
  }

  async listForConfiguredCenter(): Promise<FieldListItem[]> {
    const [center] = await this.db.select({ id: centers.id }).from(centers).orderBy(asc(centers.createdAt)).limit(1)
    return center === undefined ? [] : this.list(center.id)
  }

  async resolve(slug: string, centerId: string): Promise<SessionSnapshot> {
    const sessionId = await this.sessionIdBySlug(slug, centerId)
    return this.snapshotService.buildSnapshotBySessionId(sessionId)
  }

  async isPasswordProtected(slug: string, centerId: string): Promise<boolean> {
    return (await this.accessPinHashBySlug(slug, centerId)) !== null
  }

  async verifyPassword(slug: string, centerId: string, password: string): Promise<boolean> {
    const accessPinHash = await this.accessPinHashBySlug(slug, centerId)
    return accessPinHash !== null && (await verify(accessPinHash, password))
  }

  /** Suppress only the upcoming 05:00 reset. The activity row is the durable
   * one-day marker; no mutable preference or schema column is needed. */
  async stopDailyReset(slug: string, centerId: string, staffId: string, now: Date = new Date()): Promise<{ resetAt: string; stopped: true }> {
    const resetAt = nextJerusalemDailyResetAt(now)
    if (dailyResetWarningSeconds(resetAt, now) === null) throw new ConflictException('Daily reset can only be stopped during its warning window')

    const sessionId = await this.db.transaction(async (tx) => {
      const [owned] = await tx
        .select({ id: sessions.id, centerId: sessions.centerId, status: sessions.status })
        .from(sessions)
        .where(and(eq(sessions.slug, slug), eq(sessions.centerId, centerId)))
        .limit(1)
      if (!owned) throw new NotFoundError('Field not found')
      if (owned.status !== 'active') throw new ConflictException('Field is closed')

      await lockSessionLine(tx, owned.id)
      const warningStartsAt = new Date(resetAt.getTime() - DAILY_RESET_WARNING_SEC * 1000)
      const [alreadyReset] = await tx
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.sessionId, owned.id),
            eq(activityLog.action, DAILY_RESET_ACTION),
            gte(activityLog.createdAt, resetAt),
          ),
        )
        .limit(1)
      if (alreadyReset) throw new ConflictException('Daily reset already ran')
      const [existing] = await tx
        .select({ id: activityLog.id })
        .from(activityLog)
        .where(
          and(
            eq(activityLog.sessionId, owned.id),
            eq(activityLog.action, DAILY_RESET_STOP_ACTION),
            gte(activityLog.createdAt, warningStartsAt),
            lt(activityLog.createdAt, resetAt),
          ),
        )
        .limit(1)
      if (!existing) {
        await this.activity.write(tx, {
          centerId,
          sessionId: owned.id,
          staffId,
          action: DAILY_RESET_STOP_ACTION,
          entityType: 'session',
          entityId: owned.id,
          afterJson: { resetAt: resetAt.toISOString() },
        })
      }
      return owned.id
    })

    // Do not touch last_activity_at here: the stop marker is the source of
    // truth and the snapshot query must observe the same upcoming boundary.
    await this.sessionEvents.broadcast(sessionId, false)
    return { resetAt: resetAt.toISOString(), stopped: true }
  }

  /** Critical automatic transition. The lock + in-transaction marker check
   * makes concurrent scheduler instances exactly-one-wins and lets a Stop
   * committed before the boundary win. */
  async dailyReset(sessionId: string, resetAt: Date): Promise<boolean> {
    return this.forceClose(sessionId, null, DAILY_RESET_ACTION, true, true, resetAt)
  }

  async closeBySlug(slug: string, centerId: string, staffId: string): Promise<{ slug: string; status: 'closed' }> {
    const [field] = await this.db
      .select({ sessionId: sessions.id, name: fields.name, matchDurationSec: sessions.matchDurationSec })
      .from(sessions)
      .innerJoin(fields, eq(fields.sessionId, sessions.id))
      .where(and(eq(sessions.slug, slug), eq(sessions.centerId, centerId), eq(fields.position, 0)))
      .limit(1)
    if (!field) throw new NotFoundError('Field not found')

    const isDefaultField = field.name === DEFAULT_FIELD_NAME
    await this.forceClose(field.sessionId, staffId, isDefaultField ? 'field.evening.ended' : 'field.closed', isDefaultField, isDefaultField)
    return { slug, status: 'closed' }
  }

  /** Close regardless of live matches. Idempotent: already-closed → no-op.
   * Also the expiry sweep's workhorse (expiry.service.ts), which passes
   * action='field.expired' so the activity row is distinguishable from a
   * manual close. */
  async forceClose(
    sessionId: string,
    staffId: string | null,
    action: 'field.closed' | 'field.expired' | 'field.evening.ended' | 'field.daily_reset' = 'field.closed',
    finishActiveMatch = false,
    keepActive = false,
    resetAt?: Date,
  ): Promise<boolean> {
    const didClose = await this.db.transaction(async (tx) => {
      await lockSessionLine(tx, sessionId)

      const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
      if (!session || session.status === 'closed') return false

      if (resetAt !== undefined) {
        if (session.createdAt.getTime() >= resetAt.getTime()) return false
        const warningStartsAt = new Date(resetAt.getTime() - DAILY_RESET_WARNING_SEC * 1000)
        const [blocked] = await tx
          .select({ id: activityLog.id })
          .from(activityLog)
          .where(
            and(
              eq(activityLog.sessionId, sessionId),
              or(
                and(eq(activityLog.action, DAILY_RESET_ACTION), gte(activityLog.createdAt, resetAt)),
                and(
                  eq(activityLog.action, DAILY_RESET_STOP_ACTION),
                  gte(activityLog.createdAt, warningStartsAt),
                  lt(activityLog.createdAt, resetAt),
                ),
              ),
            ),
          )
          .limit(1)
        if (blocked) return false
      }

      const endedAt = new Date()
      const automaticReset = action === DAILY_RESET_ACTION
      const finalAccumulatedPauseSec = sql<number>`${matches.accumulatedPauseSec}
        + case when ${matches.pausedAt} is null then 0 else floor(extract(epoch from (${endedAt}::timestamptz - ${matches.pausedAt})))::int end`
      const stopped = finishActiveMatch
        ? [
            ...(await tx
              .update(matches)
              .set({
                status: 'finished',
                endReason: automaticReset ? 'auto' : 'manual',
                endedAt,
                endedBy: staffId,
                pausedAt: null,
                accumulatedPauseSec: finalAccumulatedPauseSec,
              })
              .where(and(eq(matches.sessionId, sessionId), inArray(matches.status, ['live', 'paused'])))
              .returning({ id: matches.id, action: sql<'match.finished'>`'match.finished'` })),
            ...(await tx
              .update(matches)
              .set({ status: 'cancelled', endReason: 'cancelled', endedAt, endedBy: staffId })
              .where(and(eq(matches.sessionId, sessionId), eq(matches.status, 'queued')))
              .returning({ id: matches.id, action: sql<'match.cancelled'>`'match.cancelled'` })),
          ]
        : await tx
            .update(matches)
            .set({ status: 'cancelled', endReason: 'cancelled', endedAt, endedBy: staffId })
            .where(and(eq(matches.sessionId, sessionId), inArray(matches.status, ['live', 'paused', 'queued'])))
            .returning({ id: matches.id, action: sql<'match.cancelled'>`'match.cancelled'` })

      for (const match of stopped) {
        await this.activity.write(tx, {
          centerId: session.centerId,
          sessionId,
          staffId,
          action: match.action,
          entityType: 'match',
          entityId: match.id,
        })
      }

      const cleared = await tx.delete(queueEntries).where(eq(queueEntries.sessionId, sessionId)).returning({ id: queueEntries.id })
      if (cleared.length > 0) {
        await this.activity.write(tx, {
          centerId: session.centerId,
          sessionId,
          staffId,
          action: 'line.cleared',
          entityType: 'session',
          entityId: sessionId,
          beforeJson: { queueEntryIds: cleared.map((entry) => entry.id) },
        })
      }

      if (keepActive) {
        await tx.update(sessions).set({ lastActivityAt: new Date() }).where(eq(sessions.id, sessionId))
      } else {
        await tx.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, sessionId))
      }
      await this.activity.write(tx, {
        centerId: session.centerId,
        sessionId,
        staffId,
        action,
        entityType: 'session',
        entityId: sessionId,
        ...(resetAt === undefined ? {} : { afterJson: { resetAt: resetAt.toISOString() } }),
      })
      return true
    })

    if (didClose) await this.sessionEvents.broadcast(sessionId)
    return didClose
  }

  private async sessionIdBySlug(slug: string, centerId: string): Promise<string> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.slug, slug), eq(sessions.centerId, centerId)))
      .limit(1)
    if (!row) throw new NotFoundError('Field not found')
    return row.id
  }

  private async accessPinHashBySlug(slug: string, centerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ accessPinHash: sessions.accessPinHash })
      .from(sessions)
      .where(and(eq(sessions.slug, slug), eq(sessions.centerId, centerId)))
      .limit(1)
    if (!row) throw new NotFoundError('Field not found')
    return row.accessPinHash
  }
}

function isSlugCollision(error: unknown): boolean {
  const candidates = [error, typeof error === 'object' && error !== null && 'cause' in error ? (error as { cause: unknown }).cause : undefined]
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === SLUG_UNIQUE_CONSTRAINT,
  )
}
