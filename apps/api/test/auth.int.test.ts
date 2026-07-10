/**
 * Integration test (technical-prd §6, §10 "API integration"): the full
 * auth surface against a real Postgres (Testcontainers) and a real Nest
 * app instance (supertest). Covers center unlock, staff login + progressive
 * lockout, the staff picker, /auth/me, and logout.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { eq } from 'drizzle-orm'
import request from 'supertest'
import { apiErrorSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { centers, staff } from '../src/db/schema'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'a'.repeat(32)
const CENTER_PIN = '2468'
const STAFF_PIN = '1111'

describe('auth (integration)', () => {
  let pg: TestPg
  let centerId: string
  let happyStaffId: string

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Test Center', pinHash: await hash(CENTER_PIN) })
      .returning()
    if (!center) throw new Error('center insert returned no row')
    centerId = center.id

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId, name: 'שרה', role: 'manager', pinHash: await hash(STAFF_PIN) })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')
    happyStaffId = staffMember.id
  }, 60_000)

  afterAll(async () => {
    await pg.stop()
  })

  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()
    return app
  }

  describe('POST /auth/center', () => {
    it('happy path sets the qlm_center cookie and returns the center', async () => {
      const app = await buildApp()
      try {
        const res = await request(app.getHttpServer()).post('/auth/center').send({ pin: CENTER_PIN })

        expect(res.status).toBe(201)
        expect(res.body).toEqual({ centerId, name: 'Test Center' })
        const setCookie = res.headers['set-cookie'] as unknown as string[]
        expect(setCookie.some((c) => c.startsWith('qlm_center='))).toBe(true)
      } finally {
        await app.close()
      }
    })

    it('wrong pin -> 401 UNAUTHORIZED', async () => {
      const app = await buildApp()
      try {
        const res = await request(app.getHttpServer()).post('/auth/center').send({ pin: '0000' })

        expect(res.status).toBe(401)
        expect(apiErrorSchema.safeParse(res.body).success).toBe(true)
        expect(res.body.code).toBe('UNAUTHORIZED')
      } finally {
        await app.close()
      }
    })

    it('6th attempt within the window -> 429 (throttler)', async () => {
      const app = await buildApp()
      try {
        for (let i = 0; i < 5; i++) {
          const res = await request(app.getHttpServer()).post('/auth/center').send({ pin: '0000' })
          expect(res.status).toBe(401)
        }

        const sixth = await request(app.getHttpServer()).post('/auth/center').send({ pin: '0000' })
        expect(sixth.status).toBe(429)
      } finally {
        await app.close()
      }
    })
  })

  describe('POST /auth/login', () => {
    let app: INestApplication
    let jwtService: ReturnType<typeof makeTestJwtService>
    let centerCookie: string

    beforeAll(async () => {
      app = await buildApp()
      jwtService = makeTestJwtService(SESSION_SECRET)
      centerCookie = centerCookieHeader(jwtService, centerId)
    })

    afterAll(async () => {
      await app.close()
    })

    it('happy path sets the qlm_session cookie with httpOnly + SameSite=Lax flags', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Cookie', [centerCookie])
        .send({ staffId: happyStaffId, pin: STAFF_PIN })

      expect(res.status).toBe(201)
      expect(res.body).toEqual({ staffId: happyStaffId, name: 'שרה', role: 'manager' })

      const setCookie = res.headers['set-cookie'] as unknown as string[]
      const sessionCookie = setCookie.find((c) => c.startsWith('qlm_session='))
      expect(sessionCookie).toBeDefined()
      expect(sessionCookie).toMatch(/HttpOnly/i)
      expect(sessionCookie).toMatch(/SameSite=Lax/i)
    })

    it('wrong pin -> 401 without a center cookie is rejected before body validation', async () => {
      const res = await request(app.getHttpServer()).post('/auth/login').send({ staffId: happyStaffId, pin: STAFF_PIN })

      expect(res.status).toBe(401)
      expect(res.body.code).toBe('UNAUTHORIZED')
    })

    it('unknown staffId, foreign-center staffId, and inactive staff all fail closed with the same 401', async () => {
      const [otherCenter] = await pg.db
        .insert(centers)
        .values({ name: 'Other Center', pinHash: await hash('9999') })
        .returning()
      if (!otherCenter) throw new Error('center insert returned no row')
      const [foreignStaff] = await pg.db
        .insert(staff)
        .values({ centerId: otherCenter.id, name: 'זר', role: 'staff', pinHash: await hash(STAFF_PIN) })
        .returning()
      if (!foreignStaff) throw new Error('staff insert returned no row')
      const [inactiveStaff] = await pg.db
        .insert(staff)
        .values({ centerId, name: 'לא-פעיל', role: 'staff', pinHash: await hash(STAFF_PIN), active: false })
        .returning()
      if (!inactiveStaff) throw new Error('staff insert returned no row')

      const unknownStaffId = '00000000-0000-0000-0000-000000000000'
      for (const staffId of [unknownStaffId, foreignStaff.id, inactiveStaff.id]) {
        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .set('Cookie', [centerCookie])
          .send({ staffId, pin: STAFF_PIN })
        expect(res.status).toBe(401)
        expect(res.body.code).toBe('UNAUTHORIZED')
      }
    })

    describe('progressive lockout', () => {
      let lockoutStaffId: string

      beforeAll(async () => {
        const [member] = await pg.db
          .insert(staff)
          .values({ centerId, name: 'לוקאאוט-בדיקה', role: 'staff', pinHash: await hash('9999') })
          .returning()
        if (!member) throw new Error('staff insert returned no row')
        lockoutStaffId = member.id
      })

      it('5 wrong PINs -> 423 PIN_LOCKED with retryAfterSec; correct PIN while locked is still 423', async () => {
        for (let i = 0; i < 5; i++) {
          const res = await request(app.getHttpServer())
            .post('/auth/login')
            .set('Cookie', [centerCookie])
            .send({ staffId: lockoutStaffId, pin: '0000' })
          expect(res.status).toBe(401)
        }

        const lockedRes = await request(app.getHttpServer())
          .post('/auth/login')
          .set('Cookie', [centerCookie])
          .send({ staffId: lockoutStaffId, pin: '0000' })
        expect(lockedRes.status).toBe(423)
        expect(apiErrorSchema.safeParse(lockedRes.body).success).toBe(true)
        expect(lockedRes.body.code).toBe('PIN_LOCKED')
        expect(lockedRes.body.details.retryAfterSec).toBeGreaterThan(0)

        const correctWhileLocked = await request(app.getHttpServer())
          .post('/auth/login')
          .set('Cookie', [centerCookie])
          .send({ staffId: lockoutStaffId, pin: '9999' })
        expect(correctWhileLocked.status).toBe(423)
      })

      it('after lock expiry, correct PIN succeeds and resets the counters', async () => {
        await pg.db
          .update(staff)
          .set({ lockedUntil: new Date(Date.now() - 1000) })
          .where(eq(staff.id, lockoutStaffId))

        const res = await request(app.getHttpServer())
          .post('/auth/login')
          .set('Cookie', [centerCookie])
          .send({ staffId: lockoutStaffId, pin: '9999' })

        expect(res.status).toBe(201)
        expect(res.body).toEqual({ staffId: lockoutStaffId, name: 'לוקאאוט-בדיקה', role: 'staff' })

        const [row] = await pg.db.select().from(staff).where(eq(staff.id, lockoutStaffId))
        expect(row?.failedAttempts).toBe(0)
        expect(row?.lockedUntil).toBeNull()
      })
    })
  })

  describe('GET /staff', () => {
    let app: INestApplication
    let jwtService: ReturnType<typeof makeTestJwtService>
    let firstAlphabeticallyId: string
    let inactiveStaffId: string

    beforeAll(async () => {
      app = await buildApp()
      jwtService = makeTestJwtService(SESSION_SECRET)

      // 'א' is the first letter of the Hebrew alphabet (lowest codepoint of
      // any Hebrew letter used in this file), so its ordering relative to
      // 'שרה' is unambiguous under any reasonable collation.
      const [first] = await pg.db
        .insert(staff)
        .values({ centerId, name: 'אבי', role: 'staff', pinHash: await hash('4444') })
        .returning()
      if (!first) throw new Error('staff insert returned no row')
      firstAlphabeticallyId = first.id

      const [inactive] = await pg.db
        .insert(staff)
        .values({ centerId, name: 'תמר', role: 'staff', pinHash: await hash('5555'), active: false })
        .returning()
      if (!inactive) throw new Error('staff insert returned no row')
      inactiveStaffId = inactive.id
    })

    afterAll(async () => {
      await app.close()
    })

    it('without a center cookie -> 401', async () => {
      const res = await request(app.getHttpServer()).get('/staff')
      expect(res.status).toBe(401)
    })

    it('with a center cookie -> active staff of the center, no hash fields, ordered by name', async () => {
      const centerCookie = centerCookieHeader(jwtService, centerId)
      const res = await request(app.getHttpServer()).get('/staff').set('Cookie', [centerCookie])

      expect(res.status).toBe(200)
      const body = res.body as Array<Record<string, unknown>>
      for (const row of body) {
        expect(row).not.toHaveProperty('pinHash')
        expect(row).not.toHaveProperty('pin_hash')
        expect(Object.keys(row).sort()).toEqual(['id', 'name', 'role'])
      }

      const ids = body.map((s) => s.id)
      expect(ids).not.toContain(inactiveStaffId)

      const firstIndex = body.findIndex((s) => s.id === firstAlphabeticallyId)
      const sarahIndex = body.findIndex((s) => s.id === happyStaffId)
      expect(firstIndex).toBeGreaterThanOrEqual(0)
      expect(sarahIndex).toBeGreaterThanOrEqual(0)
      expect(firstIndex).toBeLessThan(sarahIndex)
    })
  })

  describe('GET /auth/me and POST /auth/logout', () => {
    let app: INestApplication
    let jwtService: ReturnType<typeof makeTestJwtService>
    let centerCookie: string
    let sessionCookie: string

    beforeAll(async () => {
      app = await buildApp()
      jwtService = makeTestJwtService(SESSION_SECRET)
      centerCookie = centerCookieHeader(jwtService, centerId)
      sessionCookie = sessionCookieHeader(jwtService, { staffId: happyStaffId, centerId, role: 'manager' })
    })

    afterAll(async () => {
      await app.close()
    })

    it('me roundtrip returns staff + center', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', [centerCookie, sessionCookie])

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        staff: { id: happyStaffId, name: 'שרה', role: 'manager' },
        center: { id: centerId, name: 'Test Center' },
      })
    })

    it('me without a session cookie -> 401', async () => {
      const res = await request(app.getHttpServer()).get('/auth/me').set('Cookie', [centerCookie])
      expect(res.status).toBe(401)
    })

    it('logout clears the session cookie and returns 204', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', [centerCookie, sessionCookie])

      expect(res.status).toBe(204)
      const setCookie = res.headers['set-cookie'] as unknown as string[]
      const cleared = setCookie.find((c) => c.startsWith('qlm_session='))
      expect(cleared).toBeDefined()
      expect(cleared).toMatch(/qlm_session=;/)
    })

    it('logout without any auth -> 401', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout')
      expect(res.status).toBe(401)
    })
  })
})
