/**
 * Integration test (open-fields spec, Task 5): the public fields surface
 * against a real Postgres (Testcontainers) and a real Nest app instance
 * (supertest). Mutations require manager cookies; read-only GETs are also
 * exercised anonymously through the exact configured public-line host.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppModule } from '../src/app.module'
import { centers, staff } from '../src/db/schema'
import * as slugModule from '../src/fields/slug'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'e'.repeat(32)
const MANAGER_PIN = '6666'

describe('fields (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let managerCookies: string[]

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.PUBLIC_LINE_HOST = 'line.maple-group.info'
    process.env.NODE_ENV = 'test'

    const [center] = await pg.db
      .insert(centers)
      .values({ name: 'Fields Center', pinHash: await hash('9876') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [managerMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash(MANAGER_PIN) })
      .returning()
    if (!managerMember) throw new Error('staff insert returned no row')
    const jwtService = makeTestJwtService(SESSION_SECRET)
    managerCookies = [
      centerCookieHeader(jwtService, center.id),
      sessionCookieHeader(jwtService, { staffId: managerMember.id, centerId: center.id, role: 'manager' }),
    ]

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.init()
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  // Fresh Nest app per test below (mirrors auth.int.test.ts's POST /auth/center
  // throttler test): ThrottlerStorage is a fresh in-memory Map per compiled
  // module, so each test gets its own untouched 5/hour bucket instead of
  // inheriting hits from the shared `app`'s POST /fields calls above.
  async function buildApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    const freshApp = moduleRef.createNestApplication()
    freshApp.use(cookieParser())
    await freshApp.init()
    return freshApp
  }

  it('POST /fields creates a field: snapshot has the slug, the named field, empty queue', async () => {
    const res = await request(app.getHttpServer()).post('/fields').set('Cookie', managerCookies).send({ name: 'מגרש בית ספר', matchDurationSec: 360 }).expect(201)
    expect(res.body.slug).toMatch(/^[a-z2-9]{6}$/)
    expect(res.body.snapshot.session.slug).toBe(res.body.slug)
    expect(res.body.snapshot.fields[0].name).toBe('מגרש בית ספר')
    expect(res.body.snapshot.queue).toEqual([])
  })

  it('password-protected field blocks every fresh staff-console entry until its four-digit password is verified', async () => {
    const created = await request(app.getHttpServer())
      .post('/fields')
      .set('Cookie', managerCookies)
      .send({ name: 'מגרש מוגן', matchDurationSec: 360, password: '4829' })
      .expect(201)
    const slug: string = created.body.slug
    expect(created.headers['set-cookie']).toBeUndefined()

    const access = await request(app.getHttpServer()).get(`/fields/${slug}/access`).set('Cookie', managerCookies).expect(200)
    expect(access.body).toEqual({ passwordRequired: true, granted: false })

    await request(app.getHttpServer()).get(`/fields/${slug}`).set('Cookie', managerCookies).expect(403)
    await request(app.getHttpServer()).post(`/fields/${slug}/access`).set('Cookie', managerCookies).send({ password: '0000' }).expect(403)

    const unlocked = await request(app.getHttpServer())
      .post(`/fields/${slug}/access`)
      .set('Cookie', managerCookies)
      .send({ password: '4829' })
      .expect(201)
    const unlockedCookie = unlocked.headers['set-cookie']
    if (unlockedCookie === undefined) throw new Error('password unlock did not set an access cookie')
    const unlockedCookieHeader = Array.isArray(unlockedCookie) ? unlockedCookie[0] : unlockedCookie
    if (unlockedCookieHeader === undefined) throw new Error('password unlock returned an empty access-cookie header')
    expect(unlockedCookieHeader).toContain(`qlm_field_access_${slug}=`)
    const [unlockedCookieValue] = unlockedCookieHeader.split(';')
    if (unlockedCookieValue === undefined) throw new Error('access cookie is malformed')

    await request(app.getHttpServer())
      .get(`/fields/${slug}`)
      .set('Cookie', [...managerCookies, unlockedCookieValue])
      .expect(200)
  })

  it('GET /fields lists active fields newest-first with queue length + live flag', async () => {
    const a = await request(app.getHttpServer()).post('/fields').set('Cookie', managerCookies).send({ name: 'א', matchDurationSec: 300 }).expect(201)
    const b = await request(app.getHttpServer()).post('/fields').set('Cookie', managerCookies).send({ name: 'ב', matchDurationSec: 300 }).expect(201)
    const list = await request(app.getHttpServer()).get('/fields').set('Host', 'line.maple-group.info').expect(200)
    const slugs = list.body.map((row: { slug: string }) => row.slug)
    expect(slugs.indexOf(b.body.slug)).toBeLessThan(slugs.indexOf(a.body.slug))
    expect(list.body[0]).toMatchObject({ queueLength: 0, hasLiveMatch: false })
  })

  it('GET /fields/landing anonymously lists active fields for the configured center', async () => {
    const created = await request(app.getHttpServer())
      .post('/fields')
      .set('Cookie', managerCookies)
      .send({ name: 'מגרש ציבורי', matchDurationSec: 300 })
      .expect(201)

    const list = await request(app.getHttpServer()).get('/fields/landing').expect(200)

    expect(list.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: created.body.slug,
          name: 'מגרש ציבורי',
          queueLength: 0,
          hasLiveMatch: false,
        }),
      ]),
    )
  })

  it('POST /fields/lock-all expires field access so returning from the field list requires the password again', async () => {
    const lockApp = await buildApp()
    try {
      const created = await request(lockApp.getHttpServer())
        .post('/fields')
        .set('Cookie', managerCookies)
        .send({ name: 'מגרש לנעילה מחדש', matchDurationSec: 300, password: '2222' })
        .expect(201)
      const slug: string = created.body.slug

      const unlocked = await request(lockApp.getHttpServer())
        .post(`/fields/${slug}/access`)
        .set('Cookie', managerCookies)
        .send({ password: '2222' })
        .expect(201)
      const setCookie = unlocked.headers['set-cookie']
      if (setCookie === undefined) throw new Error('password unlock did not set an access cookie')
      const accessCookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie
      if (accessCookieHeader === undefined) throw new Error('password unlock returned an empty access-cookie header')
      const [accessCookie] = accessCookieHeader.split(';')
      if (accessCookie === undefined) throw new Error('access cookie is malformed')

      await request(lockApp.getHttpServer())
        .get(`/fields/${slug}`)
        .set('Cookie', [...managerCookies, accessCookie])
        .expect(200)

      const locked = await request(lockApp.getHttpServer())
        .post('/fields/lock-all')
        .set('Cookie', [accessCookie, 'qlm_field_access_abc234=fake', 'qlm_field_access_other=preserve', 'unrelated=keep'])
        .expect(200)
      expect(locked.body).toEqual({ ok: true })
      const deletedCookies = locked.headers['set-cookie']
      if (!Array.isArray(deletedCookies)) throw new Error('lock-all did not return cookie deletions')
      expect(deletedCookies).toHaveLength(2)
      expect(deletedCookies).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(`^qlm_field_access_${slug}=;`)),
          expect.stringMatching(/^qlm_field_access_abc234=;/),
        ]),
      )
      expect(deletedCookies.every((cookie: string) => cookie.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'))).toBe(true)
      expect(deletedCookies.some((cookie: string) => cookie.startsWith('qlm_field_access_other='))).toBe(false)

      await request(lockApp.getHttpServer()).get(`/fields/${slug}`).set('Cookie', managerCookies).expect(403)
    } finally {
      await lockApp.close()
    }
  })

  it('GET /fields/:slug resolves; unknown slug 404s', async () => {
    const created = await request(app.getHttpServer()).post('/fields').set('Cookie', managerCookies).send({ name: 'ג', matchDurationSec: 300 }).expect(201)
    const snap = await request(app.getHttpServer()).get(`/fields/${created.body.slug}`).set('Host', 'line.maple-group.info').expect(200)
    expect(snap.body.session.id).toBe(created.body.snapshot.session.id)
    await request(app.getHttpServer()).get('/fields/zzzzzz').set('Host', 'line.maple-group.info').expect(404)
  })

  it('POST /fields/:slug/close force-closes even with a live match, idempotently, and drops it from the list', async () => {
    const closeApp = await buildApp()
    try {
      const created = await request(closeApp.getHttpServer()).post('/fields').set('Cookie', managerCookies).send({ name: 'ד', matchDurationSec: 300 }).expect(201)
      const sessionId = created.body.snapshot.session.id
      // build a live match through the existing line + start routes
      await request(closeApp.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', managerCookies).send({ team: { newName: 'קבוצה 1' } }).expect(201)
      await request(closeApp.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', managerCookies).send({ team: { newName: 'קבוצה 2' } }).expect(201)
      await request(closeApp.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', managerCookies).send({}).expect(201)
      await request(closeApp.getHttpServer()).post(`/fields/${created.body.slug}/close`).set('Cookie', managerCookies).expect(200)
      await request(closeApp.getHttpServer()).post(`/fields/${created.body.slug}/close`).set('Cookie', managerCookies).expect(200) // idempotent
      const list = await request(closeApp.getHttpServer()).get('/fields').set('Host', 'line.maple-group.info').expect(200)
      expect(list.body.map((row: { slug: string }) => row.slug)).not.toContain(created.body.slug)
      const snap = await request(closeApp.getHttpServer()).get(`/fields/${created.body.slug}`).set('Host', 'line.maple-group.info').expect(200)
      expect(snap.body.session.status).toBe('closed')
    } finally {
      await closeApp.close()
    }
  })

  it('POST /fields retries a real slug collision against sessions_slug_unique and succeeds with a different slug (N-9)', async () => {
    const collidingApp = await buildApp()
    try {
      const first = await request(collidingApp.getHttpServer())
        .post('/fields')
        .set('Cookie', managerCookies)
        .send({ name: 'התנגשות א', matchDurationSec: 300 })
        .expect(201)
      const collidingSlug: string = first.body.slug

      // Force generateSlug()'s NEXT call to hand back the slug that's already
      // taken, so the second POST /fields genuinely collides against the real
      // DB constraint on attempt 1, then succeeds on retry with a fresh slug.
      // mockReturnValueOnce only intercepts one call; every subsequent call
      // (the retry) falls through to the real generateSlug() implementation.
      const spy = vi.spyOn(slugModule, 'generateSlug').mockReturnValueOnce(collidingSlug)
      try {
        const second = await request(collidingApp.getHttpServer())
          .post('/fields')
          .set('Cookie', managerCookies)
          .send({ name: 'התנגשות ב', matchDurationSec: 300 })
          .expect(201)
        expect(second.body.slug).toMatch(/^[a-z2-9]{6}$/)
        expect(second.body.slug).not.toBe(collidingSlug)
      } finally {
        spy.mockRestore()
      }
    } finally {
      await collidingApp.close()
    }
  })

  it('6th POST /fields within the window -> 429 (throttler)', async () => {
    const throttledApp = await buildApp()
    try {
      for (let i = 0; i < 5; i++) {
        const res = await request(throttledApp.getHttpServer())
          .post('/fields')
          .set('Cookie', managerCookies)
          .send({ name: `שדה ${i}`, matchDurationSec: 300 })
        expect(res.status).toBe(201)
      }

      const sixth = await request(throttledApp.getHttpServer())
        .post('/fields')
        .set('Cookie', managerCookies)
        .send({ name: 'שדה שישי', matchDurationSec: 300 })
      expect(sixth.status).toBe(429)
    } finally {
      await throttledApp.close()
    }
  })
})
