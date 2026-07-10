import { createContext, useContext } from 'react'
import type { SessionSnapshot } from '@/state/lineModel'

/**
 * Single responsibility: the read side of the app's state abstraction. Every
 * screen renders from `snapshot` (the line-model SessionSnapshot — see
 * state/lineModel.ts) plus connection status and the server-clock offset —
 * never from its own copy of server state. Fed by `state/mock/mockSession.ts`
 * in demo mode and, later, by the real socket (`lib/socket.ts`) without any
 * screen changes.
 */

export type ConnectionStatus = 'online' | 'offline' | 'resynced'

export interface SnapshotState {
  snapshot: SessionSnapshot | null
  connection: ConnectionStatus
  /** server time − client time, ms (technical-prd §4); feeds useCountdown. */
  offsetMs: number
}

export const SnapshotContext = createContext<SnapshotState | undefined>(undefined)

export function useSnapshot(): SnapshotState {
  const value = useContext(SnapshotContext)
  if (value === undefined) throw new Error('useSnapshot must be used within a SnapshotContext.Provider')
  return value
}
