/**
 * Integration test (technical-prd §10 "API integration"): the sessions
 * lifecycle surface (US-010/011/012) against a real Postgres (Testcontainers)
 * and a real Nest app (supertest). Each scenario gets its own freshly
 * seeded center so the one-active-session-per-center invariant can't leak
 * state between tests.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { sessionSnapshotSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, captains, centers, fields, matches, queueEntries, sessions, staff } from '../src/db/schema'
import { todayInJerusalem } from '../src/sessions/date'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'c'.repeat(32)
const MANAGER_PIN = '4444'
const STAFF_PIN = '5555'

describe('sessions (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let jwtService: ReturnType<typeof makeTestJwtService>

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()

    jwtService = makeTestJwtService(SESSION_SECRET)
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  let centerCounter = 0
  async function seedCenter(): Promise<{
    centerId: string
    managerId: string
    staffId: string
    managerCookies: string[]
    staffCookies: string[]
  }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Sessions Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [manager] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash(MANAGER_PIN) })
      .returning()
    if (!manager) throw new Error('staff insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash(STAFF_PIN) })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const centerCookie = centerCookieHeader(jwtService, center.id)
    return {
      centerId: center.id,
      managerId: manager.id,
      staffId: staffMember.id,
      managerCookies: [centerCookie, sessionCookieHeader(jwtService, { staffId: manager.id, centerId: center.id, role: 'manager' })],
      staffCookies: [centerCookie, sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' })],
    }
  }

  async function seedCaptainPair(centerId: string): Promise<[string, string]> {
    const [a] = await pg.db.insert(captains).values({ centerId, name: 'Captain A' }).returning()
    const [b] = await pg.db.insert(captains).values({ centerId, name: 'Captain B' }).returning()
    if (!a || !b) throw new Error('captain insert returned no row')
    return [a.id, b.id]
  }

  describe('POST /sessions', () => {
    it('happy path: creates the session + its single field in one transaction, activity-logged', async () => {
      const { centerId, managerId, managerCookies } = await seedCenter()

      const res = await request(app.getHttpServer())
        .post('/sessions')
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 300, location: 'Center Court' })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({
        id: expect.any(String),
        date: todayInJerusalem(),
        location: 'Center Court',
        matchDurationSec: 300,
        status: 'active',
      })
      const sessionId = res.body.id as string

      const sessionFields = await pg.db.select().from(fields).where(eq(fields.sessionId, sessionId))
      expect(sessionFields).toHaveLength(1)
      expect(sessionFields[0]).toMatchObject({ name: 'מגרש ראשי', position: 0, centerId })

      const logRows = await pg.db.select().from(activityLog).where(eq(activityLog.entityId, sessionId))
      expect(logRows).toHaveLength(1)
      expect(logRows[0]).toMatchObject({
        action: 'session.opened',
        entityType: 'session',
        centerId,
        sessionId,
        staffId: managerId,
      })
      expect(logRows[0]?.createdAt).toBeInstanceOf(Date)
    })

    it('allows two active sessions concurrently (open-fields pivot)', async () => {
      const { managerCookies } = await seedCenter()
      const first = await request(app.getHttpServer())
        .post('/sessions')
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 300 })
      const second = await request(app.getHttpServer())
        .post('/sessions')
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 600 })

      expect(first.status).toBe(201)
      expect(second.status).toBe(201) // was 409 SESSION_ALREADY_ACTIVE before the pivot
    })
  })

  describe('PATCH /sessions/:id', () => {
    it('happy path updates matchDurationSec/location on the active session, activity-logged with before/after', async () => {
      const { managerId, managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string

      const res = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}`)
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 420, location: 'New Court' })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        id: sessionId,
        date: todayInJerusalem(),
        location: 'New Court',
        matchDurationSec: 420,
        status: 'active',
      })

      const [logRow] = await pg.db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.entityId, sessionId), eq(activityLog.action, 'session.updated')))
      expect(logRow).toMatchObject({ staffId: managerId })
      expect(logRow?.beforeJson).toMatchObject({ matchDurationSec: 300 })
      expect(logRow?.afterJson).toMatchObject({ matchDurationSec: 420, location: 'New Court' })
    })

    it('a closed session -> 409 SESSION_CLOSED', async () => {
      const { managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      const res = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}`)
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 420 })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SESSION_CLOSED')
    })

    it('a nonexistent id -> 404 NOT_FOUND', async () => {
      const { managerCookies } = await seedCenter()
      const res = await request(app.getHttpServer())
        .patch('/sessions/00000000-0000-4000-8000-000000000000')
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 420 })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it("another center's session id -> 404 NOT_FOUND (indistinguishable from nonexistent)", async () => {
      const centerA = await seedCenter()
      const centerB = await seedCenter()
      const opened = await request(app.getHttpServer())
        .post('/sessions')
        .set('Cookie', centerA.managerCookies)
        .send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string

      const res = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}`)
        .set('Cookie', centerB.managerCookies)
        .send({ matchDurationSec: 420 })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /sessions/:id/close', () => {
    it('happy path: no live match -> closes the session and cancels queued matches (one activity row each)', async () => {
      const { centerId, managerId, managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      const [captainA, captainB] = await seedCaptainPair(centerId)

      const [queuedMatch] = await pg.db
        .insert(matches)
        .values({
          sessionId,
          centerId,
          captainAId: captainA,
          captainBId: captainB,
          status: 'queued',
          queuePosition: 1,
          plannedDurationSec: 300,
        })
        .returning()
      if (!queuedMatch) throw new Error('match insert returned no row')

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({ id: sessionId, status: 'closed' })

      const [cancelledMatch] = await pg.db.select().from(matches).where(eq(matches.id, queuedMatch.id))
      expect(cancelledMatch).toMatchObject({ status: 'cancelled', endReason: 'cancelled', endedBy: managerId })
      expect(cancelledMatch?.endedAt).toBeInstanceOf(Date)

      const closeLog = await pg.db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.entityId, sessionId), eq(activityLog.action, 'session.closed')))
      expect(closeLog).toHaveLength(1)

      const matchCancelLog = await pg.db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.entityId, queuedMatch.id), eq(activityLog.action, 'match.cancelled')))
      expect(matchCancelLog).toHaveLength(1)
      expect(matchCancelLog[0]).toMatchObject({ centerId, sessionId, staffId: managerId })
    })

    it('closing also clears the line (deletes queue_entries, logs line.cleared)', async () => {
      const { centerId, managerId, managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      const [captainA, captainB] = await seedCaptainPair(centerId)
      await pg.db.insert(queueEntries).values([
        { sessionId, centerId, captainId: captainA, position: 1, createdAt: new Date() },
        { sessionId, centerId, captainId: captainB, position: 2, createdAt: new Date() },
      ])

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      expect(res.status).toBe(201)
      const remaining = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(remaining).toHaveLength(0)

      const [clearedLog] = await pg.db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.entityId, sessionId), eq(activityLog.action, 'line.cleared')))
      expect(clearedLog).toMatchObject({ centerId, sessionId, staffId: managerId })
    })

    it('a live match blocks the close with 409 SESSION_HAS_LIVE_MATCH, session stays active', async () => {
      const { centerId, managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      const [captainA, captainB] = await seedCaptainPair(centerId)

      await pg.db.insert(matches).values({
        sessionId,
        centerId,
        captainAId: captainA,
        captainBId: captainB,
        status: 'live',
        plannedDurationSec: 300,
        startedAt: new Date(),
      })

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SESSION_HAS_LIVE_MATCH')

      const [stillActive] = await pg.db.select().from(sessions).where(eq(sessions.id, sessionId))
      expect(stillActive?.status).toBe('active')
    })

    it('a paused match also blocks the close with 409 SESSION_HAS_LIVE_MATCH', async () => {
      const { centerId, managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      const [captainA, captainB] = await seedCaptainPair(centerId)

      await pg.db.insert(matches).values({
        sessionId,
        centerId,
        captainAId: captainA,
        captainBId: captainB,
        status: 'paused',
        plannedDurationSec: 300,
        startedAt: new Date(),
        pausedAt: new Date(),
      })

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SESSION_HAS_LIVE_MATCH')
    })

    it('a nonexistent id -> 404 NOT_FOUND', async () => {
      const { managerCookies } = await seedCenter()
      const res = await request(app.getHttpServer())
        .post('/sessions/00000000-0000-4000-8000-000000000000/close')
        .set('Cookie', managerCookies)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it("another center's session id -> 404 NOT_FOUND", async () => {
      const centerA = await seedCenter()
      const centerB = await seedCenter()
      const opened = await request(app.getHttpServer())
        .post('/sessions')
        .set('Cookie', centerA.managerCookies)
        .send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', centerB.managerCookies)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it('an already-closed session -> 409 SESSION_CLOSED', async () => {
      const { managerCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SESSION_CLOSED')
    })
  })

  describe('GET /sessions/active', () => {
    it('happy path returns a valid sessionSnapshotSchema with the field and an empty queue', async () => {
      const { managerCookies, staffCookies } = await seedCenter()
      const opened = await request(app.getHttpServer())
        .post('/sessions')
        .set('Cookie', managerCookies)
        .send({ matchDurationSec: 300, location: 'Court 1' })
      const sessionId = opened.body.id as string

      const res = await request(app.getHttpServer()).get('/sessions/active').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(sessionSnapshotSchema.safeParse(res.body).success).toBe(true)
      expect(res.body.session).toMatchObject({ id: sessionId, status: 'active', location: 'Court 1' })
      expect(res.body.fields).toHaveLength(1)
      expect(res.body.fields[0]).toMatchObject({ name: 'מגרש ראשי', position: 0, liveMatch: null })
      expect(res.body.queue).toEqual([])
    })

    it('reflects a populated line (position-ordered) and a live match on its field', async () => {
      const { centerId, managerCookies, staffCookies } = await seedCenter()
      const opened = await request(app.getHttpServer()).post('/sessions').set('Cookie', managerCookies).send({ matchDurationSec: 300 })
      const sessionId = opened.body.id as string
      const [field] = await pg.db.select().from(fields).where(eq(fields.sessionId, sessionId))
      if (!field) throw new Error('field not found')

      const [waiting] = await pg.db.insert(captains).values({ centerId, name: 'ממתין' }).returning()
      if (!waiting) throw new Error('captain insert returned no row')
      await pg.db.insert(queueEntries).values({ sessionId, centerId, captainId: waiting.id, position: 1, createdAt: new Date() })

      const [captainA, captainB] = await seedCaptainPair(centerId)
      const [liveMatch] = await pg.db
        .insert(matches)
        .values({ sessionId, centerId, fieldId: field.id, captainAId: captainA, captainBId: captainB, status: 'live', plannedDurationSec: 300, startedAt: new Date() })
        .returning()
      if (!liveMatch) throw new Error('match insert returned no row')

      const res = await request(app.getHttpServer()).get('/sessions/active').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(sessionSnapshotSchema.safeParse(res.body).success).toBe(true)
      expect(res.body.queue).toEqual([{ id: expect.any(String), position: 1, team: expect.objectContaining({ id: waiting.id, name: 'ממתין' }) }])
      expect(res.body.fields[0].liveMatch).toMatchObject({ id: liveMatch.id, status: 'live' })
      expect([res.body.fields[0].liveMatch.captainA.id, res.body.fields[0].liveMatch.captainB.id].sort()).toEqual([captainA, captainB].sort())
    })

    it('no active session -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()

      const res = await request(app.getHttpServer()).get('/sessions/active').set('Cookie', staffCookies)

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })
  })
})
