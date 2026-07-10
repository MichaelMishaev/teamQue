/**
 * Unit test: SessionEventsService is the single choke point every mutation
 * calls to broadcast a fresh snapshot (technical-prd §5). It must build the
 * snapshot via SnapshotService (never reshape it) and emit it to the
 * session's room. Before a gateway has attached a Socket.IO server (e.g. in
 * tests that construct the service directly), emitting is a no-op rather
 * than a throw — broadcasting is a side effect of a mutation that already
 * succeeded, not something that should be able to fail it.
 */
import { SOCKET_EVENTS, type SessionSnapshot } from 'shared'
import { describe, expect, it, vi } from 'vitest'
import type { SnapshotService } from '../sessions/snapshot.service'
import { SessionEventsService } from './session-events.service'

const sessionId = '22222222-2222-4222-8222-222222222222'

function fakeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: { id: sessionId, date: '2026-07-10', location: null, matchDurationSec: 300, status: 'active' },
    fields: [],
    queue: [],
    emittedAt: '2026-07-10T17:00:00.000Z',
    serverNow: '2026-07-10T17:00:00.000Z',
    ...overrides,
  }
}

describe('SessionEventsService', () => {
  it('broadcast() builds the snapshot via SnapshotService and emits it to the session room', async () => {
    const snapshot = fakeSnapshot()
    const buildSnapshotBySessionId = vi.fn().mockResolvedValue(snapshot)
    const snapshotService = { buildSnapshotBySessionId } as unknown as SnapshotService
    const service = new SessionEventsService(snapshotService)

    const emit = vi.fn()
    const to = vi.fn().mockReturnValue({ emit })
    service.setServer({ to } as never)

    await service.broadcast(sessionId)

    expect(buildSnapshotBySessionId).toHaveBeenCalledWith(sessionId)
    expect(to).toHaveBeenCalledWith(`session:${sessionId}`)
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.snapshot, snapshot)
  })

  it('broadcast() with no server attached does not throw (best-effort side effect)', async () => {
    const snapshotService = { buildSnapshotBySessionId: vi.fn().mockResolvedValue(fakeSnapshot()) } as unknown as SnapshotService
    const service = new SessionEventsService(snapshotService)

    await expect(service.broadcast(sessionId)).resolves.toBeUndefined()
  })

  it('emitTo() emits a given snapshot directly without rebuilding it', () => {
    const snapshotService = { buildSnapshotBySessionId: vi.fn() } as unknown as SnapshotService
    const service = new SessionEventsService(snapshotService)

    const emit = vi.fn()
    const to = vi.fn().mockReturnValue({ emit })
    service.setServer({ to } as never)

    const snapshot = fakeSnapshot()
    service.emitTo(sessionId, snapshot)

    expect(snapshotService.buildSnapshotBySessionId).not.toHaveBeenCalled()
    expect(to).toHaveBeenCalledWith(`session:${sessionId}`)
    expect(emit).toHaveBeenCalledWith(SOCKET_EVENTS.snapshot, snapshot)
  })
})
