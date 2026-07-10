/**
 * Permission matrix (technical-prd §6/§10, R-13): every current route ×
 * {anonymous, center-only, staff, manager} asserting exact status codes.
 * Table-driven so Phase 3 endpoints add rows, not new test scaffolding.
 *
 * No route in this phase is manager-only (RolesGuard isn't wired to
 * anything yet — see src/auth/guards/roles.guard.test.ts for its unit
 * coverage), so `staff` and `manager` currently behave identically here;
 * that's the expected baseline this matrix locks in before Phase 3 adds
 * the first role-differentiated row.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { centers, staff } from '../src/db/schema'
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
  method: 'get' | 'post'
  path: string
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
    method: 'get' | 'post',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<number> {
    const server = app.getHttpServer()
    let req = method === 'get' ? request(server).get(path) : request(server).post(path)
    const cookies = cookiesByPersona[persona]
    if (cookies.length > 0) req = req.set('Cookie', cookies)
    if (body !== undefined) req = req.send(body)
    const res = await req
    return res.status
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
  ]

  for (const testCase of cases) {
    describe(testCase.route, () => {
      for (const persona of PERSONAS) {
        it(`${persona} -> ${testCase.expected[persona]}`, async () => {
          const body = testCase.bodyFor[persona]?.()
          const status = await callAs(persona, testCase.method, testCase.path, body)
          expect(status).toBe(testCase.expected[persona])
        })
      }
    })
  }
})
