/**
 * Permission matrix (technical-prd §6/§10, R-13): every current route ×
 * {anonymous, center-only, staff, manager} asserting exact status codes.
 * Table-driven so Phase 3 endpoints add rows, not new test scaffolding.
 *
 * Auth was deliberately removed from prod (owner's request): CenterGuard now
 * falls back to the single seeded center and StaffSessionGuard to that
 * center's active manager whenever a cookie is missing/invalid. So on every
 * StaffSessionGuard route BOTH `anonymous` (no cookies) AND `center-only` (a
 * valid center cookie but no session cookie) resolve to the SAME manager
 * fallback identity — they no longer 401. The only role differentiation left
 * is on @Roles('manager') routes (session open/update/close): `staff` still
 * gets 403, everyone else (anonymous/center-only/manager, all manager-role)
 * passes.
 *
 * Personas run in PERSONAS order (anonymous → center-only → staff → manager)
 * against a shared DB, so on NON-idempotent rows `anonymous` is now the
 * FIRST caller and performs the successful mutation (its old `staff` value);
 * center-only/staff/manager then hit the resulting business-state error (the
 * old `manager` value: 409 already-paused/field-occupied, 404 already-gone).
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { and, asc, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, captains, centers, fields, matches, queueEntries, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
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
  method: 'get' | 'post' | 'patch' | 'delete'
  // A function, not a plain string, when the path embeds an id that only
  // exists after beforeAll seeds it (same reason bodyFor's entries are
  // functions below) — resolved lazily inside the `it()` callback.
  path: string | (() => string)
  // Functions, not plain objects: the `cases` table is built once at
  // collection time (before beforeAll seeds the DB and assigns
  // staffId/managerId), so a body that needs those ids must be read
  // lazily, inside the `it()` callback that runs after beforeAll. May be
  // async — the line-domain reorder row reads the CURRENT line from the DB
  // so its body is always a valid full permutation regardless of what
  // earlier rows in the array did to it.
  bodyFor: Partial<Record<Persona, () => Record<string, unknown> | Promise<Record<string, unknown>>>>
  expected: Record<Persona, number>
}

describe('permission matrix (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let centerId: string
  let staffId: string
  let managerId: string
  let matrixCaptainId: string
  let matrixCaptainId2: string
  let matrixSessionId: string
  // Line-domain fixtures (line-manager model): queue entries seeded into
  // matrixSessionId's line (the single session these permission-matrix rows
  // exercise — see beforeAll), plus a separate pre-closed session+match for
  // the match-lifecycle rows.
  let matrixMoveEntryId: string
  let matrixDeleteEntryId: string
  let matrixMatchId: string
  let matrixUndoActivityId: string
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
      .values({ centerId, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: managerId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    matrixSessionId = session.id

    const [captain2] = await pg.db.insert(captains).values({ centerId, name: 'Matrix Captain 2' }).returning()
    if (!captain2) throw new Error('captain insert returned no row')
    matrixCaptainId2 = captain2.id

    // Every line-domain fixture below reuses matrixSessionId — it's already
    // seeded above for the PATCH/close rows, so reusing it keeps the queue
    // entries wired to the same session those rows exercise. (A center may
    // now hold any number of concurrent active sessions — the
    // `one_active_session` constraint was dropped in the open-fields pivot,
    // see docs/superpowers/specs/2026-07-16-open-fields-design.md — so this
    // reuse is fixture economy, not a DB constraint.) A field is added so
    // POST /sessions/:id/start has somewhere to kick off onto.
    const [field] = await pg.db.insert(fields).values({ sessionId: matrixSessionId, centerId, name: 'מגרש', position: 0 }).returning()
    if (!field) throw new Error('field insert returned no row')

    async function seedMatrixEntry(captainId: string, position: number): Promise<string> {
      const [row] = await pg.db
        .insert(queueEntries)
        .values({ sessionId: matrixSessionId, centerId, captainId, position, createdAt: new Date() })
        .returning()
      if (!row) throw new Error('queue entry insert returned no row')
      return row.id
    }

    matrixMoveEntryId = await seedMatrixEntry(matrixCaptainId, 1)
    matrixDeleteEntryId = await seedMatrixEntry(matrixCaptainId2, 2)
    // Front-two candidates for POST /sessions/:id/start below — ids aren't
    // referenced directly since that row omits entryIds (default: front two).
    await seedMatrixEntry(matrixCaptainId, 3)
    await seedMatrixEntry(matrixCaptainId2, 4)

    // A pre-CLOSED session for the match-lifecycle rows: pause/resume/
    // extend/finish don't check session status at all, and a closed
    // session gives POST /matches/:id/replay a clean, symmetric 409
    // SESSION_CLOSED for both staff and manager (it can't succeed twice on
    // the same match anyway — replay doesn't consume the match, so a
    // "real" active session would make BOTH calls 201, which is a fine
    // outcome too, but a closed session keeps this fixture simple: a center
    // may now hold multiple concurrent active sessions, so a second active
    // session here would be legal too — just an unnecessary complication
    // for what this row is testing).
    const [matrixMatchSession] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'closed', createdBy: managerId })
      .returning()
    if (!matrixMatchSession) throw new Error('session insert returned no row')
    const [matrixMatchField] = await pg.db.insert(fields).values({ sessionId: matrixMatchSession.id, centerId, name: 'מגרש', position: 0 }).returning()
    if (!matrixMatchField) throw new Error('field insert returned no row')
    const [matchRow] = await pg.db
      .insert(matches)
      .values({
        sessionId: matrixMatchSession.id,
        centerId,
        fieldId: matrixMatchField.id,
        captainAId: matrixCaptainId,
        captainBId: matrixCaptainId2,
        status: 'live',
        plannedDurationSec: 300,
        startedAt: new Date(),
      })
      .returning()
    if (!matchRow) throw new Error('match insert returned no row')
    matrixMatchId = matchRow.id

    // action 'session.opened' has no undo handler (UndoService only
    // supports line.removed / line.reordered / match.finished) — a
    // deterministic 409 UNDO_EXPIRED for BOTH staff and manager, which is
    // exactly what this row needs to prove: the guard lets both through to
    // the same business outcome, no role differentiation here.
    const [activityRow] = await pg.db
      .insert(activityLog)
      .values({ centerId, sessionId: matrixSessionId, staffId: managerId, action: 'session.opened', entityType: 'session', entityId: matrixSessionId, createdAt: new Date() })
      .returning()
    if (!activityRow) throw new Error('activity insert returned no row')
    matrixUndoActivityId = activityRow.id

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
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<number> {
    const server = app.getHttpServer()
    let req =
      method === 'get'
        ? request(server).get(path)
        : method === 'post'
          ? request(server).post(path)
          : method === 'patch'
            ? request(server).patch(path)
            : request(server).delete(path)
    const cookies = cookiesByPersona[persona]
    if (cookies.length > 0) req = req.set('Cookie', cookies)
    if (body !== undefined) req = req.send(body)
    const res = await req
    return res.status
  }

  function resolvePath(path: Case['path']): string {
    return typeof path === 'function' ? path() : path
  }

  async function currentLineIds(): Promise<string[]> {
    const rows = await pg.db.select({ id: queueEntries.id }).from(queueEntries).where(eq(queueEntries.sessionId, matrixSessionId)).orderBy(asc(queueEntries.position))
    return rows.map((row) => row.id)
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
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'POST /auth/login',
      method: 'post',
      path: '/auth/login',
      // CenterGuard gates this route; personas that pass it attempt a real
      // login (staffId/pin don't need to relate to the calling persona —
      // the persona is defined by which cookies are sent).
      bodyFor: {
        // No cookie now falls back to the single center, so login is
        // reachable and a valid body succeeds (201) like every other persona.
        anonymous: () => ({ staffId, pin: STAFF_PIN }),
        centerOnly: () => ({ staffId, pin: STAFF_PIN }),
        staff: () => ({ staffId, pin: STAFF_PIN }),
        manager: () => ({ staffId, pin: STAFF_PIN }),
      },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'GET /auth/me',
      method: 'get',
      path: '/auth/me',
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'POST /auth/logout',
      method: 'post',
      path: '/auth/logout',
      bodyFor: {},
      expected: { anonymous: 204, centerOnly: 204, staff: 204, manager: 204 },
    },
    // --- Task 3a: captains (StaffSessionGuard only, no role gate) ---
    {
      route: 'GET /captains',
      method: 'get',
      path: '/captains',
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'POST /captains',
      method: 'post',
      path: '/captains',
      // Duplicate names are allowed (technical-prd §3), so both personas
      // reusing the same name below is intentional, not a collision risk.
      bodyFor: {
        anonymous: () => ({ name: 'Matrix Captain (anon)' }),
        centerOnly: () => ({ name: 'Matrix Captain (center)' }),
        staff: () => ({ name: 'Matrix Captain (staff)' }),
        manager: () => ({ name: 'Matrix Captain (manager)' }),
      },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'PATCH /captains/:id',
      method: 'patch',
      path: () => `/captains/${matrixCaptainId}`,
      bodyFor: {
        anonymous: () => ({ note: 'left by anon' }),
        centerOnly: () => ({ note: 'left by center' }),
        staff: () => ({ note: 'left by staff' }),
        manager: () => ({ note: 'left by manager' }),
      },
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    // --- Task 3a: sessions (@Roles('manager') on open/update/close) ---
    {
      route: 'POST /sessions',
      method: 'post',
      path: '/sessions',
      // Open-fields pivot (docs/superpowers/specs/2026-07-16-open-fields-design.md):
      // a center may have any number of concurrent active sessions, so the
      // manager-role personas now succeed (201) instead of 409ing on
      // beforeAll's pre-seeded matrixSessionId. This route's job in the
      // matrix is still proving RolesGuard gates it (staff -> 403, everyone
      // else -> past the guard).
      bodyFor: {
        anonymous: () => ({ matchDurationSec: 300 }),
        centerOnly: () => ({ matchDurationSec: 300 }),
        staff: () => ({ matchDurationSec: 300 }),
        manager: () => ({ matchDurationSec: 300 }),
      },
      expected: { anonymous: 201, centerOnly: 201, staff: 403, manager: 201 },
    },
    {
      route: 'GET /sessions/active',
      method: 'get',
      path: '/sessions/active',
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'PATCH /sessions/:id',
      method: 'patch',
      path: () => `/sessions/${matrixSessionId}`,
      bodyFor: {
        anonymous: () => ({ matchDurationSec: 240 }),
        centerOnly: () => ({ matchDurationSec: 240 }),
        staff: () => ({ matchDurationSec: 240 }),
        manager: () => ({ matchDurationSec: 240 }),
      },
      expected: { anonymous: 200, centerOnly: 200, staff: 403, manager: 200 },
    },
    // --- Task: line-domain (line-manager model) — StaffSessionGuard only,
    // no @Roles gate, so staff and manager are expected to reach the SAME
    // service call. Where that call isn't idempotent (DELETE, kickoff,
    // pause/resume/finish), staff runs first (PERSONAS order) and manager's
    // identical follow-up call legitimately hits a business-state 409/404 —
    // that still proves manager passed the guard, which is this matrix's
    // only job (the real happy paths are covered by the dedicated
    // line/matches/actions/reads int test files).
    {
      route: 'POST /sessions/:id/line',
      method: 'post',
      path: () => `/sessions/${matrixSessionId}/line`,
      bodyFor: {
        anonymous: () => ({ team: { newName: 'Matrix Line Anon' } }),
        centerOnly: () => ({ team: { newName: 'Matrix Line Center' } }),
        staff: () => ({ team: { newName: 'Matrix Line Staff' } }),
        manager: () => ({ team: { newName: 'Matrix Line Manager' } }),
      },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'PATCH /sessions/:id/line',
      method: 'patch',
      path: () => `/sessions/${matrixSessionId}/line`,
      // A no-op reorder built from whatever is CURRENTLY in matrixSessionId's
      // line at call time (same set, same order) — always a valid full
      // permutation regardless of what earlier rows (add/move/delete) did
      // to it, and safe to call twice (staff, then manager).
      bodyFor: {
        anonymous: async () => ({ entryIds: await currentLineIds() }),
        centerOnly: async () => ({ entryIds: await currentLineIds() }),
        staff: async () => ({ entryIds: await currentLineIds() }),
        manager: async () => ({ entryIds: await currentLineIds() }),
      },
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'POST /line/:entryId/move-top',
      method: 'post',
      path: () => `/line/${matrixMoveEntryId}/move-top`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'POST /line/:entryId/move-bottom',
      method: 'post',
      path: () => `/line/${matrixMoveEntryId}/move-bottom`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      // Not idempotent: staff's call actually deletes the row, so
      // manager's identical follow-up legitimately 404s (already gone) —
      // a real business response, not an auth block.
      route: 'DELETE /line/:entryId',
      method: 'delete',
      path: () => `/line/${matrixDeleteEntryId}`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 200, centerOnly: 404, staff: 404, manager: 404 },
    },
    {
      // staff's call pairs the front two of matrixSessionId's line and
      // occupies its field; manager's identical (front-two, unspecified)
      // call still finds >=2 entries left but the field is now occupied.
      route: 'POST /sessions/:id/start',
      method: 'post',
      path: () => `/sessions/${matrixSessionId}/start`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 201, centerOnly: 409, staff: 409, manager: 409 },
    },
    {
      route: 'POST /matches/:id/pause',
      method: 'post',
      path: () => `/matches/${matrixMatchId}/pause`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 201, centerOnly: 409, staff: 409, manager: 409 },
    },
    {
      route: 'POST /matches/:id/resume',
      method: 'post',
      path: () => `/matches/${matrixMatchId}/resume`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 201, centerOnly: 409, staff: 409, manager: 409 },
    },
    {
      route: 'POST /matches/:id/extend',
      method: 'post',
      path: () => `/matches/${matrixMatchId}/extend`,
      bodyFor: {
        anonymous: () => ({ addSec: 30 }),
        centerOnly: () => ({ addSec: 30 }),
        staff: () => ({ addSec: 30 }),
        manager: () => ({ addSec: 30 }),
      },
      expected: { anonymous: 201, centerOnly: 201, staff: 201, manager: 201 },
    },
    {
      route: 'POST /matches/:id/finish',
      method: 'post',
      path: () => `/matches/${matrixMatchId}/finish`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 201, centerOnly: 409, staff: 409, manager: 409 },
    },
    {
      // matrixMatchId's session is pre-closed (see beforeAll) — replay
      // checks the session is active, so BOTH calls hit the same 409
      // SESSION_CLOSED. Proves the guard passes both through; the real
      // active-session replay path is covered by matches.int.test.ts.
      route: 'POST /matches/:id/replay',
      method: 'post',
      path: () => `/matches/${matrixMatchId}/replay`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 409, centerOnly: 409, staff: 409, manager: 409 },
    },
    {
      route: 'POST /actions/:activityId/undo',
      method: 'post',
      path: () => `/actions/${matrixUndoActivityId}/undo`,
      bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
      expected: { anonymous: 409, centerOnly: 409, staff: 409, manager: 409 },
    },
    {
      route: 'GET /activity',
      method: 'get',
      path: () => `/activity?sessionId=${matrixSessionId}`,
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'GET /sessions',
      method: 'get',
      path: '/sessions',
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'GET /sessions/:id/history',
      method: 'get',
      path: () => `/sessions/${matrixSessionId}/history`,
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
    {
      route: 'GET /sessions/:id/summary',
      method: 'get',
      path: () => `/sessions/${matrixSessionId}/summary`,
      bodyFor: {},
      expected: { anonymous: 200, centerOnly: 200, staff: 200, manager: 200 },
    },
  ]

  // Declared last, outside `cases`: this is the only destructive session
  // row (closes matrixSessionId), and every case above needs it to still be
  // active. manager -> 201, matching this codebase's POST default (see
  // POST /auth/center, POST /auth/login) — no @HttpCode override here.
  // Split out from `cases` (rather than just appended) because it needs a
  // real cleanup step first: POST /sessions/:id/start above left a live
  // match on matrixSessionId's field, which would otherwise block the
  // close with SESSION_HAS_LIVE_MATCH.
  const closeCase: Case = {
    route: 'POST /sessions/:id/close',
    method: 'post',
    path: () => `/sessions/${matrixSessionId}/close`,
    bodyFor: { anonymous: () => ({}), centerOnly: () => ({}), staff: () => ({}), manager: () => ({}) },
    expected: { anonymous: 201, centerOnly: 409, staff: 403, manager: 409 },
  }

  for (const testCase of cases) {
    describe(testCase.route, () => {
      for (const persona of PERSONAS) {
        it(`${persona} -> ${testCase.expected[persona]}`, async () => {
          const body = await testCase.bodyFor[persona]?.()
          const status = await callAs(persona, testCase.method, resolvePath(testCase.path), body)
          expect(status).toBe(testCase.expected[persona])
        })
      }
    })
  }

  it('cleanup: finishes the live match POST /sessions/:id/start created on matrixSessionId, so close can succeed', async () => {
    await pg.db
      .update(matches)
      .set({ status: 'finished', endedAt: new Date(), endReason: 'manual' })
      .where(and(eq(matches.sessionId, matrixSessionId), inArray(matches.status, ['live', 'paused'])))
  })

  describe(closeCase.route, () => {
    for (const persona of PERSONAS) {
      it(`${persona} -> ${closeCase.expected[persona]}`, async () => {
        const body = await closeCase.bodyFor[persona]?.()
        const status = await callAs(persona, closeCase.method, resolvePath(closeCase.path), body)
        expect(status).toBe(closeCase.expected[persona])
      })
    }
  })
})
