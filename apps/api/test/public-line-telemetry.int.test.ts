import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { and, eq } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { activityLog, centers, fields, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'p'.repeat(32)
const visitId = '2e2c6e34-69f6-48a8-a8d5-4d436e9b9270'

describe('public line telemetry (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let sessionId: string
  let slug: string

  const viewEvent = {
    type: 'viewed',
    visitId,
    viewport: 'mobile',
    displayMode: 'standalone',
    queueCount: 5,
    pairCount: 3,
    hasUnpairedTeam: true,
    hasLiveMatch: true,
    firstWaitSec: 240,
    lastWaitSec: 960,
  }

  beforeAll(async () => {
    pg = await startTestPg()
    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Public Line Center', pinHash: await hash('9876') })
      .returning()
    if (!center) throw new Error('center insert returned no row')
    const [manager] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash('1234') })
      .returning()
    if (!manager) throw new Error('manager insert returned no row')

    slug = generateSlug()
    const [session] = await pg.db
      .insert(sessions)
      .values({
        centerId: center.id,
        date: '2026-07-22',
        slug,
        matchDurationSec: 360,
        status: 'active',
        createdBy: manager.id,
      })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    sessionId = session.id
    await pg.db.insert(fields).values({
      sessionId,
      centerId: center.id,
      name: 'כיכר העצמאות, מגרש 1',
      position: 0,
    })

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  it('records an anonymous aggregate event in the activity log', async () => {
    await request(app.getHttpServer())
      .post(`/fields/${slug}/public-line-events`)
      .send(viewEvent)
      .expect(202, { recorded: true })

    const rows = await pg.db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.sessionId, sessionId), eq(activityLog.action, 'public_line.viewed')))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      staffId: null,
      entityType: 'public_line_visit',
      entityId: visitId,
      afterJson: viewEvent,
    })
  })

  it('rejects identity fields and does not create another view event', async () => {
    await request(app.getHttpServer())
      .post(`/fields/${slug}/public-line-events`)
      .send({ ...viewEvent, captainName: 'must not be stored' })
      .expect(400)

    const rows = await pg.db
      .select({ id: activityLog.id })
      .from(activityLog)
      .where(and(eq(activityLog.sessionId, sessionId), eq(activityLog.action, 'public_line.viewed')))
    expect(rows).toHaveLength(1)
  })
})
