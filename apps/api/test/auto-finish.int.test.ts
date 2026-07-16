/**
 * Auto-finish scheduler (technical-prd §4): a live match whose computed end
 * time has passed is finished by the next tick — derived purely from DB
 * state, conditional UPDATE guards against double-firing under parallel
 * ticks (N-9). Exercises AutoFinishService directly against a real Postgres
 * (Testcontainers), calling `.tick()` rather than waiting for the real
 * @Interval(5000) timer.
 */
import { hash } from '@node-rs/argon2'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ActivityWriter } from '../src/activity/activity.writer'
import { activityLog, captains, centers, fields, matches, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { AutoFinishService } from '../src/realtime/auto-finish.service'
import { SessionEventsService } from '../src/realtime/session-events.service'
import { SnapshotService } from '../src/sessions/snapshot.service'
import { startTestPg, type TestPg } from './helpers/pg'

describe('AutoFinishService (integration)', () => {
  let pg: TestPg
  let service: AutoFinishService
  let broadcastCalls: string[]

  beforeAll(async () => {
    pg = await startTestPg()
  }, 60_000)

  afterAll(async () => {
    await pg.stop()
  })

  beforeEach(() => {
    // Fresh SessionEventsService per test with a spyable broadcast, wired to
    // the real snapshot service (no server attached — emit is a no-op; we
    // only assert broadcast() was invoked with the right session id).
    const snapshotService = new SnapshotService(pg.db)
    const sessionEvents = new SessionEventsService(snapshotService)
    const activity = new ActivityWriter()
    service = new AutoFinishService(pg.db, activity, sessionEvents)
    broadcastCalls = []
    sessionEvents.broadcast = async (sessionId: string) => {
      broadcastCalls.push(sessionId)
    }
  })

  let centerCounter = 0
  async function seedFixture(): Promise<{ centerId: string; sessionId: string; fieldId: string }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Auto-finish Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash('1234') })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId: center.id, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: staffMember.id })
      .returning()
    if (!session) throw new Error('session insert returned no row')

    const [field] = await pg.db.insert(fields).values({ sessionId: session.id, centerId: center.id, name: 'מגרש', position: 0 }).returning()
    if (!field) throw new Error('field insert returned no row')

    return { centerId: center.id, sessionId: session.id, fieldId: field.id }
  }

  async function seedPastDueLiveMatch(
    centerId: string,
    sessionId: string,
    fieldId: string,
    overrides: Partial<typeof matches.$inferInsert> = {},
  ): Promise<string> {
    const [a] = await pg.db.insert(captains).values({ centerId, name: 'A' }).returning()
    const [b] = await pg.db.insert(captains).values({ centerId, name: 'B' }).returning()
    if (!a || !b) throw new Error('captain insert returned no row')

    const [row] = await pg.db
      .insert(matches)
      .values({
        sessionId,
        centerId,
        fieldId,
        captainAId: a.id,
        captainBId: b.id,
        status: 'live',
        plannedDurationSec: 60,
        startedAt: new Date(Date.now() - 120_000), // started 2 min ago, planned only 1 min
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('match insert returned no row')
    return row.id
  }

  it('finishes a past-due live match, writes an auto activity row, and broadcasts the session', async () => {
    const { centerId, sessionId, fieldId } = await seedFixture()
    const matchId = await seedPastDueLiveMatch(centerId, sessionId, fieldId)

    await service.tick()

    const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
    expect(row).toMatchObject({ status: 'finished', endReason: 'auto', endedBy: null })
    expect(row?.endedAt).toBeInstanceOf(Date)

    const [logRow] = await pg.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, matchId), eq(activityLog.action, 'match.finished')))
    expect(logRow).toMatchObject({ centerId, sessionId, staffId: null })

    expect(broadcastCalls).toEqual([sessionId])
  })

  it('leaves a live match with time remaining untouched', async () => {
    const { centerId, sessionId, fieldId } = await seedFixture()
    const matchId = await seedPastDueLiveMatch(centerId, sessionId, fieldId, {
      plannedDurationSec: 300,
      startedAt: new Date(),
    })

    await service.tick()

    const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
    expect(row?.status).toBe('live')
    expect(broadcastCalls).toEqual([])
  })

  it('accounts for accumulated_pause_sec in the boundary — a paused-then-resumed match is not finished early', async () => {
    const { centerId, sessionId, fieldId } = await seedFixture()
    // started 90s ago, planned 60s, but paused for 40s of accumulated time ->
    // effective remaining time pushes the boundary past "now".
    const matchId = await seedPastDueLiveMatch(centerId, sessionId, fieldId, {
      plannedDurationSec: 60,
      startedAt: new Date(Date.now() - 90_000),
      accumulatedPauseSec: 40,
    })

    await service.tick()

    const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
    expect(row?.status).toBe('live')
  })

  it('is idempotent under two parallel ticks — the match finishes exactly once', async () => {
    const { centerId, sessionId, fieldId } = await seedFixture()
    const matchId = await seedPastDueLiveMatch(centerId, sessionId, fieldId)

    await Promise.all([service.tick(), service.tick()])

    const logRows = await pg.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, matchId), eq(activityLog.action, 'match.finished')))
    expect(logRows).toHaveLength(1)

    const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
    expect(row?.status).toBe('finished')
  })

  it('idempotent under parallel ticks — stable across 3 repeats', async () => {
    for (let i = 0; i < 3; i++) {
      const { centerId, sessionId, fieldId } = await seedFixture()
      const matchId = await seedPastDueLiveMatch(centerId, sessionId, fieldId)

      await Promise.all([service.tick(), service.tick()])

      const logRows = await pg.db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.entityId, matchId), eq(activityLog.action, 'match.finished')))
      expect(logRows).toHaveLength(1)
    }
  })

  it('finishes multiple due matches across different sessions in one tick, broadcasting each session once', async () => {
    const fixtureA = await seedFixture()
    const fixtureB = await seedFixture()
    const matchA = await seedPastDueLiveMatch(fixtureA.centerId, fixtureA.sessionId, fixtureA.fieldId)
    const matchB = await seedPastDueLiveMatch(fixtureB.centerId, fixtureB.sessionId, fixtureB.fieldId)

    await service.tick()

    const [rowA] = await pg.db.select().from(matches).where(eq(matches.id, matchA))
    const [rowB] = await pg.db.select().from(matches).where(eq(matches.id, matchB))
    expect(rowA?.status).toBe('finished')
    expect(rowB?.status).toBe('finished')
    expect(broadcastCalls.sort()).toEqual([fixtureA.sessionId, fixtureB.sessionId].sort())
  })
})
