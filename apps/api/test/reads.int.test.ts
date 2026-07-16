/**
 * Integration test (technical-prd §10 "API integration"): the read
 * surface — activity feed, session history, past sessions, session
 * summary — against a real Postgres (Testcontainers) and a real Nest app
 * (supertest).
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { activityEntrySchema, historyEntrySchema, sessionListItemSchema, sessionSummarySchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { captains, centers, fields, matches, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'h'.repeat(32)
const STAFF_PIN = '2222'

describe('reads (integration)', () => {
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
      .values({ name: `Reads Center ${centerCounter}`, pinHash: await hash('9999') })
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

  async function seedSessionWithField(centerId: string, staffId: string, date = '2026-07-10'): Promise<{ sessionId: string; fieldId: string }> {
    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date, slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: staffId })
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

  describe('GET /activity', () => {
    it('returns this center\'s activity, newest first, respecting sessionId and limit', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })
      const b = await seedCaptain(centerId, 'B')
      await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: b })

      const res = await request(app.getHttpServer()).get(`/activity?sessionId=${sessionId}`).set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body.length).toBeGreaterThanOrEqual(2)
      for (const entry of res.body) expect(activityEntrySchema.safeParse(entry).success).toBe(true)
      const createdAts = (res.body as Array<{ createdAt: string }>).map((e) => new Date(e.createdAt).getTime())
      expect(createdAts).toEqual([...createdAts].sort((x, y) => y - x))

      const limited = await request(app.getHttpServer()).get(`/activity?sessionId=${sessionId}&limit=1`).set('Cookie', staffCookies)
      expect(limited.body).toHaveLength(1)
    })
  })

  describe('GET /sessions/:id/history', () => {
    it('lists finished matches with actualDurationSec, excludes live/queued/cancelled', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const startedAt = new Date('2026-07-10T17:00:00.000Z')
      const endedAt = new Date('2026-07-10T17:05:00.000Z')
      await pg.db.insert(matches).values({
        sessionId, centerId, fieldId, captainAId: a, captainBId: b,
        status: 'finished', plannedDurationSec: 300, startedAt, endedAt, endReason: 'manual', accumulatedPauseSec: 30,
      })
      await pg.db.insert(matches).values({ sessionId, centerId, fieldId: null, captainAId: a, captainBId: b, status: 'live', plannedDurationSec: 300, startedAt: new Date() })

      const res = await request(app.getHttpServer()).get(`/sessions/${sessionId}/history`).set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(historyEntrySchema.safeParse(res.body[0]).success).toBe(true)
      expect(res.body[0]).toMatchObject({ captainAName: 'A', captainBName: 'B', endReason: 'manual', actualDurationSec: 270 })
    })

    it('a nonexistent session id -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()
      const res = await request(app.getHttpServer()).get('/sessions/00000000-0000-4000-8000-000000000000/history').set('Cookie', staffCookies)
      expect(res.status).toBe(404)
    })
  })

  describe('GET /sessions', () => {
    it('lists past sessions with matchCount, filtered by from/to', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId: oldSessionId } = await seedSessionWithField(centerId, staffId, '2026-01-01')
      await pg.db.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, oldSessionId))
      const { sessionId: recentSessionId, fieldId } = await seedSessionWithField(centerId, staffId, '2026-07-10')
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      await pg.db.insert(matches).values({ sessionId: recentSessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'finished', plannedDurationSec: 300, startedAt: new Date(), endedAt: new Date(), endReason: 'manual' })

      const res = await request(app.getHttpServer()).get('/sessions?from=2026-07-01&to=2026-07-31').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      for (const entry of res.body) expect(sessionListItemSchema.safeParse(entry).success).toBe(true)
      const ids = (res.body as Array<{ id: string }>).map((s) => s.id)
      expect(ids).toContain(recentSessionId)
      expect(ids).not.toContain(oldSessionId)
      const recent = (res.body as Array<{ id: string; matchCount: number }>).find((s) => s.id === recentSessionId)
      expect(recent?.matchCount).toBe(1)
    })
  })

  describe('GET /sessions/:id/summary', () => {
    it('aggregates totals, topCaptains, and finish-reason counts', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId, fieldId } = await seedSessionWithField(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const c = await seedCaptain(centerId, 'C')

      await pg.db.insert(matches).values({
        sessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'finished', plannedDurationSec: 300,
        startedAt: new Date('2026-07-10T17:00:00.000Z'), endedAt: new Date('2026-07-10T17:05:00.000Z'), endReason: 'manual',
      })
      await pg.db.insert(matches).values({
        sessionId, centerId, fieldId, captainAId: a, captainBId: c, status: 'finished', plannedDurationSec: 300,
        startedAt: new Date('2026-07-10T17:10:00.000Z'), endedAt: new Date('2026-07-10T17:15:00.000Z'), endReason: 'auto',
      })

      const res = await request(app.getHttpServer()).get(`/sessions/${sessionId}/summary`).set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(sessionSummarySchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toMatchObject({ totalMatches: 2, uniqueCaptains: 3, manualFinishes: 1, autoFinishes: 1, extensions: 0 })
      expect(res.body.topCaptains[0]).toMatchObject({ captainId: a, games: 2 })
    })

    it('a nonexistent session id -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()
      const res = await request(app.getHttpServer()).get('/sessions/00000000-0000-4000-8000-000000000000/summary').set('Cookie', staffCookies)
      expect(res.status).toBe(404)
    })
  })
})
