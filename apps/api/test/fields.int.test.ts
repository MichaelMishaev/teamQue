/**
 * Integration test (open-fields spec, Task 5): the public fields surface
 * against a real Postgres (Testcontainers) and a real Nest app instance
 * (supertest). No auth cookies are sent — StaffSessionGuard/CenterGuard fall
 * back to the single seeded center/manager (same pattern as
 * visitors.int.test.ts), which is exactly the "anyone can create a field"
 * shape the open-fields pivot wants.
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

const SESSION_SECRET = 'e'.repeat(32)
const MANAGER_PIN = '6666'

describe('fields (integration)', () => {
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
      .values({ name: 'Fields Center', pinHash: await hash('9876') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    // A seeded manager so the StaffSessionGuard fallback (no session cookie)
    // resolves to a real identity — mirrors visitors.int.test.ts.
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

  it('POST /fields creates a field: snapshot has the slug, the named field, empty queue', async () => {
    const res = await request(app.getHttpServer()).post('/fields').send({ name: 'מגרש בית ספר', matchDurationSec: 360 }).expect(201)
    expect(res.body.slug).toMatch(/^[a-z2-9]{6}$/)
    expect(res.body.snapshot.session.slug).toBe(res.body.slug)
    expect(res.body.snapshot.fields[0].name).toBe('מגרש בית ספר')
    expect(res.body.snapshot.queue).toEqual([])
  })

  it('GET /fields lists active fields newest-first with queue length + live flag', async () => {
    const a = await request(app.getHttpServer()).post('/fields').send({ name: 'א', matchDurationSec: 300 }).expect(201)
    const b = await request(app.getHttpServer()).post('/fields').send({ name: 'ב', matchDurationSec: 300 }).expect(201)
    const list = await request(app.getHttpServer()).get('/fields').expect(200)
    const slugs = list.body.map((row: { slug: string }) => row.slug)
    expect(slugs.indexOf(b.body.slug)).toBeLessThan(slugs.indexOf(a.body.slug))
    expect(list.body[0]).toMatchObject({ queueLength: 0, hasLiveMatch: false })
  })

  it('GET /fields/:slug resolves; unknown slug 404s', async () => {
    const created = await request(app.getHttpServer()).post('/fields').send({ name: 'ג', matchDurationSec: 300 }).expect(201)
    const snap = await request(app.getHttpServer()).get(`/fields/${created.body.slug}`).expect(200)
    expect(snap.body.session.id).toBe(created.body.snapshot.session.id)
    await request(app.getHttpServer()).get('/fields/zzzzzz').expect(404)
  })

  it('POST /fields/:slug/close force-closes even with a live match, idempotently, and drops it from the list', async () => {
    const created = await request(app.getHttpServer()).post('/fields').send({ name: 'ד', matchDurationSec: 300 }).expect(201)
    const sessionId = created.body.snapshot.session.id
    // build a live match through the existing line + start routes
    await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).send({ team: { newName: 'קבוצה 1' } }).expect(201)
    await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).send({ team: { newName: 'קבוצה 2' } }).expect(201)
    await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).send({}).expect(201)
    await request(app.getHttpServer()).post(`/fields/${created.body.slug}/close`).expect(200)
    await request(app.getHttpServer()).post(`/fields/${created.body.slug}/close`).expect(200) // idempotent
    const list = await request(app.getHttpServer()).get('/fields').expect(200)
    expect(list.body.map((row: { slug: string }) => row.slug)).not.toContain(created.body.slug)
    const snap = await request(app.getHttpServer()).get(`/fields/${created.body.slug}`).expect(200)
    expect(snap.body.session.status).toBe('closed')
  })
})
