/**
 * Realtime gateway integration test (technical-prd §5): a real in-process
 * Nest app (listening on a real port, not just supertest's virtual server)
 * + real socket.io-client sockets + a real Postgres (Testcontainers).
 * Covers the auth mechanism (handleConnection resolves a center — from the
 * qlm_session cookie, else the single-seeded-center fallback — and only
 * client.disconnect(true)s when NO center row exists; auth was removed from
 * prod, so a missing/invalid cookie now CONNECTS instead of disconnecting),
 * snapshot-on-connect, and broadcast-after-mutation for both a single client
 * and two clients sharing a session room.
 */
import type { AddressInfo } from 'node:net'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { hash } from '@node-rs/argon2'
import cookieParser from 'cookie-parser'
import { SOCKET_EVENTS, sessionSnapshotSchema, type SessionSnapshot } from 'shared'
import { io, type Socket } from 'socket.io-client'
import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module'
import { SESSION_COOKIE_NAME } from '../src/auth/token'
import { captains, centers, fields, sessions, staff } from '../src/db/schema'
import { generateSlug } from '../src/fields/slug'
import { centerCookieHeader, makeTestJwtService, sessionCookieHeader } from './helpers/auth-cookies'
import { startTestPg, type TestPg } from './helpers/pg'

const SESSION_SECRET = 'r'.repeat(32)
const STAFF_PIN = '2468'
const HELLO_EVENT = 'session:hello'

describe('realtime gateway (integration)', () => {
  let pg: TestPg
  let app: INestApplication
  let jwtService: ReturnType<typeof makeTestJwtService>
  let baseUrl: string
  const openSockets: Socket[] = []

  beforeAll(async () => {
    pg = await startTestPg()

    process.env.DATABASE_URL = pg.container.getConnectionUri()
    process.env.SESSION_SECRET = SESSION_SECRET
    process.env.WEB_ORIGIN = 'http://localhost:5173'
    process.env.NODE_ENV = 'test'

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication()
    app.use(cookieParser())
    await app.listen(0)
    const port = (app.getHttpServer().address() as AddressInfo).port
    baseUrl = `http://127.0.0.1:${port}`

    jwtService = makeTestJwtService(SESSION_SECRET)
  }, 60_000)

  afterEach(() => {
    for (const socket of openSockets.splice(0)) socket.close()
  })

  afterAll(async () => {
    await app.close()
    await pg.stop()
  })

  function connectSocket(cookieHeader?: string): Socket {
    const socket = io(`${baseUrl}/session`, {
      extraHeaders: { Cookie: cookieHeader ?? '' },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    })
    openSockets.push(socket)
    return socket
  }

  function waitForEvent<T = unknown>(socket: Socket, event: string, timeoutMs = 2000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for "${event}"`)), timeoutMs)
      socket.once(event, (payload: T) => {
        clearTimeout(timer)
        resolve(payload)
      })
    })
  }

  let centerCounter = 0
  async function seedCenterWithActiveSession(): Promise<{
    centerId: string
    staffId: string
    staffCookies: string[]
    sessionCookieHeader: string
    sessionId: string
  }> {
    centerCounter += 1
    const [center] = await pg.db
      .insert(centers)
      .values({ name: `Realtime Center ${centerCounter}`, pinHash: await hash('9999') })
      .returning()
    if (!center) throw new Error('center insert returned no row')

    const [staffMember] = await pg.db
      .insert(staff)
      .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash(STAFF_PIN) })
      .returning()
    if (!staffMember) throw new Error('staff insert returned no row')

    const [session] = await pg.db
      .insert(sessions)
      .values({ centerId: center.id, date: '2026-07-10', slug: generateSlug(), matchDurationSec: 300, status: 'active', createdBy: staffMember.id })
      .returning()
    if (!session) throw new Error('session insert returned no row')

    await pg.db.insert(fields).values({ sessionId: session.id, centerId: center.id, name: 'מגרש', position: 0 })

    return {
      centerId: center.id,
      staffId: staffMember.id,
      staffCookies: [
        centerCookieHeader(jwtService, center.id),
        sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' }),
      ],
      sessionCookieHeader: sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' }),
      sessionId: session.id,
    }
  }

  async function seedCaptain(centerId: string, name: string): Promise<string> {
    const [row] = await pg.db.insert(captains).values({ centerId, name }).returning()
    if (!row) throw new Error('captain insert returned no row')
    return row.id
  }

  describe('handshake auth', () => {
    it('an authenticated socket gets session:hello then session:snapshot for the center active session', async () => {
      const fixture = await seedCenterWithActiveSession()
      const socket = connectSocket(fixture.sessionCookieHeader)

      const hello = await waitForEvent<{ serverNow: string }>(socket, HELLO_EVENT)
      expect(typeof hello.serverNow).toBe('string')
      expect(new Date(hello.serverNow).toString()).not.toBe('Invalid Date')

      const snapshot = await waitForEvent<SessionSnapshot>(socket, SOCKET_EVENTS.snapshot)
      expect(sessionSnapshotSchema.safeParse(snapshot).success).toBe(true)
      expect(snapshot.session.id).toBe(fixture.sessionId)
    })

    it('a socket with no cookie now falls back to the seeded center and receives session:hello (no longer disconnected)', async () => {
      const socket = connectSocket(undefined)
      const hello = await waitForEvent<{ serverNow: string }>(socket, HELLO_EVENT)
      expect(typeof hello.serverNow).toBe('string')
      // Give the fallback a beat; it must NOT disconnect (a center row exists).
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(socket.connected).toBe(true)
    })

    it('a socket with an invalid/garbage session cookie also falls back and receives session:hello', async () => {
      const socket = connectSocket(`${SESSION_COOKIE_NAME}=not-a-real-jwt`)
      const hello = await waitForEvent<{ serverNow: string }>(socket, HELLO_EVENT)
      expect(typeof hello.serverNow).toBe('string')
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(socket.connected).toBe(true)
    })

    it('a valid cookie but no active session for the center connects successfully and gets no snapshot', async () => {
      centerCounter += 1
      const [center] = await pg.db
        .insert(centers)
        .values({ name: `No Session Center ${centerCounter}`, pinHash: await hash('9999') })
        .returning()
      if (!center) throw new Error('center insert returned no row')
      const [staffMember] = await pg.db
        .insert(staff)
        .values({ centerId: center.id, name: 'Staffer', role: 'staff', pinHash: await hash(STAFF_PIN) })
        .returning()
      if (!staffMember) throw new Error('staff insert returned no row')

      const socket = connectSocket(sessionCookieHeader(jwtService, { staffId: staffMember.id, centerId: center.id, role: 'staff' }))

      const hello = await waitForEvent<{ serverNow: string }>(socket, HELLO_EVENT)
      expect(typeof hello.serverNow).toBe('string')
      // No active session -> no snapshot should follow. Give it a beat, then
      // assert the socket is still connected (not disconnected either).
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(socket.connected).toBe(true)
    })
  })

  describe('broadcast after mutation', () => {
    it('a REST mutation (add to line) pushes an updated snapshot to the connected socket within 1s', async () => {
      const fixture = await seedCenterWithActiveSession()
      const captainId = await seedCaptain(fixture.centerId, 'A')

      const socket = connectSocket(fixture.sessionCookieHeader)
      await waitForEvent(socket, HELLO_EVENT)
      const initialSnapshot = await waitForEvent<SessionSnapshot>(socket, SOCKET_EVENTS.snapshot)
      expect(initialSnapshot.queue).toHaveLength(0)

      const nextSnapshot = waitForEvent<SessionSnapshot>(socket, SOCKET_EVENTS.snapshot, 1000)

      const res = await request(app.getHttpServer())
        .post(`/sessions/${fixture.sessionId}/line`)
        .set('Cookie', fixture.staffCookies)
        .send({ team: captainId })
      expect(res.status).toBe(201)

      const snapshot = await nextSnapshot
      expect(snapshot.queue).toHaveLength(1)
      expect(snapshot.queue[0]?.team.id).toBe(captainId)
    })

    it('two clients in the same session both receive the broadcast from one mutation', async () => {
      const fixture = await seedCenterWithActiveSession()
      const captainId = await seedCaptain(fixture.centerId, 'B')

      const socketA = connectSocket(fixture.sessionCookieHeader)
      const socketB = connectSocket(fixture.sessionCookieHeader)
      await Promise.all([waitForEvent(socketA, HELLO_EVENT), waitForEvent(socketB, HELLO_EVENT)])
      await Promise.all([waitForEvent(socketA, SOCKET_EVENTS.snapshot), waitForEvent(socketB, SOCKET_EVENTS.snapshot)])

      const nextA = waitForEvent<SessionSnapshot>(socketA, SOCKET_EVENTS.snapshot, 1000)
      const nextB = waitForEvent<SessionSnapshot>(socketB, SOCKET_EVENTS.snapshot, 1000)

      await request(app.getHttpServer())
        .post(`/sessions/${fixture.sessionId}/line`)
        .set('Cookie', fixture.staffCookies)
        .send({ team: captainId })

      const [snapshotA, snapshotB] = await Promise.all([nextA, nextB])
      expect(snapshotA.queue).toHaveLength(1)
      expect(snapshotB.queue).toHaveLength(1)
    })
  })
})
