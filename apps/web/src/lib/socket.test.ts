// @vitest-environment node
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server as SocketIoServer } from 'socket.io'
import { SOCKET_EVENTS, type SessionSnapshot } from 'shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSessionSocket } from './socket'

const validSnapshot: SessionSnapshot = {
  session: {
    id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    slug: 'abc234',
    date: '2026-07-10',
    location: 'Center Court',
    matchDurationSec: 360,
    status: 'active',
  },
  fields: [],
  queue: [],
  emittedAt: '2026-07-10T18:55:23.000Z',
  serverNow: '2026-07-10T18:55:23.000Z',
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('createSessionSocket', () => {
  let httpServer: HttpServer
  let io: SocketIoServer
  let url: string

  beforeEach(async () => {
    httpServer = createServer()
    io = new SocketIoServer(httpServer)
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    const port = (httpServer.address() as AddressInfo).port
    url = `http://localhost:${port}`
  })

  afterEach(async () => {
    io.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  it('calls onConnect with the serverNow from session:hello and delivers valid snapshots', async () => {
    const sessionNs = io.of('/session')
    sessionNs.on('connection', (socket) => {
      socket.emit('session:hello', { serverNow: '2026-07-10T12:00:00.000Z' })
      socket.emit(SOCKET_EVENTS.snapshot, validSnapshot)
    })

    const onSnapshot = vi.fn()
    const onConnect = vi.fn()
    const onDisconnect = vi.fn()

    const client = createSessionSocket({ url, onSnapshot, onConnect, onDisconnect })

    await waitFor(() => onSnapshot.mock.calls.length > 0)

    expect(onSnapshot).toHaveBeenCalledWith(validSnapshot)
    expect(onConnect).toHaveBeenCalledWith('2026-07-10T12:00:00.000Z')

    client.disconnect()
  })

  it('falls back to the snapshot serverNow for onConnect when no hello was received', async () => {
    const sessionNs = io.of('/session')
    sessionNs.on('connection', (socket) => {
      socket.emit(SOCKET_EVENTS.snapshot, validSnapshot)
    })

    const onSnapshot = vi.fn()
    const onConnect = vi.fn()
    const onDisconnect = vi.fn()

    const client = createSessionSocket({ url, onSnapshot, onConnect, onDisconnect })

    await waitFor(() => onConnect.mock.calls.length > 0)

    expect(onConnect).toHaveBeenCalledWith(validSnapshot.serverNow)
    expect(onSnapshot).toHaveBeenCalledWith(validSnapshot)

    client.disconnect()
  })

  it('ignores an invalid snapshot payload via onInvalidPayload, never throwing', async () => {
    const sessionNs = io.of('/session')
    sessionNs.on('connection', (socket) => {
      socket.emit(SOCKET_EVENTS.snapshot, { bogus: true })
    })

    const onSnapshot = vi.fn()
    const onConnect = vi.fn()
    const onDisconnect = vi.fn()
    const onInvalidPayload = vi.fn()

    const client = createSessionSocket({ url, onSnapshot, onConnect, onDisconnect, onInvalidPayload })

    await waitFor(() => onInvalidPayload.mock.calls.length > 0)

    expect(onInvalidPayload).toHaveBeenCalled()
    expect(onSnapshot).not.toHaveBeenCalled()

    client.disconnect()
  })

  it('calls onDisconnect when the server closes the connection', async () => {
    const sessionNs = io.of('/session')
    sessionNs.on('connection', (socket) => {
      socket.disconnect(true)
    })

    const onSnapshot = vi.fn()
    const onConnect = vi.fn()
    const onDisconnect = vi.fn()

    createSessionSocket({ url, onSnapshot, onConnect, onDisconnect })

    await waitFor(() => onDisconnect.mock.calls.length > 0)

    expect(onDisconnect).toHaveBeenCalled()
  })

  it('forwards a slug as a handshake query param when provided', async () => {
    const sessionNs = io.of('/session')
    let receivedQuery: Record<string, unknown> = {}
    sessionNs.on('connection', (socket) => {
      receivedQuery = socket.handshake.query
      socket.emit('session:hello', { serverNow: '2026-07-10T12:00:00.000Z' })
    })

    const onSnapshot = vi.fn()
    const onConnect = vi.fn()
    const onDisconnect = vi.fn()

    const client = createSessionSocket({ url, slug: 'abc234', onSnapshot, onConnect, onDisconnect })

    await waitFor(() => onConnect.mock.calls.length > 0)

    expect(receivedQuery.slug).toBe('abc234')

    client.disconnect()
  })
})
