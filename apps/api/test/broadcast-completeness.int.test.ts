/**
 * Broadcast completeness (technical-prd §5): every mutating endpoint —
 * line add/reorder/move/remove, match kickoff/pause/resume/extend/finish/
 * replay, session open/update/close, undo — must call
 * SessionEventsService.broadcast(sessionId) after its transaction commits.
 * Spies on the real instance from the app's DI container (no gateway/socket
 * needed for this) rather than rebuilding each scenario as a live-socket
 * test — the realtime.int.test.ts file already proves the socket delivery
 * path end-to-end for a representative subset.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppModule } from '../src/app.module'
import { captains, centers, fields, matches, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { SessionEventsService } from '../src/realtime/session-events.service'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'q'.repeat(32)

describe('broadcast completeness (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let jwtService: ReturnType<typeof makeTestJwtService>
  let sessionEvents: SessionEventsService
  let broadcastSpy: ReturnType<typeof spyOnBroadcast>

  function spyOnBroadcast() {
    return vi.spyOn(sessionEvents, 'broadcast').mockResolvedValue(undefined)
  }

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

    jwtService = makeTestJwtService(SESSION_SECRET)
    sessionEvents = app.get(SessionEventsService)
  }, 60_000)

  beforeEach(() => {
    broadcastSpy = spyOnBroadcast()
  })

  afterEach(() => {
    broadcastSpy.mockRestore()
  })

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  let centerCounter = 0
  async function seedCenter(): Promise<{
    centerId: string
    staffId: string
    staffCookies: string[]
    managerCookies: string[]
  }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Broadcast Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash('1111') })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const [managerMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash('2222') })
      .returning()
    if (!managerMember) throw new Error('staff insert returned no row')

    const centerCookie = centerCookieHeader(jwtService, center.id)
    return {
      centerId: center.id,
      staffId: staffMember.id,
      staffCookies: [centerCookie, sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' })],
      managerCookies: [centerCookie, sessionCookieHeader(jwtService, { staffId: managerMember.id, centerId: center.id, role: 'manager' })],
    }
  }

  async function seedActiveSession(centerId: string, staffId: string): Promise<{ sessionId: string; fieldId: string }> {
    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: staffId })
      .returning()
    if (!session) throw new Error('session insert returned no row')
    const [field] = await pg.db.insert(fields).values({ sessionId: session.id, centerId, name: 'מגרש', position: 0 }).returning()
    if (!field) throw new Error('field insert returned no row')
    return { sessionId: session.id, fieldId: field.id }
  }

  async function seedCaptain(centerId: string, name: string): Promise<string> {
    const [row] = await pg.db.insert(captains).values({ centerId, name }).returning()
    if (!row) throw new Error('captain insert returned no row')
    return row.id
  }

  it('session.open broadcasts the newly opened session', async () => {
    const { managerCookies } = await seedCenter()

    const res = await request(app.getHttpServer())
      .post('/sessions')
      .set('Cookie', managerCookies)
      .send({ matchDurationSec: 300 })

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(res.body.id)
  })

  it('session.update broadcasts the session', async () => {
    const { centerId, staffId, managerCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).patch(`/sessions/${sessionId}`).set('Cookie', managerCookies).send({ location: 'New spot' })

    expect(res.status).toBe(200)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('session.close broadcasts the session', async () => {
    const { centerId, staffId, managerCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('line.add broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    const captainId = await seedCaptain(centerId, 'A')
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: captainId })

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('line.reorder broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    const a = await seedCaptain(centerId, 'A')
    const b = await seedCaptain(centerId, 'B')
    const entryA = (await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })).body.id
    const entryB = (await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: b })).body.id
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer())
      .patch(`/sessions/${sessionId}/line`)
      .set('Cookie', staffCookies)
      .send({ entryIds: [entryB, entryA] })

    expect(res.status).toBe(200)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('line.move (move-top) broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    const a = await seedCaptain(centerId, 'A')
    const b = await seedCaptain(centerId, 'B')
    await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })
    const entryB = (await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: b })).body.id
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/line/${entryB}/move-top`).set('Cookie', staffCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('line.removed broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    const a = await seedCaptain(centerId, 'A')
    const entryA = (await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })).body.id
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).delete(`/line/${entryA}`).set('Cookie', staffCookies)

    expect(res.status).toBe(200)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('match.start (kickoff) broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    const a = await seedCaptain(centerId, 'A')
    const b = await seedCaptain(centerId, 'B')
    await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })
    await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: b })
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({})

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  async function seedLiveMatch(centerId: string, sessionId: string, fieldId: string, overrides: Partial<typeof matches.$inferInsert> = {}): Promise<string> {
    const a = await seedCaptain(centerId, 'A')
    const b = await seedCaptain(centerId, 'B')
    const [row] = await pg.db
      .insert(matches)
      .values({ sessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'live', plannedDurationSec: 300, startedAt: new Date(), ...overrides })
      .returning()
    if (!row) throw new Error('match insert returned no row')
    return row.id
  }

  it('match.pause broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId, fieldId } = await seedActiveSession(centerId, staffId)
    const matchId = await seedLiveMatch(centerId, sessionId, fieldId)
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/matches/${matchId}/pause`).set('Cookie', staffCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('match.resume broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId, fieldId } = await seedActiveSession(centerId, staffId)
    const matchId = await seedLiveMatch(centerId, sessionId, fieldId, { status: 'paused', pausedAt: new Date() })
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/matches/${matchId}/resume`).set('Cookie', staffCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('match.extend broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId, fieldId } = await seedActiveSession(centerId, staffId)
    const matchId = await seedLiveMatch(centerId, sessionId, fieldId)
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/matches/${matchId}/extend`).set('Cookie', staffCookies).send({ addSec: 60 })

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('match.finish broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId, fieldId } = await seedActiveSession(centerId, staffId)
    const matchId = await seedLiveMatch(centerId, sessionId, fieldId)
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/matches/${matchId}/finish`).set('Cookie', staffCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('match.replay broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId, fieldId } = await seedActiveSession(centerId, staffId)
    const matchId = await seedLiveMatch(centerId, sessionId, fieldId, { status: 'finished', endedAt: new Date(), endReason: 'manual' })
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/matches/${matchId}/replay`).set('Cookie', staffCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })

  it('undo (of line.removed) broadcasts the session', async () => {
    const { centerId, staffId, staffCookies } = await seedCenter()
    const { sessionId } = await seedActiveSession(centerId, staffId)
    const a = await seedCaptain(centerId, 'A')
    const entryA = (await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ team: a })).body.id
    const removeRes = await request(app.getHttpServer()).delete(`/line/${entryA}`).set('Cookie', staffCookies)
    broadcastSpy.mockClear()

    const res = await request(app.getHttpServer()).post(`/actions/${removeRes.body.activityId}/undo`).set('Cookie', staffCookies)

    expect(res.status).toBe(201)
    expect(broadcastSpy).toHaveBeenCalledWith(sessionId)
  })
})
