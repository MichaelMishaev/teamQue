import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { activityEntrySchema, activityLogPageSchema } from 'shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { captains, centers, fields, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'l'.repeat(32)

describe('full activity log (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let centerId: string
  let staffId: string
  let sessionId: string
  let staffCookies: string[]
  let rejectedCorrelationId: string

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

    const [center] = await pg.db.insert(centers).values({ name: 'Log Center', pinHash: await hash('9999') }).returning()
    if (!center) throw new Error('center insert returned no row')
    centerId = center.id

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId, name: 'שרה', role: 'staff', pinHash: await hash('2222') })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')
    staffId = staffMember.id

    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-17', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: staffId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    sessionId = session.id
    await pg.db.insert(fields).values({ sessionId, centerId, name: 'מגרש', position: 0 })

    const [captain] = await pg.db.insert(captains).values({ centerId, name: 'דניאל' }).returning()
    if (!captain) throw new Error('captain insert returned no row')

    const jwt = makeTestJwtService(SESSION_SECRET)
    staffCookies = [
      centerCookieHeader(jwt, centerId),
      sessionCookieHeader(jwt, { staffId, centerId, role: 'staff' }),
    ]

    const added = await request(app.getHttpServer())
      .post(`/sessions/${sessionId}/line`)
      .set('Cookie', staffCookies)
      .send({ team: captain.id })
    expect(added.status).toBe(201)

    const rejected = await request(app.getHttpServer())
      .patch(`/sessions/${sessionId}/line`)
      .set('Cookie', staffCookies)
      .send({ entryIds: [] })
    expect(rejected.status).toBe(400)
    rejectedCorrelationId = rejected.headers['x-correlation-id'] as string
    expect(rejectedCorrelationId).toMatch(/^[0-9a-f-]{36}$/)
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  it('filters a durable rejected request by type, outcome, action, actor, status, session, and time', async () => {
    const params = new URLSearchParams({
      eventKind: 'exception',
      outcome: 'rejected',
      action: 'PATCH /sessions/:id/line',
      staffId,
      statusCode: '400',
      sessionId,
      from: '2026-01-01T00:00:00.000Z',
      to: '2027-01-01T00:00:00.000Z',
      limit: '20',
    })
    const res = await request(app.getHttpServer()).get(`/activity/log?${params}`).set('Cookie', staffCookies)

    expect(res.status).toBe(200)
    expect(activityLogPageSchema.safeParse(res.body).success).toBe(true)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({
      eventKind: 'exception',
      outcome: 'rejected',
      action: 'PATCH /sessions/:id/line',
      staffId,
      staffName: 'שרה',
      sessionId,
      statusCode: 400,
      errorCode: 'VALIDATION_FAILED',
      correlationId: rejectedCorrelationId,
    })
    expect(activityEntrySchema.safeParse(res.body.items[0]).success).toBe(true)
  })

  it('keeps successful action history separate and returns filter facets', async () => {
    const params = new URLSearchParams({ eventKind: 'action', action: 'line.added', sessionId })
    const res = await request(app.getHttpServer()).get(`/activity/log?${params}`).set('Cookie', staffCookies)

    expect(res.status).toBe(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({ eventKind: 'action', outcome: 'success', action: 'line.added' })
    expect(res.body.actions).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'line.added' })]))
    expect(res.body.actors).toEqual(expect.arrayContaining([expect.objectContaining({ staffId, staffName: 'שרה' })]))
  })

  it('paginates the complete center history with an opaque cursor and no duplicate rows', async () => {
    const first = await request(app.getHttpServer()).get('/activity/log?limit=1').set('Cookie', staffCookies)
    expect(first.status).toBe(200)
    expect(first.body.items).toHaveLength(1)
    expect(first.body.nextCursor).toEqual(expect.any(String))

    const second = await request(app.getHttpServer())
      .get(`/activity/log?limit=1&cursor=${encodeURIComponent(first.body.nextCursor as string)}`)
      .set('Cookie', staffCookies)
    expect(second.status).toBe(200)
    expect(second.body.items).toHaveLength(1)
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id)
  })
})
