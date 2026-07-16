/**
 * Open-fields service (spec §3/§4): a public "field" is one sessions row +
 * its single child fields row. create() retries slug collisions against the
 * sessions_slug_unique index; forceClose() is close-regardless — it cancels
 * live/paused matches first (public fields have no owner to wait for), then
 * reuses the same clear-line + close shape as SessionsService.close.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { CreateFieldBody, FieldListItem, SessionSnapshot } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { NotFoundError } from '../common/errors'
import { lockSessionLine } from '../common/session-lock'
import { DRIZZLE, type Database } from '../db/db.module'
import { fields, matches, queueEntries, sessions } from '../db/schema'
import { SessionEventsService } from '../realtime/session-events.service'
import { SnapshotService } from '../sessions/snapshot.service'
import { todayInJerusalem } from '../sessions/date'
import { generateSlug } from './slug'

const SLUG_UNIQUE_CONSTRAINT = 'sessions_slug_unique'
const CREATE_RETRIES = 3

@Injectable()
export class FieldsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
    @Inject(SessionEventsService) private readonly sessionEvents: SessionEventsService,
  ) {}

  async create(centerId: string, staffId: string, body: CreateFieldBody): Promise<{ slug: string; snapshot: SessionSnapshot }> {
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

  async resolve(slug: string): Promise<SessionSnapshot> {
    const sessionId = await this.sessionIdBySlug(slug)
    return this.snapshotService.buildSnapshotBySessionId(sessionId)
  }

  async closeBySlug(slug: string, staffId: string): Promise<{ slug: string; status: 'closed' }> {
    const sessionId = await this.sessionIdBySlug(slug)
    await this.forceClose(sessionId, staffId)
    return { slug, status: 'closed' }
  }

  /** Close regardless of live matches. Idempotent: already-closed → no-op.
   * Also the expiry sweep's workhorse (expiry.service.ts). */
  async forceClose(sessionId: string, staffId: string): Promise<void> {
    const didClose = await this.db.transaction(async (tx) => {
      await lockSessionLine(tx, sessionId)

      const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
      if (!session || session.status === 'closed') return false

      const stopped = await tx
        .update(matches)
        .set({ status: 'cancelled', endReason: 'cancelled', endedAt: new Date(), endedBy: staffId })
        .where(and(eq(matches.sessionId, sessionId), inArray(matches.status, ['live', 'paused', 'queued'])))
        .returning({ id: matches.id })

      for (const match of stopped) {
        await this.activity.write(tx, {
          centerId: session.centerId,
          sessionId,
          staffId,
          action: 'match.cancelled',
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

      await tx.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, sessionId))
      await this.activity.write(tx, {
        centerId: session.centerId,
        sessionId,
        staffId,
        action: 'field.closed',
        entityType: 'session',
        entityId: sessionId,
      })
      return true
    })

    if (didClose) await this.sessionEvents.broadcast(sessionId)
  }

  private async sessionIdBySlug(slug: string): Promise<string> {
    const [row] = await this.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.slug, slug)).limit(1)
    if (!row) throw new NotFoundError('Field not found')
    return row.id
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
