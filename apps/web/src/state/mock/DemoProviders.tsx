import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createMockSession } from './mockSession'
import { SnapshotContext } from '@/state/SnapshotContext'
import { SessionActionsContext } from '@/state/SessionActions'
import { HistoryContext } from '@/state/HistoryContext'
import { ActivityContext } from '@/state/ActivityContext'
import { CaptainsContext } from '@/state/CaptainsContext'
import { AuthProvider, type CurrentStaff } from '@/state/AuthContext'
import { StaffDirectoryContext, type StaffRosterItem } from '@/state/StaffDirectoryContext'

/**
 * Demo-mode composition root (VITE_DEMO=1): wires one createMockSession()
 * instance into every context screens read from, via useSyncExternalStore.
 *
 * Bypasses AppGate's real /auth/me flow entirely — there is no backend to
 * authenticate against in demo mode, so the app starts already "signed in"
 * as the seeded manager, switchable via the SwitchUser overlay (StaffDirectoryContext).
 */
export function DemoProviders({ children }: { children: ReactNode }) {
  const actorRef = useRef<CurrentStaff | null>(null)
  const mock = useMemo(() => createMockSession({ getActorName: () => actorRef.current?.name ?? null }), [])

  const roster = useMemo<StaffRosterItem[]>(() => mock.listStaff(), [mock])
  const initialStaff = useMemo<CurrentStaff>(() => {
    const manager = roster.find((s) => s.role === 'manager') ?? roster[0]
    if (!manager) throw new Error('mock staff roster is empty')
    return manager
  }, [roster])
  const [currentStaff, setCurrentStaff] = useState<CurrentStaff>(initialStaff)

  useEffect(() => {
    actorRef.current = currentStaff
  }, [currentStaff])

  const snapshotState = useSyncExternalStore(mock.subscribe, mock.getSnapshotState)
  const historyState = useSyncExternalStore(mock.subscribe, mock.getHistoryState)
  const activityState = useSyncExternalStore(mock.subscribe, mock.getActivityState)
  const captainsState = useSyncExternalStore(mock.subscribe, mock.getCaptainsState)

  const staffDirectory = useMemo(
    () => ({
      roster,
      async login(staffId: string, pin: string): Promise<StaffRosterItem> {
        if (!mock.verifyStaffPin(staffId, pin)) throw new Error('wrong pin')
        const found = roster.find((s) => s.id === staffId)
        if (!found) throw new Error('staff not found')
        setCurrentStaff(found)
        return found
      },
    }),
    [mock, roster],
  )

  return (
    <SnapshotContext.Provider value={snapshotState}>
      <SessionActionsContext.Provider value={mock.actions}>
        <HistoryContext.Provider value={historyState}>
          <ActivityContext.Provider value={activityState}>
            <CaptainsContext.Provider value={captainsState}>
              <StaffDirectoryContext.Provider value={staffDirectory}>
                <AuthProvider currentStaff={currentStaff}>{children}</AuthProvider>
              </StaffDirectoryContext.Provider>
            </CaptainsContext.Provider>
          </ActivityContext.Provider>
        </HistoryContext.Provider>
      </SessionActionsContext.Provider>
    </SnapshotContext.Provider>
  )
}
