/**
 * Integration test (open-fields spec §3.2, Task 4): the visitor identity
 * surface against a real Postgres (Testcontainers) and a real Nest app
 * instance (supertest). POST /visitors creates a `staff` row with role
 * 'visitor' and sets a long-lived qlm_session cookie; GET /visitors/me
 * round-trips it (404 for any non-visitor resolved identity, including the
 * StaffSessionGuard manager fallback when no cookie is sent); GET /staff
 * excludes visitors from the roster; and an existing route (POST /sessions)
 * accepts the visitor cookie unchanged, proving StaffSessionGuard needs zero
 * changes to support the new role.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { centers, staff } from '../src/db/schema'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'd'.repeat(32)
const MANAGER_PIN = '4444'

describe('visitors (integration)', () => {
  let pg: TestPg
  let app: INestApplication

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Visitors Center', pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    // A seeded manager so the StaffSessionGuard fallback (no session cookie)
    // resolves to a real non-visitor identity — that's what makes the
    // no-cookie GET /visitors/me case below a genuine 404 (resolved
    // identity isn't a visitor) rather than a 401 (no identity at all).
    const [managerMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash(MANAGER_PIN) })
      .returning()
    if (!managerMember) throw new Error('staff insert returned no row')

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  // Fresh Nest app per test below (mirrors fields.int.test.ts's POST /fields
  // throttler test): ThrottlerStorage is a fresh in-memory Map per compiled
  // module, so this test gets its own untouched 10/hour bucket instead of
  // inheriting hits from the shared `app`'s POST /visitors calls above.
  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const freshApp = moduleRef.createNestApplication()
    freshApp.use(cookieParser())
    await freshApp.init()
    return freshApp
  }

  it('POST /visitors creates a visitor identity and sets the session cookie', async () => {
    const res = await request(app.getHttpServer()).post('/visitors').send({ nickname: 'אורח 42' })
    expect(res.status).toBe(201)
    expect(res.body.nickname).toBe('אורח 42')
    expect(res.body.visitorId).toMatch(/^[0-9a-f-]{36}$/)
    const cookies = res.get('Set-Cookie') ?? []
    expect(cookies.some((c) => c.startsWith('qlm_session='))).toBe(true)
  })

  it('GET /visitors/me round-trips the cookie; 404 without one', async () => {
    const agent = request.agent(app.getHttpServer())
    await agent.post('/visitors').send({ nickname: 'דנה' }).expect(201)
    const me = await agent.get('/visitors/me').expect(200)
    expect(me.body.nickname).toBe('דנה')
    await request(app.getHttpServer()).get('/visitors/me').expect(404)
  })

  it('GET /staff excludes visitors', async () => {
    await request(app.getHttpServer()).post('/visitors').send({ nickname: 'זמני' }).expect(201)
    const res = await request(app.getHttpServer()).get('/staff').expect(200)
    expect(res.body.every((row: { role: string }) => row.role !== 'visitor')).toBe(true)
  })

  it('a visitor cookie attributes mutations (activity staffId = visitorId)', async () => {
    const agent = request.agent(app.getHttpServer())
    const hello = await agent.post('/visitors').send({ nickname: 'מאמן' }).expect(201)
    const open = await agent.post('/sessions').send({ matchDurationSec: 360 }).expect(201)
    const activity = await agent.get(`/activity?sessionId=${open.body.id}`).expect(200)
    expect(activity.body[0].staffId).toBe(hello.body.visitorId)
  })

  it('11th POST /visitors within the window -> 429 (throttler)', async () => {
    const throttledApp = await buildApp()
    try {
      for (let i = 0; i < 10; i++) {
        const res = await request(throttledApp.getHttpServer())
          .post('/visitors')
          .send({ nickname: `אורח ${i}` })
        expect(res.status).toBe(201)
      }

      const eleventh = await request(throttledApp.getHttpServer())
        .post('/visitors')
        .send({ nickname: 'אורח אחד עשר' })
      expect(eleventh.status).toBe(429)
    } finally {
      await throttledApp.close()
    }
  })
})
