/**
 * Socket.IO '/session' namespace gateway.
 *
 * Manager-origin sockets require a valid non-visitor qlm_session. Anonymous
 * sockets are accepted only from the exact configured public-line origin and
 * must request a valid field slug; that branch is snapshot-only.
 *
 * Authentication stays inside handleConnection so rejected clients receive
 * the native disconnect event expected by the web client.
 */
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { and, eq } from 'drizzle-orm'
import { SOCKET_EVENTS } from 'shared'
import type { Server, Socket } from 'socket.io'
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionTokenPayload } from '../auth/token'
import { DRIZZLE, type Database } from '../db/db.module'
import { sessions } from '../db/schema'
import { SnapshotService } from '../sessions/snapshot.service'
import { parseCookie } from './parse-cookie'
import { SessionEventsService, sessionRoom } from './session-events.service'

const HELLO_EVENT = 'session:hello'

@Injectable()
@WebSocketGateway({
  namespace: '/session',
  cors: {
    origin: (origin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) => {
      const publicOrigin = process.env.PUBLIC_LINE_HOST ? `https://${process.env.PUBLIC_LINE_HOST}` : null
      const allowed = origin === undefined || origin === process.env.WEB_ORIGIN || origin === publicOrigin
      callback(allowed ? null : new Error('origin not allowed'), allowed)
    },
    credentials: true,
  },
})
export class SessionGateway implements OnGatewayInit, OnGatewayConnection {
  @WebSocketServer() private readonly server!: Server

  constructor(
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
    @Inject(SessionEventsService) private readonly sessionEvents: SessionEventsService,
  ) {}

  afterInit(): void {
    this.sessionEvents.setServer(this.server)
  }

  async handleConnection(client: Socket): Promise<void> {
    const requestedSlug = firstQueryValue(client.handshake.query['slug'])

    if (this.isPublicLineOrigin(client)) {
      const publicSessionId = requestedSlug ? await this.findSessionIdBySlug(requestedSlug) : null
      if (!publicSessionId) {
        client.disconnect(true)
        return
      }
      await this.joinAndEmitSnapshot(client, publicSessionId)
      return
    }

    const token = parseCookie(client.handshake.headers.cookie, SESSION_COOKIE_NAME)
    if (!token) {
      client.disconnect(true)
      return
    }

    let payload: SessionTokenPayload
    try {
      payload = verifySessionToken(this.jwtService, token)
    } catch {
      client.disconnect(true)
      return
    }
    if (!payload.staffId || payload.role === 'visitor') {
      client.disconnect(true)
      return
    }

    const sessionId = requestedSlug
      ? await this.findSessionIdBySlug(requestedSlug, payload.centerId)
      : await this.findActiveSessionId(payload.centerId)
    client.emit(HELLO_EVENT, { serverNow: new Date().toISOString() })
    if (!sessionId) return

    await client.join(sessionRoom(sessionId))
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(sessionId)
    client.emit(SOCKET_EVENTS.snapshot, snapshot)
  }

  private isPublicLineOrigin(client: Socket): boolean {
    const publicLineHost = process.env.PUBLIC_LINE_HOST
    return Boolean(publicLineHost && client.handshake.headers.origin === `https://${publicLineHost}`)
  }

  private async joinAndEmitSnapshot(client: Socket, sessionId: string): Promise<void> {
    client.emit(HELLO_EVENT, { serverNow: new Date().toISOString() })
    await client.join(sessionRoom(sessionId))
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(sessionId)
    client.emit(SOCKET_EVENTS.snapshot, snapshot)
  }

  private async findActiveSessionId(centerId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.centerId, centerId), eq(sessions.status, 'active')))
      .limit(1)
    return row?.id ?? null
  }

  private async findSessionIdBySlug(slug: string, centerId?: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(centerId ? and(eq(sessions.slug, slug), eq(sessions.centerId, centerId)) : eq(sessions.slug, slug))
      .limit(1)
    return row?.id ?? null
  }
}

function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
