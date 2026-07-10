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
import { SOCKET_EVENTS, type SessionSnapshot } from 'shared'
import type { Server } from 'socket.io'
import { SnapshotService } from '../sessions/snapshot.service'

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`
}

@Injectable()
export class SessionEventsService {
  private server: Server | null = null

  constructor(@Inject(SnapshotService) private readonly snapshotService: SnapshotService) {}

  setServer(server: Server): void {
    this.server = server
  }

  async broadcast(sessionId: string): Promise<void> {
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(sessionId)
    this.emitTo(sessionId, snapshot)
  }

  emitTo(sessionId: string, snapshot: SessionSnapshot): void {
    this.server?.to(sessionRoom(sessionId)).emit(SOCKET_EVENTS.snapshot, snapshot)
  }
}
