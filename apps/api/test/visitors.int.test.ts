/**
 * Security regression for the retired anonymous visitor flow. Visitor
 * creation now requires a real manager session, and a signed visitor token
 * cannot be used to enter or mutate the manager application.
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

const SESSION_SECRET = 'd'.repeat(32)

describe('visitors (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let centerCookie: string
  let managerCookies: string[]

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
    const [manager] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash('4444') })
      .returning()
    if (!manager) throw new Error('manager insert returned no row')

    const jwtService = makeTestJwtService(SESSION_SECRET)
    centerCookie = centerCookieHeader(jwtService, center.id)
    managerCookies = [
      centerCookie,
      sessionCookieHeader(jwtService, { staffId: manager.id, centerId: center.id, role: 'manager' }),
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

  it('rejects anonymous visitor creation and lookup', async () => {
    await request(app.getHttpServer()).post('/visitors').send({ nickname: 'אורח' }).expect(401)
    await request(app.getHttpServer()).get('/visitors/me').expect(401)
  })

  it('rejects a signed visitor token on manager routes', async () => {
    const created = await request(app.getHttpServer())
      .post('/visitors')
      .set('Cookie', managerCookies)
      .send({ nickname: 'זמני' })
      .expect(201)
    const setCookies = created.get('Set-Cookie') ?? []
    const visitorCookie = setCookies.find((value) => value.startsWith('qlm_session='))?.split(';')[0]
    if (!visitorCookie) throw new Error('visitor session cookie missing')

    await request(app.getHttpServer())
      .get('/sessions')
      .set('Cookie', [centerCookie, visitorCookie])
      .expect(401)
  })

  it('keeps visitor rows out of the staff login roster', async () => {
    const res = await request(app.getHttpServer()).get('/staff').set('Cookie', [centerCookie]).expect(200)
    expect(res.body.every((row: { role: string }) => row.role !== 'visitor')).toBe(true)
  })
})
