/**
 * Integration test (technical-prd §10 "API integration"): the line surface
 * (line-manager model) against a real Postgres (Testcontainers) and a real
 * Nest app (supertest). Each scenario gets its own freshly seeded center.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { asc, eq } from 'drizzle-orm'
import request from 'supertest'
import { apiErrorSchema, queueEntryViewSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, captains, centers, queueEntries, sessions, staff } from '../src/db/schema'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'e'.repeat(32)
const STAFF_PIN = '7777'

describe('line (integration)', () => {
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
      .values({ name: `Line Center ${centerCounter}`, pinHash: await hash('9999') })
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

  async function seedActiveSession(centerId: string, staffId: string): Promise<string> {
    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', matchDurationSec: 300, status: 'active', createdBy: staffId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    return session.id
  }

  async function seedCaptain(centerId: string, name = 'Captain'): Promise<string> {
    const [row] = await pg.db.insert(captains).values({ centerId, name }).returning()
    if (!row) throw new Error('captain insert returned no row')
    return row.id
  }

  async function addToLine(staffCookies: string[], sessionId: string, team: unknown): Promise<request.Response> {
    return request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team })
  }

  describe('POST /sessions/:id/line', () => {
    it('adds an existing captain to the bottom of the line, activity-logged', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const captainId = await seedCaptain(centerId, 'קפטן א')

      const res = await addToLine(staffCookies, sessionId, captainId)

      expect(res.status).toBe(201)
      expect(queueEntryViewSchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toMatchObject({ position: 1, team: { id: captainId, name: 'קפטן א', gamesToday: 0, lastPlayedAt: null } })

      const logRows = await pg.db.select().from(activityLog).where(eq(activityLog.entityId, res.body.id))
      expect(logRows).toHaveLength(1)
      expect(logRows[0]).toMatchObject({ action: 'line.added', entityType: 'queueEntry', centerId, sessionId, staffId })
    })

    it('inline-creates a captain when team is {newName}, same tx', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)

      const res = await addToLine(staffCookies, sessionId, { newName: 'חדש לגמרי' })

      expect(res.status).toBe(201)
      expect(res.body.team.name).toBe('חדש לגמרי')

      const [created] = await pg.db.select().from(captains).where(eq(captains.id, res.body.team.id))
      expect(created).toMatchObject({ centerId, name: 'חדש לגמרי' })
    })

    it('a second add goes to position 2 (bottom of the line)', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')

      const first = await addToLine(staffCookies, sessionId, a)
      const second = await addToLine(staffCookies, sessionId, b)

      expect(first.body.position).toBe(1)
      expect(second.body.position).toBe(2)
    })

    it('a closed session -> 409 SESSION_CLOSED', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const captainId = await seedCaptain(centerId)
      await pg.db.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, sessionId))

      const res = await addToLine(staffCookies, sessionId, captainId)

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('SESSION_CLOSED')
    })

    it('a nonexistent session id -> 404 NOT_FOUND', async () => {
      const { centerId, staffCookies } = await seedCenter()
      const captainId = await seedCaptain(centerId)
      const res = await addToLine(staffCookies, '00000000-0000-4000-8000-000000000000', captainId)
      expect(res.status).toBe(404)
    })

    it('a captain id from another center -> 404 NOT_FOUND', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const other = await seedCenter()
      const foreignCaptainId = await seedCaptain(other.centerId)

      const res = await addToLine(staffCookies, sessionId, foreignCaptainId)

      expect(res.status).toBe(404)
      expect(apiErrorSchema.safeParse(res.body).success).toBe(true)
    })
  })

  describe('PATCH /sessions/:id/line', () => {
    it('happy path: reorders to a full permutation of entryIds, activity-logged with before/after', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const first = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'A'))
      const second = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'B'))

      const res = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}/line`)
        .set('Cookie', staffCookies)
        .send({ entryIds: [second.body.id, first.body.id] })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ activityId: expect.any(String) })

      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
      expect(rows.map((r) => r.id)).toEqual([second.body.id, first.body.id])

      const [logRow] = await pg.db.select().from(activityLog).where(eq(activityLog.id, res.body.activityId))
      expect(logRow).toMatchObject({ action: 'line.reordered', sessionId, staffId })
      expect(logRow?.beforeJson).toMatchObject({ entryIds: [first.body.id, second.body.id] })
      expect(logRow?.afterJson).toMatchObject({ entryIds: [second.body.id, first.body.id] })
    })

    it('entryIds not a full permutation of the current line -> 409 VALIDATION_FAILED, line untouched', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const first = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'A'))
      await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'B'))

      const res = await request(app.getHttpServer())
        .patch(`/sessions/${sessionId}/line`)
        .set('Cookie', staffCookies)
        .send({ entryIds: [first.body.id] })

      expect(res.status).toBe(409)
      expect(res.body.code).toBe('VALIDATION_FAILED')

      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(rows).toHaveLength(2)
    })
  })

  describe('POST /line/:entryId/move-top and /move-bottom', () => {
    it('move-top repositions the entry to position 1 and renumbers the rest', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const first = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'A'))
      const second = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'B'))
      const third = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'C'))

      const res = await request(app.getHttpServer()).post(`/line/${third.body.id}/move-top`).set('Cookie', staffCookies)

      expect(res.status).toBe(201)
      expect(res.body.position).toBe(1)

      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
      expect(rows.map((r) => r.id)).toEqual([third.body.id, first.body.id, second.body.id])
    })

    it('move-bottom repositions the entry to the last position', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const first = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'A'))
      const second = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'B'))

      const res = await request(app.getHttpServer()).post(`/line/${first.body.id}/move-bottom`).set('Cookie', staffCookies)

      expect(res.status).toBe(201)
      expect(res.body.position).toBe(2)

      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
      expect(rows.map((r) => r.id)).toEqual([second.body.id, first.body.id])
    })

    it('a nonexistent entry id -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()
      const res = await request(app.getHttpServer())
        .post('/line/00000000-0000-4000-8000-000000000000/move-top')
        .set('Cookie', staffCookies)
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /line/:entryId', () => {
    it('removes the entry, closes the gap, activity-logged with the former position (undo needs it)', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const first = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'A'))
      const second = await addToLine(staffCookies, sessionId, await seedCaptain(centerId, 'B'))

      const res = await request(app.getHttpServer()).delete(`/line/${first.body.id}`).set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ activityId: expect.any(String) })

      const rows = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id: second.body.id, position: 1 })

      const [logRow] = await pg.db.select().from(activityLog).where(eq(activityLog.id, res.body.activityId))
      expect(logRow).toMatchObject({ action: 'line.removed', entityType: 'queueEntry', entityId: first.body.id, centerId, sessionId, staffId })
      expect(logRow?.beforeJson).toMatchObject({ id: first.body.id, formerPosition: 1, captainId: expect.any(String) })
    })

    it("another center's entry id -> 404 NOT_FOUND", async () => {
      const { centerId: ownerCenterId, staffId: ownerStaffId } = await seedCenter()
      const sessionId = await seedActiveSession(ownerCenterId, ownerStaffId)
      const [entry] = await pg.db
        .insert(queueEntries)
        .values({ sessionId, centerId: ownerCenterId, captainId: await seedCaptain(ownerCenterId), position: 1, createdAt: new Date() })
        .returning()
      if (!entry) throw new Error('queue entry insert returned no row')

      const attacker = await seedCenter()
      const res = await request(app.getHttpServer()).delete(`/line/${entry.id}`).set('Cookie', attacker.staffCookies)

      expect(res.status).toBe(404)
      expect(apiErrorSchema.safeParse(res.body).success).toBe(true)

      const [stillThere] = await pg.db.select().from(queueEntries).where(eq(queueEntries.id, entry.id))
      expect(stillThere).toBeDefined()
    })
  })
})
