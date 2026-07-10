import type { ReactNode } from 'react'
import { SnapshotContext, type SnapshotState } from '@/state/SnapshotContext'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'
import { HistoryContext, type HistoryState } from '@/state/HistoryContext'
import { ActivityContext } from '@/state/ActivityContext'
import { CaptainsContext } from '@/state/CaptainsContext'
import { StaffDirectoryContext } from '@/state/StaffDirectoryContext'

/**
 * Real-mode placeholder (VITE_DEMO unset). Feeds the same contexts screens
 * read from with "nothing" — a null snapshot, offline connection, actions
 * that reject — so AppGate + a not-connected MainScreen render without
 * crashing while the real socket/API wiring (lib/socket.ts, lib/api.ts) is
 * plugged in behind these same contexts in a later task.
 */
const EMPTY_SNAPSHOT: SnapshotState = { snapshot: null, connection: 'offline', offsetMs: 0 }
const EMPTY_HISTORY: HistoryState = { summary: null, matches: [] }

function notImplemented(): Promise<never> {
  return Promise.reject(new Error('real API/socket wiring is not implemented yet'))
}

const REAL_ACTIONS: SessionActions = {
  addToLine: notImplemented,
  searchTeams: async () => [],
  reorderLine: notImplemented,
  moveTop: notImplemented,
  moveBottom: notImplemented,
  removeFromLine: notImplemented,
  startMatch: notImplemented,
  pause: notImplemented,
  resume: notImplemented,
  finish: notImplemented,
  extend: notImplemented,
  replay: notImplemented,
  undo: notImplemented,
  openSession: notImplemented,
  closeSession: notImplemented,
  updateDuration: notImplemented,
  updateTeam: notImplemented,
}

export function RealProviders({ children }: { children: ReactNode }) {
  return (
    <SnapshotContext.Provider value={EMPTY_SNAPSHOT}>
      <SessionActionsContext.Provider value={REAL_ACTIONS}>
        <HistoryContext.Provider value={EMPTY_HISTORY}>
          <ActivityContext.Provider value={[]}>
            <CaptainsContext.Provider value={[]}>
              <StaffDirectoryContext.Provider value={{ roster: [], login: notImplemented }}>
                {children}
              </StaffDirectoryContext.Provider>
            </CaptainsContext.Provider>
          </ActivityContext.Provider>
        </HistoryContext.Provider>
      </SessionActionsContext.Provider>
    </SnapshotContext.Provider>
  )
}
