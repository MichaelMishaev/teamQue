/**
 * Integration test (open-fields spec §3.3): the 18h idle auto-expiry sweep
 * against a real Postgres (Testcontainers) and a real Nest app instance
 * (supertest) — mirrors fields.int.test.ts's bootstrap. Covers both halves
 * of the heartbeat contract: expireStale() force-closes fields whose
 * last_activity_at is stale (>18h) and leaves fresh ones alone, and any
 * mutating request (via SessionEventsService.broadcast) resets the clock so
 * a field being actively used never gets swept.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { sql } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { centers, staff } from '../src/db/schema'
import { ExpiryService } from '../src/fields/expiry.service'
import { startTestPg, type TestPg } from './helpers/pg'

describe('expiry sweep (integration)', () => {
  let pg: TestPg
  let app: INestApplication

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = 'e'.repeat(32)
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Expiry Center', pinHash: await hash('9876') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [managerMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash('6666') })
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

  it('expireStale closes fields idle >18h and leaves fresh ones alone', async () => {
    const stale = await request(app.getHttpServer()).post('/fields').send({ name: 'ישן', matchDurationSec: 300 }).expect(201)
    const fresh = await request(app.getHttpServer()).post('/fields').send({ name: 'חדש', matchDurationSec: 300 }).expect(201)
    const staleId = stale.body.snapshot.session.id

    // backdate the stale field's heartbeat 19h
    await pg.db.execute(sql`UPDATE sessions SET last_activity_at = now() - interval '19 hours' WHERE id = ${staleId}`)

    const closed = await app.get(ExpiryService).expireStale()
    expect(closed).toBe(1)

    const list = await request(app.getHttpServer()).get('/fields').expect(200)
    const slugs = list.body.map((row: { slug: string }) => row.slug)
    expect(slugs).not.toContain(stale.body.slug)
    expect(slugs).toContain(fresh.body.slug)
  })

  it('mutations refresh last_activity_at (heartbeat via broadcast)', async () => {
    const created = await request(app.getHttpServer()).post('/fields').send({ name: 'פעיל', matchDurationSec: 300 }).expect(201)
    const sessionId = created.body.snapshot.session.id
    await pg.db.execute(sql`UPDATE sessions SET last_activity_at = now() - interval '19 hours' WHERE id = ${sessionId}`)

    await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).send({ team: { newName: 'קבוצה' } }).expect(201)

    const closed = await app.get(ExpiryService).expireStale()
    expect(closed).toBe(0) // the line mutation touched the heartbeat
  })
})
