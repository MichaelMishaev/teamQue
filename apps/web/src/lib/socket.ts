/**
 * Session realtime socket (technical-prd §5). Connects to the '/session'
 * namespace, validates every snapshot against the shared zod schema (bad
 * payloads never throw — they're reported via onInvalidPayload), and derives
 * the server-clock handshake from 'session:hello' or, failing that, the first
 * valid snapshot's serverNow field.
 */
import { io, type Socket } from 'socket.io-client'
import { SOCKET_EVENTS, sessionSnapshotSchema, type SessionSnapshot } from 'shared'

const HELLO_EVENT = 'session:hello'

export interface CreateSessionSocketOptions {
  url: string
  /** Public field slug (open-fields spec) — forwarded as a handshake query param so the server can join the right session room. */
  slug?: string
  onSnapshot(snapshot: SessionSnapshot): void
  onConnect(serverNowIso: string): void
  onDisconnect(): void
  onInvalidPayload?(): void
}

export interface SessionSocket {
  disconnect(): void
}

function helloServerNow(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('serverNow' in payload)) return null
  const value = (payload as { serverNow: unknown }).serverNow
  return typeof value === 'string' ? value : null
}

export function createSessionSocket(opts: CreateSessionSocketOptions): SessionSocket {
  const socket: Socket = io(`${opts.url}/session`, {
    withCredentials: true,
    ...(opts.slug !== undefined ? { query: { slug: opts.slug } } : {}),
  })
  let helloReceived = false

  socket.on(HELLO_EVENT, (payload: unknown) => {
    const serverNow = helloServerNow(payload)
    if (serverNow === null) return
    helloReceived = true
    opts.onConnect(serverNow)
  })

  socket.on(SOCKET_EVENTS.snapshot, (payload: unknown) => {
    const result = sessionSnapshotSchema.safeParse(payload)
    if (!result.success) {
      opts.onInvalidPayload?.()
      return
    }
    if (!helloReceived) {
      helloReceived = true
      opts.onConnect(result.data.serverNow)
    }
    opts.onSnapshot(result.data)
  })

  socket.on('disconnect', () => {
    opts.onDisconnect()
  })

  return {
    disconnect() {
      socket.disconnect()
    },
  }
}
