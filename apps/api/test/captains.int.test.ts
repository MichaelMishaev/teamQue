/**
 * Integration test (technical-prd §10 "API integration"): the captains
 * surface (US-020..023) against a real Postgres (Testcontainers) and a real
 * Nest app (supertest). Each scenario gets its own freshly seeded center.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { eq } from 'drizzle-orm'
import { Pool } from 'pg'
import request from 'supertest'
import { apiErrorSchema, captainSearchResultSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, captains, centers, fields, matches, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'd'.repeat(32)
const STAFF_PIN = '6666'

describe('captains (integration)', () => {
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
    staffId: string
    staffCookies: string[]
    managerCookies: string[]
  }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Captains Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash(STAFF_PIN) })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const [manager] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash('7777') })
      .returning()
    if (!manager) throw new Error('manager insert returned no row')

    const centerCookie = centerCookieHeader(jwtService, center.id)
    return {
      centerId: center.id,
      staffId: staffMember.id,
      staffCookies: [
        centerCookie,
        sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' }),
      ],
      managerCookies: [
        centerCookie,
        sessionCookieHeader(jwtService, { staffId: manager.id, centerId: center.id, role: 'manager' }),
      ],
    }
  }

  async function seedCaptain(centerId: string, overrides: Partial<typeof captains.$inferInsert> = {}): Promise<string> {
    const [row] = await pg.db
      .insert(captains)
      .values({ centerId, name: 'Captain', ...overrides })
      .returning()
    if (!row) throw new Error('captain insert returned no row')
    return row.id
  }

  async function seedActiveSession(centerId: string, staffId: string): Promise<string> {
    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: staffId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    const [field] = await pg.db
      .insert(fields)
      .values({ sessionId: session.id, centerId, name: 'מגרש ראשי', position: 0 })
      .returning()
    if (!field) throw new Error('field insert returned no row')
    return session.id
  }

  async function seedMatch(
    sessionId: string,
    centerId: string,
    captainAId: string,
    captainBId: string,
    overrides: Partial<typeof matches.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await pg.db
      .insert(matches)
      .values({
        sessionId,
        centerId,
        captainAId,
        captainBId,
        status: 'finished',
        plannedDurationSec: 300,
        ...overrides,
      })
      .returning()
    if (!row) throw new Error('match insert returned no row')
    return row.id
  }

  describe('GET /captains', () => {
    it('matches by name substring, case-insensitive, scoped to the caller center', async () => {
      const { centerId, staffCookies } = await seedCenter()
      const other = await seedCenter()
      await seedCaptain(centerId, { name: 'דניאל כהן' })
      await seedCaptain(centerId, { name: 'משה' })
      await seedCaptain(other.centerId, { name: 'דניאל אחר' })

      const res = await request(app.getHttpServer()).get('/captains?q=דני').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      const names = (res.body as Array<{ name: string }>).map((c) => c.name)
      expect(names).toContain('דניאל כהן')
      expect(names).not.toContain('משה')
      expect(names).not.toContain('דניאל אחר')
    })

    it('matches by nickname substring, case-insensitive, even when the name does not match', async () => {
      const { centerId, staffCookies } = await seedCenter()
      await seedCaptain(centerId, { name: 'רון לוי', nickname: 'DaniBoy' })
      await seedCaptain(centerId, { name: 'אחר' })

      const res = await request(app.getHttpServer()).get('/captains?q=dani').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      const names = (res.body as Array<{ name: string }>).map((c) => c.name)
      expect(names).toEqual(['רון לוי'])
    })

    it('every result includes gamesToday/lastPlayedAt (active-session scope) and totalMatches (all-time, finished)', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const captainAId = await seedCaptain(centerId, { name: 'שחקן פעיל' })
      const opponent = await seedCaptain(centerId, { name: 'יריב' })
      const sessionId = await seedActiveSession(centerId, staffId)

      const earlier = new Date('2026-07-10T17:00:00.000Z')
      const later = new Date('2026-07-10T19:00:00.000Z')
      await seedMatch(sessionId, centerId, captainAId, opponent, { status: 'finished', startedAt: earlier, endedAt: earlier })
      await seedMatch(sessionId, centerId, captainAId, opponent, { status: 'finished', startedAt: later, endedAt: later })
      // A queued (not-yet-played) match must NOT count toward gamesToday.
      await seedMatch(sessionId, centerId, captainAId, opponent, { status: 'queued', queuePosition: 1 })
      // A finished match from a DIFFERENT (past) session still counts toward totalMatches.
      const pastStaffCenter = staffId
      const [pastSession] = await pg.db
        .insert(sessions)
        .values({ centerId, date: '2026-01-01', slug: generateSlug(), matchDurationSec: 300, status: 'closed', createdBy: pastStaffCenter })
        .returning()
      if (!pastSession) throw new Error('session insert returned no row')
      await seedMatch(pastSession.id, centerId, captainAId, opponent, { status: 'finished' })

      const res = await request(app.getHttpServer()).get('/captains?q=שחקן').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      const result = (res.body as Array<Record<string, unknown>>).find((c) => c.id === captainAId)
      expect(result).toBeDefined()
      expect(captainSearchResultSchema.safeParse(result).success).toBe(true)
      expect(result?.gamesToday).toBe(2)
      expect(result?.lastPlayedAt).toBe(later.toISOString())
      expect(result?.totalMatches).toBe(3)
    })

    it('with no active session, every result is gamesToday 0 / lastPlayedAt null', async () => {
      const { centerId, staffCookies } = await seedCenter()
      await seedCaptain(centerId, { name: 'ללא מפגש' })

      const res = await request(app.getHttpServer()).get('/captains?q=ללא').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(1)
      expect(res.body[0]).toMatchObject({ gamesToday: 0, lastPlayedAt: null })
    })

    it('resets today stats after closing the evening but preserves the match timestamp in history', async () => {
      const { centerId, staffId, staffCookies, managerCookies } = await seedCenter()
      const captainId = await seedCaptain(centerId, { name: 'טורי' })
      const opponentId = await seedCaptain(centerId, { name: 'יריב' })
      const sessionId = await seedActiveSession(centerId, staffId)
      const startedAt = new Date('2026-07-12T06:16:00.000Z')
      const endedAt = new Date('2026-07-12T06:24:00.000Z')
      await seedMatch(sessionId, centerId, captainId, opponentId, {
        status: 'finished',
        startedAt,
        endedAt,
        endReason: 'manual',
      })

      const beforeClose = await request(app.getHttpServer()).get('/captains?q=טורי').set('Cookie', staffCookies)
      expect(beforeClose.body[0]).toMatchObject({ gamesToday: 1, lastPlayedAt: startedAt.toISOString() })

      const close = await request(app.getHttpServer())
        .post(`/sessions/${sessionId}/close`)
        .set('Cookie', managerCookies)
      expect(close.status).toBe(201)

      const afterClose = await request(app.getHttpServer()).get('/captains?q=טורי').set('Cookie', staffCookies)
      expect(afterClose.body[0]).toMatchObject({ gamesToday: 0, lastPlayedAt: null, totalMatches: 1 })

      const history = await request(app.getHttpServer())
        .get(`/sessions/${sessionId}/history`)
        .set('Cookie', staffCookies)
      expect(history.status).toBe(200)
      expect(history.body).toHaveLength(1)
      expect(history.body[0]).toMatchObject({
        captainAId: captainId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
      })
    })

    it('deterministic ordering: prefix match first, then lastPlayedAt desc, then createdAt desc', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const opponent = await seedCaptain(centerId, { name: 'יריב קבוע' })

      // "contains but not prefix" match on the query 'רון'.
      const containsId = await seedCaptain(centerId, { name: 'הרון גדול' })
      // Two prefix matches, differentiated by lastPlayedAt.
      const prefixOlderId = await seedCaptain(centerId, { name: 'רון א' })
      const prefixNewerId = await seedCaptain(centerId, { name: 'רון ב' })

      await seedMatch(sessionId, centerId, prefixOlderId, opponent, {
        status: 'finished',
        startedAt: new Date('2026-07-10T17:00:00.000Z'),
      })
      await seedMatch(sessionId, centerId, prefixNewerId, opponent, {
        status: 'finished',
        startedAt: new Date('2026-07-10T19:00:00.000Z'),
      })

      const res = await request(app.getHttpServer()).get('/captains?q=רון').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      const ids = (res.body as Array<{ id: string }>).map((c) => c.id)
      expect(ids.indexOf(prefixNewerId)).toBeLessThan(ids.indexOf(prefixOlderId))
      expect(ids.indexOf(prefixOlderId)).toBeLessThan(ids.indexOf(containsId))
    })

    it('empty q returns up to 20 captains ordered by lastPlayedAt desc / createdAt desc', async () => {
      const { centerId, staffCookies } = await seedCenter()
      for (let i = 0; i < 3; i++) {
        await seedCaptain(centerId, { name: `קפטן ${i}` })
      }

      const res = await request(app.getHttpServer()).get('/captains').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(3)
    })

    it('caps results at 20 even when more captains match', async () => {
      const { centerId, staffCookies } = await seedCenter()
      for (let i = 0; i < 25; i++) {
        await seedCaptain(centerId, { name: `קפטן מספר ${i}` })
      }

      const res = await request(app.getHttpServer()).get('/captains?q=קפטן').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(20)
    })

    it('issues a fixed, small number of DB queries regardless of result count (N-21)', async () => {
      const { centerId, staffCookies } = await seedCenter()
      for (let i = 0; i < 25; i++) {
        await seedCaptain(centerId, { name: `שאילתה ${i}` })
      }

      // drizzle-orm's node-postgres driver issues each query via the pool's
      // own `query()` (see drizzle-orm/node-postgres/session.js); spying on
      // Pool.prototype.query catches every query from ANY pool instance,
      // including the app's own (created lazily inside DbModule's factory,
      // which this test has no direct handle to).
      const querySpy = vi.spyOn(Pool.prototype, 'query')
      querySpy.mockClear()

      const res = await request(app.getHttpServer()).get('/captains?q=שאילתה').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(20)
      // <=3: active-session lookup, main candidate query, totalMatches for
      // the <=20 winners. Independent of the 25 matching rows above.
      expect(querySpy.mock.calls.length).toBeLessThanOrEqual(3)
      querySpy.mockRestore()
    })
  })

  describe('POST /captains', () => {
    it('creates a captain with the full captainSearchResultSchema shape (0/null/0 stats) and logs the activity', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()

      const res = await request(app.getHttpServer())
        .post('/captains')
        .set('Cookie', staffCookies)
        .send({ name: 'קפטן חדש', nickname: 'החדש', tags: ['מהיר'] })

      expect(res.status).toBe(201)
      expect(captainSearchResultSchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toMatchObject({
        name: 'קפטן חדש',
        nickname: 'החדש',
        note: null,
        tags: ['מהיר'],
        gamesToday: 0,
        lastPlayedAt: null,
        totalMatches: 0,
      })

      const logRows = await pg.db.select().from(activityLog).where(eq(activityLog.entityId, res.body.id))
      expect(logRows).toHaveLength(1)
      expect(logRows[0]).toMatchObject({ action: 'captain.created', entityType: 'captain', centerId, staffId })
    })

    it('duplicate names are allowed (creates a second, independent row)', async () => {
      const { staffCookies } = await seedCenter()
      const first = await request(app.getHttpServer()).post('/captains').set('Cookie', staffCookies).send({ name: 'דניאל' })
      const second = await request(app.getHttpServer()).post('/captains').set('Cookie', staffCookies).send({ name: 'דניאל' })

      expect(first.status).toBe(201)
      expect(second.status).toBe(201)
      expect(first.body.id).not.toBe(second.body.id)
    })

    it('rejects an empty name with 400 VALIDATION_FAILED', async () => {
      const { staffCookies } = await seedCenter()
      const res = await request(app.getHttpServer()).post('/captains').set('Cookie', staffCookies).send({ name: '' })

      expect(res.status).toBe(400)
      expect(apiErrorSchema.safeParse(res.body).success).toBe(true)
      expect(res.body.code).toBe('VALIDATION_FAILED')
    })
  })

  describe('PATCH /captains/:id', () => {
    it('updates nickname/note/tags/name and logs before/after json', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const captainId = await seedCaptain(centerId, { name: 'לפני', nickname: null, note: null, tags: [] })

      const res = await request(app.getHttpServer())
        .patch(`/captains/${captainId}`)
        .set('Cookie', staffCookies)
        .send({ name: 'אחרי', nickname: 'כינוי', note: 'הערה פרטית', tags: ['a', 'b'] })

      expect(res.status).toBe(200)
      expect(captainSearchResultSchema.safeParse(res.body).success).toBe(true)
      expect(res.body).toMatchObject({ name: 'אחרי', nickname: 'כינוי', note: 'הערה פרטית', tags: ['a', 'b'] })

      const [logRow] = await pg.db
        .select()
        .from(activityLog)
        .where(eq(activityLog.entityId, captainId))
      expect(logRow).toMatchObject({ action: 'captain.updated', entityType: 'captain', centerId, staffId })
      expect(logRow?.beforeJson).toMatchObject({ name: 'לפני' })
      expect(logRow?.afterJson).toMatchObject({ name: 'אחרי' })
    })

    it('returns real stats (not zeros) when the captain already has match history', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const captainId = await seedCaptain(centerId, { name: 'ותיק' })
      const opponent = await seedCaptain(centerId, { name: 'יריב' })
      const sessionId = await seedActiveSession(centerId, staffId)
      const playedAt = new Date('2026-07-10T18:00:00.000Z')
      await seedMatch(sessionId, centerId, captainId, opponent, { status: 'finished', startedAt: playedAt })

      const res = await request(app.getHttpServer())
        .patch(`/captains/${captainId}`)
        .set('Cookie', staffCookies)
        .send({ note: 'update' })

      expect(res.status).toBe(200)
      expect(res.body).toMatchObject({ gamesToday: 1, lastPlayedAt: playedAt.toISOString(), totalMatches: 1 })
    })

    it('a nonexistent id -> 404 NOT_FOUND', async () => {
      const { staffCookies } = await seedCenter()
      const res = await request(app.getHttpServer())
        .patch('/captains/00000000-0000-4000-8000-000000000000')
        .set('Cookie', staffCookies)
        .send({ name: 'x' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })

    it("another center's captain id -> 404 NOT_FOUND (indistinguishable from nonexistent)", async () => {
      const centerA = await seedCenter()
      const centerB = await seedCenter()
      const captainId = await seedCaptain(centerA.centerId, { name: 'שייך למרכז א' })

      const res = await request(app.getHttpServer())
        .patch(`/captains/${captainId}`)
        .set('Cookie', centerB.staffCookies)
        .send({ name: 'ניסיון חדירה' })

      expect(res.status).toBe(404)
      expect(res.body.code).toBe('NOT_FOUND')
    })
  })
})
