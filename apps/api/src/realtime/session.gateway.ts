/**
 * Socket.IO '/session' namespace gateway (technical-prd §5).
 *
 * Auth mechanism — MANDATORY: authentication happens INSIDE
 * handleConnection, not via `io.use()` middleware. The web client
 * (apps/web/src/lib/socket.ts) has no `connect_error` listener; a
 * handshake-level middleware rejection emits `connect_error`, which the
 * client silently ignores and the UI hangs forever. Accepting the
 * transport and calling `client.disconnect(true)` from inside
 * handleConnection instead DOES fire the client's native `disconnect`
 * handler. Only the `qlm_session` cookie is checked (not `qlm_center`) —
 * `SessionTokenPayload` already embeds `centerId`, a deliberate
 * simplification versus the HTTP StaffSessionGuard's dual-cookie check.
 */
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { OnGatewayConnection, OnGatewayInit, WebSocketGateway, WebSocketServer } from '@nestjs/websockets'
import { SOCKET_EVENTS } from 'shared'
import { and, eq } from 'drizzle-orm'
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
    // Read WEB_ORIGIN lazily, inside the function Socket.IO invokes per
    // handshake — NOT at decorator-evaluation time (module import time).
    // Reading it eagerly here would run before tests (and, in principle,
    // any lazy env setup) have a chance to set it, mirroring why
    // AuthModule's JwtModule uses registerAsync's factory instead of a
    // static secret.
    origin: (_origin: string | undefined, callback: (err: Error | null, origin?: string | boolean) => void) => {
      callback(null, process.env.WEB_ORIGIN ?? false)
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

    client.emit(HELLO_EVENT, { serverNow: new Date().toISOString() })

    const activeSessionId = await this.findActiveSessionId(payload.centerId)
    if (!activeSessionId) return

    await client.join(sessionRoom(activeSessionId))
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(activeSessionId)
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
}
