/**
 * Concurrency tests (N-9): the line-domain's race-safety guarantees against
 * a REAL Postgres (Testcontainers), fired with genuine parallel requests
 * (Promise.all), not sequential awaits. Each scenario runs 3x with fresh
 * state to catch flakiness, not just a lucky single pass.
 */
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { and, asc, eq, inArray } from 'drizzle-orm'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { captains, centers, fields, matches, queueEntries, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'i'.repeat(32)
const REPEATS = 3

describe('concurrency (integration, N-9)', () => {
  let pg: TestPg
  let app: INestApplication
  let jwtService: ReturnType<typeof makeTestJwtService>

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
  }, 60_000)

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  let centerCounter = 0
  async function seedFixture(): Promise<{
    centerId: string
    staffId: string
    staffCookies: string[]
    managerCookies: string[]
    sessionId: string
    fieldId: string
  }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Concurrency Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash('4321') })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const [managerMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Manager', role: 'manager', pinHash: await hash('5678') })
      .returning()
    if (!managerMember) throw new Error('staff insert returned no row')

    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId: center.id, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: managerMember.id })
      .returning()
    if (!session) throw new Error('session insert returned no row')

    const [field] = await pg.db.insert(fields).values({ sessionId: session.id, centerId: center.id, name: 'מגרש', position: 0 }).returning()
    if (!field) throw new Error('field insert returned no row')

    const centerCookie = centerCookieHeader(jwtService, center.id)
    return {
      centerId: center.id,
      staffId: staffMember.id,
      staffCookies: [centerCookie, sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' })],
      managerCookies: [centerCookie, sessionCookieHeader(jwtService, { staffId: managerMember.id, centerId: center.id, role: 'manager' })],
      sessionId: session.id,
      fieldId: field.id,
    }
  }

  async function seedCaptain(centerId: string, name: string): Promise<string> {
    const [row] = await pg.db.insert(captains).values({ centerId, name }).returning()
    if (!row) throw new Error('captain insert returned no row')
    return row.id
  }

  async function seedEntry(sessionId: string, centerId: string, captainId: string, position: number): Promise<string> {
    const [row] = await pg.db.insert(queueEntries).values({ sessionId, centerId, captainId, position, createdAt: new Date() }).returning()
    if (!row) throw new Error('queue entry insert returned no row')
    return row.id
  }

  async function liveMatchCount(fieldId: string): Promise<number> {
    const rows = await pg.db.select({ id: matches.id }).from(matches).where(and(eq(matches.fieldId, fieldId), inArray(matches.status, ['live', 'paused'])))
    return rows.length
  }

  it('1. 8x parallel POST /start on a 2-entry line -> exactly one match created, never two live on the field', async () => {
    for (let i = 0; i < REPEATS; i++) {
      const { centerId, staffCookies, sessionId, fieldId } = await seedFixture()
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      await seedEntry(sessionId, centerId, a, 1)
      await seedEntry(sessionId, centerId, b, 2)

      const responses = await Promise.all(
        Array.from({ length: 8 }, () => request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({})),
      )

      const succeeded = responses.filter((r) => r.status === 201)
      const failed = responses.filter((r) => r.status !== 201)
      expect(succeeded).toHaveLength(1)
      for (const r of failed) expect(['LINE_TOO_SHORT', 'FIELD_OCCUPIED']).toContain(r.body.code)

      expect(await liveMatchCount(fieldId)).toBe(1)
      const remainingEntries = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      expect(remainingEntries).toHaveLength(0)
    }
  })

  it('2. two parallel starts with overlapping entryIds -> at most one wins, no entry double-consumed', async () => {
    for (let i = 0; i < REPEATS; i++) {
      const { centerId, staffCookies, sessionId, fieldId } = await seedFixture()
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const c = await seedCaptain(centerId, 'C')
      const entryA = await seedEntry(sessionId, centerId, a, 1)
      const entryB = await seedEntry(sessionId, centerId, b, 2)
      const entryC = await seedEntry(sessionId, centerId, c, 3)

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({ entryIds: [entryA, entryB] }),
        request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({ entryIds: [entryB, entryC] }),
      ])

      const statuses = [res1.status, res2.status].sort()
      expect(statuses[0]).toBeLessThanOrEqual(409)
      const succeeded = [res1, res2].filter((r) => r.status === 201)
      expect(succeeded.length).toBeLessThanOrEqual(1)
      expect(await liveMatchCount(fieldId)).toBeLessThanOrEqual(1)

      // entryB (the overlap) belongs to at most one match: it's either
      // still in the line (both failed) or consumed by exactly one winner.
      const [liveMatch] = await pg.db.select().from(matches).where(and(eq(matches.fieldId, fieldId), inArray(matches.status, ['live', 'paused'])))
      const stillQueued = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
      if (liveMatch) {
        const playing = [liveMatch.captainAId, liveMatch.captainBId]
        expect(playing).toContain(b)
        // Whichever pair won, the entry ids for the OTHER pair's non-shared
        // captain must not also be "playing" — captain-distinctness plus
        // the field's one-live-match index already guarantee this; assert
        // the queued leftover is consistent (never both A and C remain
        // alongside a live match that already paired one of them with B).
        expect(stillQueued.length).toBeLessThanOrEqual(1)
      } else {
        expect(stillQueued).toHaveLength(3)
      }
    }
  })

  it('3. close + start race (N=4 mixed) -> never a closed session with a live match', async () => {
    for (let i = 0; i < REPEATS; i++) {
      const { centerId, staffCookies, managerCookies, sessionId, fieldId } = await seedFixture()
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      await seedEntry(sessionId, centerId, a, 1)
      await seedEntry(sessionId, centerId, b, 2)

      // close is manager-only (@Roles('manager')); start has no role gate.
      const responses = await Promise.all([
        request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies),
        request(app.getHttpServer()).post(`/sessions/${sessionId}/close`).set('Cookie', managerCookies),
        request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({}),
        request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({}),
      ])

      const acceptableCodes = ['SESSION_CLOSED', 'SESSION_HAS_LIVE_MATCH', 'LINE_TOO_SHORT', 'FIELD_OCCUPIED']
      for (const r of responses) {
        expect([200, 201].includes(r.status) || acceptableCodes.includes(r.body.code)).toBe(true)
      }

      const [session] = await pg.db.select().from(sessions).where(eq(sessions.id, sessionId))
      const liveCount = await liveMatchCount(fieldId)
      if (session?.status === 'closed') expect(liveCount).toBe(0)
    }
  })

  it('4. reorder + remove race -> gapless positions 1..n, consistent final state', async () => {
    for (let i = 0; i < REPEATS; i++) {
      const { centerId, staffCookies, sessionId } = await seedFixture()
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const c = await seedCaptain(centerId, 'C')
      const entryA = await seedEntry(sessionId, centerId, a, 1)
      const entryB = await seedEntry(sessionId, centerId, b, 2)
      const entryC = await seedEntry(sessionId, centerId, c, 3)

      await Promise.all([
        request(app.getHttpServer()).patch(`/sessions/${sessionId}/line`).set('Cookie', staffCookies).send({ entryIds: [entryC, entryB, entryA] }),
        request(app.getHttpServer()).delete(`/line/${entryB}`).set('Cookie', staffCookies),
      ])

      const remaining = await pg.db.select().from(queueEntries).where(eq(queueEntries.sessionId, sessionId)).orderBy(asc(queueEntries.position))
      const positions = remaining.map((r) => r.position)
      expect(positions).toEqual(Array.from({ length: remaining.length }, (_, idx) => idx + 1))
      expect(new Set(positions).size).toBe(positions.length)
      expect(remaining.map((r) => r.id)).not.toContain(entryB)
      expect(remaining.map((r) => r.id).sort()).toEqual([entryA, entryC].sort())
    }
  })

  it('5. finish + undo vs a concurrent start on the field -> never two live matches', async () => {
    for (let i = 0; i < REPEATS; i++) {
      const { centerId, staffCookies, sessionId, fieldId } = await seedFixture()
      const a = await seedCaptain(centerId, 'A')
      const b = await seedCaptain(centerId, 'B')
      const c = await seedCaptain(centerId, 'C')
      const d = await seedCaptain(centerId, 'D')
      const [liveMatch] = await pg.db
        .insert(matches)
        .values({ sessionId, centerId, fieldId, captainAId: a, captainBId: b, status: 'live', plannedDurationSec: 300, startedAt: new Date() })
        .returning()
      if (!liveMatch) throw new Error('match insert returned no row')
      await seedEntry(sessionId, centerId, c, 1)
      await seedEntry(sessionId, centerId, d, 2)

      const finished = await request(app.getHttpServer()).post(`/matches/${liveMatch.id}/finish`).set('Cookie', staffCookies)
      expect(finished.status).toBe(201)

      const [undoRes, startRes] = await Promise.all([
        request(app.getHttpServer()).post(`/actions/${finished.body.activityId}/undo`).set('Cookie', staffCookies),
        request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({}),
      ])

      for (const r of [undoRes, startRes]) {
        if (![200, 201].includes(r.status)) expect(['UNDO_EXPIRED', 'FIELD_OCCUPIED']).toContain(r.body.code)
      }
      expect(await liveMatchCount(fieldId)).toBeLessThanOrEqual(1)
    }
  })
})
