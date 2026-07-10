/**
 * Permission matrix (technical-prd §6/§10, R-13): every current route ×
 * {anonymous, center-only, staff, manager} asserting exact status codes.
 * Table-driven so Phase 3 endpoints add rows, not new test scaffolding.
 *
 * Task 3a adds the first role-differentiated rows (session open/update/close
 * are @Roles('manager')) — `staff` and `manager` diverge there; every other
 * route still treats them identically, the baseline earlier phases locked in.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { captains, centers, sessions, staff } from '../src/db/schema'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'b'.repeat(32)
const CENTER_PIN = '1357'
const STAFF_PIN = '2222'
const MANAGER_PIN = '3333'

type Persona = 'anonymous' | 'centerOnly' | 'staff' | 'manager'
const PERSONAS: Persona[] = ['anonymous', 'centerOnly', 'staff', 'manager']

type Case = {
  route: string
  method: 'get' | 'post' | 'patch'
  // A function, not a plain string, when the path embeds an id that only
  // exists after beforeAll seeds it (same reason bodyFor's entries are
  // functions below) — resolved lazily inside the `it()` callback.
  path: string | (() => string)
  // Functions, not plain objects: the `cases` table is built once at
  // collection time (before beforeAll seeds the DB and assigns
  // staffId/managerId), so a body that needs those ids must be read
  // lazily, inside the `it()` callback that runs after beforeAll.
  bodyFor: Partial<Record<Persona, () => Record<string, unknown>>>
  expected: Record<Persona, number>
}

describe('permission matrix (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let centerId: string
  let staffId: string
  let managerId: string
  let matrixCaptainId: string
  let matrixSessionId: string
  let jwtService: ReturnType<typeof makeTestJwtService>
  let cookiesByPersona: Record<Persona, string[]>

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Matrix Center', pinHash: await hash(CENTER_PIN) })
      .returning()
    if (!center) throw new Error('center insert returned no row')
    centerId = center.id

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId, name: 'Staffer', role: 'staff', pinHash: await hash(STAFF_PIN) })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')
    staffId = staffMember.id

    const [managerMember] = await pg.db
      .insert(staff)
      .values({ centerId, name: 'Manager', role: 'manager', pinHash: await hash(MANAGER_PIN) })
      .returning()
    if (!managerMember) throw new Error('staff insert returned no row')
    managerId = managerMember.id

    // Seeded directly (not via the API) so the captains/sessions PATCH/close
    // rows below have a real id to exercise, independent of any other case's
    // ordering or side effects.
    const [captain] = await pg.db.insert(captains).values({ centerId, name: 'Matrix Captain' }).returning()
    if (!captain) throw new Error('captain insert returned no row')
    matrixCaptainId = captain.id

    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', matchDurationSec: 300, status: 'active', createdBy: managerId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    matrixSessionId = session.id

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()

    jwtService = makeTestJwtService(SESSION_SECRET)
    const centerCookie = centerCookieHeader(jwtService, centerId)
    cookiesByPersona = {
      anonymous: [],
      centerOnly: [centerCookie],
      staff: [centerCookie, sessionCookieHeader(jwtService, { staffId, centerId, role: 'staff' })],
      manager: [centerCookie, sessionCookieHeader(jwtService, { staffId: managerId, centerId, role: 'manager' })],
    }
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  async function callAs(
    persona: Persona,
    method: 'get' | 'post' | 'patch',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<number> {
    const server = app.getHttpServer()
    let req =
      method === 'get' ? request(server).get(path) : method === 'post' ? request(server).post(path) : request(server).patch(path)
    const cookies = cookiesByPersona[persona]
    if (cookies.length > 0) req = req.set('Cookie', cookies)
    if (body !== undefined) req = req.send(body)
    const res = await req
    return res.status
  }

  function resolvePath(path: Case['path']): string {
    return typeof path === 'function' ? path() : path
  }

  const cases: Case[] = [
    {
      route: 'POST /auth/center',
      method: 'post',
      path: '/auth/center',
      // No guard on this route by design (it's the entrypoint) — every
      // persona succeeds. Kept under the throttler's 5/15min budget: this
      // test file's own app instance never calls it more than 4 times.
      bodyFor: {
        anonymous: () => ({ pin: CENTER_PIN }),
        centerOnly: () => ({ pin: CENTER_PIN }),
        staff: () => ({ pin: CENTER_PIN }),
        manager: () => ({ pin: CENTER_PIN }),
      },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'GET /staff',
      method: 'get',
      path: '/staff',
      bodyFor: {},
      expected: { anonymous: 401, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'POST /auth/login',
      method: 'post',
      path: '/auth/login',
      // CenterGuard gates this route; personas that pass it attempt a real
      // login (staffId/pin don't need to relate to the calling persona —
      // the persona is defined by which cookies are sent).
      bodyFor: {
        anonymous: () => ({}),
        centerOnly: () => ({ staffId, pin: STAFF_PIN }),
        staff: () => ({ staffId, pin: STAFF_PIN }),
        manager: () => ({ staffId, pin: STAFF_PIN }),
      },
      expected: { anonymous: 401, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'GET /auth/me',
      method: 'get',
      path: '/auth/me',
      bodyFor: {},
      expected: { anonymous: 401, centerOnly: 401, staff: 200, manager: 200 },
    },
    {
      route: 'POST /auth/logout',
      method: 'post',
      path: '/auth/logout',
      bodyFor: {},
      expected: { anonymous: 401, centerOnly: 401, staff: 204, manager: 204 },
    },
    // --- Task 3a: captains (StaffSessionGuard only, no role gate) ---
    {
      route: 'GET /captains',
      method: 'get',
      path: '/captains',
      bodyFor: {},
      expected: { anonymous: 401, centerOnly: 401, staff: 200, manager: 200 },
    },
    {
      route: 'POST /captains',
      method: 'post',
      path: '/captains',
      // Duplicate names are allowed (technical-prd §3), so both personas
      // reusing the same name below is intentional, not a collision risk.
      bodyFor: {
        anonymous: () => ({}),
        centerOnly: () => ({}),
        staff: () => ({ name: 'Matrix Captain (staff)' }),
        manager: () => ({ name: 'Matrix Captain (manager)' }),
      },
      expected: { anonymous: 401, centerOnly: 401, staff: 201, manager: 201 },
    },
    {
      route: 'PATCH /captains/:id',
      method: 'patch',
      path: () => `/captains/${matrixCaptainId}`,
      bodyFor: {
        anonymous: () => ({}),
        centerOnly: () => ({}),
        staff: () => ({ note: 'left by staff' }),
        manager: () => ({ note: 'left by manager' }),
      },
      expected: { anonymous: 401, centerOnly: 401, staff: 200, manager: 200 },
    },
    // --- Task 3a: sessions (@Roles('manager') on open/update/close) ---
    {
      route: 'POST /sessions',
      method: 'post',
      path: '/sessions',
      // manager gets 409, not 201: beforeAll pre-seeds an active session so
      // the PATCH/close rows below have a real id regardless of case order.
      // This route's job in the matrix is proving RolesGuard gates it
      // (staff -> 403, manager -> past the guard); the true 201 happy path
      // is covered by test/sessions.int.test.ts.
      bodyFor: {
        anonymous: () => ({}),
        centerOnly: () => ({}),
        staff: () => ({ matchDurationSec: 300 }),
        manager: () => ({ matchDurationSec: 300 }),
      },
      expected: { anonymous: 401, centerOnly: 401, staff: 403, manager: 409 },
    },
    {
      route: 'GET /sessions/active',
      method: 'get',
      path: '/sessions/active',
      bodyFor: {},
      expected: { anonymous: 401, centerOnly: 401, staff: 200, manager: 200 },
    },
    {
      route: 'PATCH /sessions/:id',
      method: 'patch',
      path: () => `/sessions/${matrixSessionId}`,
      bodyFor: {
        anonymous: () => ({}),
        centerOnly: () => ({}),
        staff: () => ({ matchDurationSec: 240 }),
        manager: () => ({ matchDurationSec: 240 }),
      },
      expected: { anonymous: 401, centerOnly: 401, staff: 403, manager: 200 },
    },
    {
      // Declared last: this is the only destructive session row (closes
      // matrixSessionId), and every case above needs it to still be active.
      // manager -> 201, matching this codebase's POST default (see
      // POST /auth/center, POST /auth/login) — no @HttpCode override here.
      route: 'POST /sessions/:id/close',
      method: 'post',
      path: () => `/sessions/${matrixSessionId}/close`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 401, centerOnly: 401, staff: 403, manager: 201 },
    },
  ]

  for (const testCase of cases) {
    describe(testCase.route, () => {
      for (const persona of PERSONAS) {
        it(`${persona} -> ${testCase.expected[persona]}`, async () => {
          const body = testCase.bodyFor[persona]?.()
          const status = await callAs(persona, testCase.method, resolvePath(testCase.path), body)
          expect(status).toBe(testCase.expected[persona])
        })
      }
    })
  }
})
