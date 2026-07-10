/**
 * Integration test (technical-prd §10 "API integration"): undo
 * (line.removed, line.reordered, match.finished manual) against a real
 * Postgres (Testcontainers) and a real Nest app (supertest).
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { asc, eq } from 'drizzle-orm'
import request from 'supertest'
import { undoResultSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, captains, centers, fields, matches, queueEntries, sessions, staff } from '../src/db/schema'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'g'.repeat(32)
const STAFF_PIN = '1111'

describe('actions/undo (integration)', () => {
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
      .values({ name: `Actions Center ${centerCounter}`, pinHash: await hash('9999') })
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

  async function seedSessionWithField(centerId: string, staffId: string): Promise<{ sessionId: string; fieldId: string }> {
    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', matchDurationSec: 300, status: 'active', createdBy: staffId })
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

  async function undo(staffCookies: string[], activityId: string): Promise<request.Response> {
    return request(app.getHttpServer()).post(`/actions/${activityId}/undo`).set('Cookie', staffCookies)
  }

  describe('undo line.removed', () => {
    it('within the 5s window, restores the entry to its former position', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })
      const addB = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: b })
      const removed = await request(app.getHttpServer()).delete(`/line/${addA.body.id}`).set('Cookie', staffCookies)

      const res = await undo(staffCookies, removed.body.activityId)

      expect(res.status).toBe(201)
      expect(undoResultSchema.safeParse(res.body).success).toBe(true)

      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
      expect(rows.map((r) => r.captainId)).toEqual([a, b])
      expect(addB.status).toBe(201)
    })

    it('after the 5s window -> 409 UNDO_EXPIRED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })
      const removed = await request(app.getHttpServer()).delete(`/line/${addA.body.id}`).set('Cookie', staffCookies)

      await pg.db.update(activityLog).set({ createdAt: new Date(Date.now() - 6_000) }).where(eq(activityLog.id, removed.body.activityId))

      const res = await undo(staffCookies, removed.body.activityId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('UNDO_EXPIRED')
    })

    it('undoing twice -> the second call is 409 UNDO_EXPIRED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })
      const removed = await request(app.getHttpServer()).delete(`/line/${addA.body.id}`).set('Cookie', staffCookies)

      const first = await undo(staffCookies, removed.body.activityId)
      const second = await undo(staffCookies, removed.body.activityId)

      expect(first.status).toBe(201)
      expect(second.status).toBe(409)
      expect(second.body.code).toBe('UNDO_EXPIRED')
    })
  })

  describe('undo line.reordered', () => {
    it('within the 5s window, restores the prior order', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: await seedCaptain(centerId, 'A') })
      const addB = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: await seedCaptain(centerId, 'B') })
      const reordered = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}/line`)
        .set('Cookie', staffCookies)
        .send({ entryIds: [addB.body.id, addA.body.id] })

      const res = await undo(staffCookies, reordered.body.activityId)

      expect(res.status).toBe(201)
      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
      expect(rows.map((r) => r.id)).toEqual([addA.body.id, addB.body.id])
    })

    it('superseded by a later line mutation -> 409 UNDO_EXPIRED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: await seedCaptain(centerId, 'A') })
      const addB = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: await seedCaptain(centerId, 'B') })
      const reordered = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}/line`)
        .set('Cookie', staffCookies)
        .send({ entryIds: [addB.body.id, addA.body.id] })
      await request(app.getHttpServer()).delete(`/line/${addA.body.id}`).set('Cookie', staffCookies)

      const res = await undo(staffCookies, reordered.body.activityId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('UNDO_EXPIRED')
    })
  })

  describe('undo match.finished', () => {
    async function seedLiveMatch(centerId: string, sessionId: string, fieldId: string): Promise<{ matchId: string; captainA: string; captainB: string }> {
      const captainA = await seedCaptain(centerId, 'A')
      const captainB = await seedCaptain(centerId, 'B')
      const [row] = await pg.db
        .insert(matches)
        .values({ sessionId, centerId, fieldId, captainAId: captainA, captainBId: captainB, status: 'live', plannedDurationSec: 300, startedAt: new Date() })
        .returning()
      if (!row) throw new Error('match insert returned no row')
      return { matchId: row.id, captainA, captainB }
    }

    it('within the 30s window and the field still free, restores the match to live', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const { matchId } = await seedLiveMatch(centerId, sessionId, fieldId)
      const finished = await request(app.getHttpServer()).post(`/matches/${matchId}/finish`).set('Cookie', staffCookies)

      const res = await undo(staffCookies, finished.body.activityId)

      expect(res.status).toBe(201)
      const [row] = await pg.db.select().from(matches).where(eq(matches.id, matchId))
      expect(row).toMatchObject({ status: 'live', endReason: null, endedAt: null, endedBy: null })
    })

    it('when the field was taken by a new match in the meantime -> 409 FIELD_OCCUPIED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const { matchId } = await seedLiveMatch(centerId, sessionId, fieldId)
      const finished = await request(app.getHttpServer()).post(`/matches/${matchId}/finish`).set('Cookie', staffCookies)

      const newA = await seedCaptain(centerId, 'New A')
      const newB = await seedCaptain(centerId, 'New B')
      await pg.db.insert(matches).values({ sessionId, centerId, fieldId, captainAId: newA, captainBId: newB, status: 'live', plannedDurationSec: 300, startedAt: new Date() })

      const res = await undo(staffCookies, finished.body.activityId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('FIELD_OCCUPIED')
    })

    it('after the 30s window -> 409 UNDO_EXPIRED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const { matchId } = await seedLiveMatch(centerId, sessionId, fieldId)
      const finished = await request(app.getHttpServer()).post(`/matches/${matchId}/finish`).set('Cookie', staffCookies)
      await pg.db.update(activityLog).set({ createdAt: new Date(Date.now() - 31_000) }).where(eq(activityLog.id, finished.body.activityId))

      const res = await undo(staffCookies, finished.body.activityId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('UNDO_EXPIRED')
    })
  })

  describe('unsupported / not found', () => {
    it('a nonexistent activityId -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()
      const res = await undo(staffCookies, '00000000-0000-4000-8000-000000000000')
      expect(res.status).toBe(404)
    })

    it('an activity kind that is not undoable (e.g. line.added) -> 409 UNDO_EXPIRED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: await seedCaptain(centerId, 'A') })
      const [logRow] = await pg.db.select().from(activityLog).where(eq(activityLog.entityId, addA.body.id))
      if (!logRow) throw new Error('activity log row not found')

      const res = await undo(staffCookies, logRow.id)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('UNDO_EXPIRED')
    })

    it("another center's activityId -> 404 NOT_FOUND", async () => {
      const owner = await seedCenter()
      const { sessionId } = await seedSessionWithField(owner.centerId, owner.staffId)
      const addA = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', owner.staffCookies).send({ team: await seedCaptain(owner.centerId, 'A') })
      const removed = await request(app.getHttpServer()).delete(`/line/${addA.body.id}`).set('Cookie', owner.staffCookies)

      const attacker = await seedCenter()
      const res = await undo(attacker.staffCookies, removed.body.activityId)

      expect(res.status).toBe(404)
    })
  })
})
