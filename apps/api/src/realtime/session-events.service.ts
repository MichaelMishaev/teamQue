/**
 * Single choke point for the realtime broadcast (technical-prd §5): every
 * mutating service calls `broadcast(sessionId)` after its own transaction
 * commits. Builds the snapshot via SnapshotService — never reshapes it —
 * and emits it to the session's Socket.IO room.
 *
 * The gateway hands over its live `Server` instance via `setServer()` once
 * Nest initialises it (see SessionGateway.afterInit). Before that point (or
 * in tests that instantiate this service directly) `emit` is a no-op: a
 * mutation that already committed shouldn't fail because nobody is
 * listening yet.
 */
import { Inject, Injectable } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { SOCKET_EVENTS, type SessionSnapshot } from 'shared'
import type { Server } from 'socket.io'
import { DRIZZLE, type Database } from '../db/db.module'
import { SnapshotService } from '../sessions/snapshot.service'

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`
}

@Injectable()
export class SessionEventsService {
  private server: Server | null = null

  constructor(
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  setServer(server: Server): void {
    this.server = server
  }

  /** Every mutating service calls this post-commit, which makes it the one
   * choke point for the open-fields inactivity heartbeat: touch
   * last_activity_at, THEN snapshot + emit. Touching a closed session is
   * harmless — the expiry sweep only looks at active rows. */
  async broadcast(sessionId: string): Promise<void> {
    await this.db.execute(sql`UPDATE sessions SET last_activity_at = now() WHERE id = ${sessionId}`)
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(sessionId)
    this.emitTo(sessionId, snapshot)
  }

  emitTo(sessionId: string, snapshot: SessionSnapshot): void {
    this.server?.to(sessionRoom(sessionId)).emit(SOCKET_EVENTS.snapshot, snapshot)
  }
}
