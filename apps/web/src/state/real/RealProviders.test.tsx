import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from 'shared'
import { apiGet, ApiRequestError } from '@/lib/api'
import { createSessionSocket, type CreateSessionSocketOptions } from '@/lib/socket'
import { useSnapshot } from '@/state/SnapshotContext'
import { useStaffDirectory } from '@/state/StaffDirectoryContext'
import { RealProviders } from './RealProviders'

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>()
  return { ...actual, apiGet: vi.fn(), apiPost: vi.fn() }
})

vi.mock('@/lib/socket', () => ({
  createSessionSocket: vi.fn(),
}))

function snapshot(sessionId: string): SessionSnapshot {
  return {
    session: { id: sessionId, slug: 'abc234', date: '2026-07-10', location: null, matchDurationSec: 360, status: 'active' },
    fields: [],
    queue: [],
    emittedAt: '2026-07-10T18:00:00.000Z',
    serverNow: '2026-07-10T18:00:00.000Z',
  }
}

function Probe() {
  const { snapshot: snap, connection } = useSnapshot()
  const { roster } = useStaffDirectory()
  return (
    <div>
      <span data-testid="connection">{connection}</span>
      <span data-testid="session-id">{snap?.session.id ?? 'none'}</span>
      <span data-testid="roster-count">{roster.length}</span>
    </div>
  )
}

let socketOpts: CreateSessionSocketOptions | undefined
let disconnectSocket: ReturnType<typeof vi.fn>

function mockApiGet(bySessionActive: () => Promise<unknown>): void {
  vi.mocked(apiGet).mockImplementation((path: string) => {
    if (path === '/sessions/active') return bySessionActive()
    if (path === '/staff') return Promise.resolve([{ id: 'staff-1', name: 'שרה', role: 'manager' }])
    return Promise.reject(new Error(`unexpected apiGet path: ${path}`))
  })
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset()
  socketOpts = undefined
  disconnectSocket = vi.fn()
  vi.mocked(createSessionSocket).mockReset().mockImplementation((opts) => {
    socketOpts = opts
    return { disconnect: disconnectSocket }
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RealProviders', () => {
  it('populates SnapshotContext from the initial GET /sessions/active fetch', async () => {
    mockApiGet(() => Promise.resolve(snapshot('s1')))
    render(
      <RealProviders>
        <Probe />
      </RealProviders>,
    )
    await waitFor(() => expect(screen.getByTestId('session-id').textContent).toBe('s1'))
  })

  it('a 404 from GET /sessions/active resolves to no active session', async () => {
    mockApiGet(() => Promise.reject(new ApiRequestError('NOT_FOUND', 'no active session')))
    render(
      <RealProviders>
        <Probe />
      </RealProviders>,
    )
    await waitFor(() => expect(vi.mocked(apiGet)).toHaveBeenCalledWith('/sessions/active'))
    expect(screen.getByTestId('session-id').textContent).toBe('none')
  })

  it('a socket snapshot event replaces the snapshot', async () => {
    mockApiGet(() => Promise.reject(new ApiRequestError('NOT_FOUND', 'no active session')))
    render(
      <RealProviders>
        <Probe />
      </RealProviders>,
    )
    await waitFor(() => expect(socketOpts).toBeDefined())

    act(() => {
      socketOpts?.onSnapshot(snapshot('s2'))
    })

    await waitFor(() => expect(screen.getByTestId('session-id').textContent).toBe('s2'))
  })

  it('onDisconnect flips connection to offline', async () => {
    mockApiGet(() => Promise.reject(new ApiRequestError('NOT_FOUND', 'no active session')))
    render(
      <RealProviders>
        <Probe />
      </RealProviders>,
    )
    await waitFor(() => expect(socketOpts).toBeDefined())

    act(() => socketOpts?.onConnect('2026-07-10T18:00:00.000Z'))
    await waitFor(() => expect(screen.getByTestId('connection').textContent).toBe('online'))

    act(() => socketOpts?.onDisconnect())
    expect(screen.getByTestId('connection').textContent).toBe('offline')
  })

  it('a reconnect flashes "resynced" before settling back to "online"', async () => {
    mockApiGet(() => Promise.reject(new ApiRequestError('NOT_FOUND', 'no active session')))
    render(
      <RealProviders>
        <Probe />
      </RealProviders>,
    )
    // Let the initial 404 + socket-registration microtasks settle on real timers
    // before switching to fake ones — RTL's waitFor never resolves under fake timers.
    await waitFor(() => expect(socketOpts).toBeDefined())

    act(() => socketOpts?.onConnect('2026-07-10T18:00:00.000Z'))
    expect(screen.getByTestId('connection').textContent).toBe('online')

    act(() => socketOpts?.onDisconnect())
    expect(screen.getByTestId('connection').textContent).toBe('offline')

    vi.useFakeTimers()
    act(() => socketOpts?.onConnect('2026-07-10T18:00:05.000Z'))
    expect(screen.getByTestId('connection').textContent).toBe('resynced')

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByTestId('connection').textContent).toBe('online')
  })

  it('populates StaffDirectoryContext.roster from GET /staff', async () => {
    mockApiGet(() => Promise.resolve(snapshot('s1')))
    render(
      <RealProviders>
        <Probe />
      </RealProviders>,
    )
    await waitFor(() => expect(screen.getByTestId('roster-count').textContent).toBe('1'))
  })
})
