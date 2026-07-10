/**
 * Integration test (technical-prd §10 "API integration"): match lifecycle
 * (kickoff through pause/resume/extend/finish/replay) against a real
 * Postgres (Testcontainers) and a real Nest app (supertest).
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { matchViewSchema, queueEntryViewSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, captains, centers, fields, matches, queueEntries, sessions, staff } from '../src/db/schema'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'f'.repeat(32)
const STAFF_PIN = '8888'

describe('matches (integration)', () => {
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
  async function seedCenter(): Promise<{ centerId: string; staffId: string; staffCookies: string[] }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Matches Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash(STAFF_PIN) })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const centerCookie = centerCookieHeader(jwtService, center.id)
    return {
      centerId: center.id,
      staffId: staffMember.id,
      staffCookies: [
        centerCookie,
        sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' }),
      ],
    }
  }

  async function seedSessionWithField(centerId: string, staffId: string, matchDurationSec = 300): Promise<{ sessionId: string; fieldId: string }> {
    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', matchDurationSec, status: 'active', createdBy: staffId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    const [field] = await pg.db.insert(fields).values({ sessionId: session.id, centerId, name: 'מגרש', position: 0 }).returning()
    if (!field) throw new Error('field insert returned no row')
    return { sessionId: session.id, fieldId: field.id }
  }

  async function seedCaptain(centerId: string, name = 'Captain'): Promise<string> {
    const [row] = await pg.db.insert(captains).values({ centerId, name }).returning()
    if (!row) throw new Error('captain insert returned no row')
    return row.id
  }

  async function seedQueueEntry(sessionId: string, centerId: string, captainId: string, position: number): Promise<string> {
    const [row] = await pg.db.insert(queueEntries).values({ sessionId, centerId, captainId, position, createdAt: new Date() }).returning()
    if (!row) throw new Error('queue entry insert returned no row')
    return row.id
  }

  describe('POST /sessions/:id/start', () => {
    it('pairs the front two line entries onto the field as a live match, consumes them, renumbers the rest', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId, 300)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const c = await seedCaptain(centerId, 'C')
      await seedQueueEntry(sessionId, centerId, a, 1)
      await seedQueueEntry(sessionId, centerId, b, 2)
      const thirdEntryId = await seedQueueEntry(sessionId, centerId, c, 3)

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({})

      expect(res.status).toBe(201)
      expect(matchViewSchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toMatchObject({ status: 'live', plannedDurationSec: 300 })
      expect([res.body.captainA.id, res.body.captainB.id].sort()).toEqual([a, b].sort())

      const remaining = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(remaining).toHaveLength(1)
      expect(remaining[0]).toMatchObject({ id: thirdEntryId, position: 1 })

      const [logRow] = await pg.db.select().from(activityLog).where(and(eq(activityLog.entityId, res.body.id), eq(activityLog.action, 'match.started')))
      expect(logRow).toMatchObject({ centerId, sessionId, staffId })
    })

    it('an explicit entryIds pair starts those two specifically', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const entryA = await seedQueueEntry(sessionId, centerId, a, 1)
      const entryB = await seedQueueEntry(sessionId, centerId, b, 2)

      const res = await request(app.getHttpServer())
        .post(`/sessions/${sessionId}/start`)
        .set('Cookie', staffCookies)
        .send({ entryIds: [entryB, entryA] })

      expect(res.status).toBe(201)
      expect([res.body.captainA.id, res.body.captainB.id].sort()).toEqual([a, b].sort())
    })

    it('fewer than two teams in the line -> 409 LINE_TOO_SHORT', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      await seedQueueEntry(sessionId, centerId, await seedCaptain(centerId), 1)

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({})

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('LINE_TOO_SHORT')
    })

    it('the field already has a live match -> 409 FIELD_OCCUPIED, line untouched', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const busyA = await seedCaptain(centerId, 'Busy A')
      const busyB = await seedCaptain(centerId, 'Busy B')
      await pg.db.insert(matches).values({
        sessionId,
        centerId,
        fieldId,
        captainAId: busyA,
        captainBId: busyB,
        status: 'live',
        plannedDurationSec: 300,
        startedAt: new Date(),
      })
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      await seedQueueEntry(sessionId, centerId, a, 1)
      await seedQueueEntry(sessionId, centerId, b, 2)

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({})

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('FIELD_OCCUPIED')

      const stillQueued = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(stillQueued).toHaveLength(2)
    })
  })

  describe('match lifecycle (pause/resume/extend/finish)', () => {
    async function seedLiveMatch(centerId: string, sessionId: string, fieldId: string, overrides: Partial<typeof matches.$inferInsert> = {}): Promise<string> {
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const [row] = await pg.db
        .insert(matches)
        .values({ sessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'live', plannedDurationSec: 300, startedAt: new Date(), ...overrides })
        .returning()
      if (!row) throw new Error('match insert returned no row')
      return row.id
    }

    it('pause: live -> paused, sets pausedAt', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const matchId = await seedLiveMatch(centerId, sessionId, fieldId)

      const res = await request(app.getHttpServer()).post(`/matches/${matchId}/pause`).set('Cookie', staffCookies)

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('paused')
      const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
      expect(row?.pausedAt).toBeInstanceOf(Date)
    })

    it('pausing a finished match -> 409 INVALID_TRANSITION', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const matchId = await seedLiveMatch(centerId, sessionId, fieldId, { status: 'finished', endedAt: new Date(), endReason: 'manual' })

      const res = await request(app.getHttpServer()).post(`/matches/${matchId}/pause`).set('Cookie', staffCookies)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_TRANSITION')
    })

    it('resume: paused -> live, accumulates the pause duration', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const pausedAt = new Date(Date.now() - 10_000)
      const matchId = await seedLiveMatch(centerId, sessionId, fieldId, { status: 'paused', pausedAt })

      const res = await request(app.getHttpServer()).post(`/matches/${matchId}/resume`).set('Cookie', staffCookies)

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('live')
      const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
      expect(row?.pausedAt).toBeNull()
      expect(row?.accumulatedPauseSec).toBeGreaterThanOrEqual(9)
    })

    it('extend: adds addSec to plannedDurationSec (live or paused)', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const matchId = await seedLiveMatch(centerId, sessionId, fieldId)

      const res = await request(app.getHttpServer()).post(`/matches/${matchId}/extend`).set('Cookie', staffCookies).send({ addSec: 60 })

      expect(res.status).toBe(201)
      expect(res.body.plannedDurationSec).toBe(360)
    })

    it('finish: live -> finished, end_reason manual, returns {match, activityId}', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const matchId = await seedLiveMatch(centerId, sessionId, fieldId)

      const res = await request(app.getHttpServer()).post(`/matches/${matchId}/finish`).set('Cookie', staffCookies)

      expect(res.status).toBe(201)
      expect(res.body.match).toMatchObject({ id: matchId, status: 'finished' })
      expect(res.body.activityId).toEqual(expect.any(String))

      const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
      expect(row).toMatchObject({ status: 'finished', endReason: 'manual', endedBy: staffId })
      expect(row?.endedAt).toBeInstanceOf(Date)
    })

    it('a nonexistent match id -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()
      const res = await request(app.getHttpServer()).post('/matches/00000000-0000-4000-8000-000000000000/pause').set('Cookie', staffCookies)
      expect(res.status).toBe(404)
    })
  })

  describe('POST /matches/:id/replay', () => {
    it("adds the finished match's two teams back to the line bottom as two new entries", async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const [matchRow] = await pg.db
        .insert(matches)
        .values({ sessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'finished', plannedDurationSec: 300, startedAt: new Date(), endedAt: new Date(), endReason: 'manual' })
        .returning()
      if (!matchRow) throw new Error('match insert returned no row')

      const res = await request(app.getHttpServer()).post(`/matches/${matchRow.id}/replay`).set('Cookie', staffCookies)

      expect(res.status).toBe(201)
      expect(res.body).toHaveLength(2)
      for (const entry of res.body) expect(queueEntryViewSchema.safeParse(entry).success).toBe(true)
      expect([res.body[0].team.id, res.body[1].team.id].sort()).toEqual([a, b].sort())

      const lineRows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(lineRows).toHaveLength(2)
    })

    it('replaying a still-live match -> 409 INVALID_TRANSITION', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const [matchRow] = await pg.db
        .insert(matches)
        .values({ sessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'live', plannedDurationSec: 300, startedAt: new Date() })
        .returning()
      if (!matchRow) throw new Error('match insert returned no row')

      const res = await request(app.getHttpServer()).post(`/matches/${matchRow.id}/replay`).set('Cookie', staffCookies)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('INVALID_TRANSITION')
    })
  })
})
