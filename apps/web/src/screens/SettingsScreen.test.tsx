import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from 'shared'
import { SettingsScreen } from './SettingsScreen'
import { AuthProvider } from '@/state/AuthContext'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'
import { SnapshotContext, type SnapshotState } from '@/state/SnapshotContext'
import { StaffDirectoryContext } from '@/state/StaffDirectoryContext'

function actionsStub(overrides: Partial<SessionActions> = {}): SessionActions {
  return {
    addToLine: vi.fn(),
    searchTeams: vi.fn(),
    reorderLine: vi.fn(),
    moveTop: vi.fn(),
    moveBottom: vi.fn(),
    removeFromLine: vi.fn(),
    startMatch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    finish: vi.fn(),
    extend: vi.fn(),
    replay: vi.fn(),
    undo: vi.fn(),
    openSession: vi.fn(),
    closeSession: vi.fn().mockResolvedValue(undefined),
    updateDuration: vi.fn().mockResolvedValue(undefined),
    updateTeam: vi.fn(),
    ...overrides,
  }
}

function activeSnapshot(hasLiveMatch: boolean): SessionSnapshot {
  return {
    session: { id: 's1', slug: 'abc234', date: '2026-07-10', location: null, matchDurationSec: 360, status: 'active' },
    fields: [
      {
        id: 'f1',
        name: 'מגרש ראשי',
        position: 0,
        liveMatch: hasLiveMatch
          ? {
              id: 'm1',
              captainA: { id: 'ca', name: 'א', nickname: null, gamesToday: 0, lastPlayedAt: null },
              captainB: { id: 'cb', name: 'ב', nickname: null, gamesToday: 0, lastPlayedAt: null },
              status: 'live',
              plannedDurationSec: 360,
              startedAt: '2026-07-10T18:00:00.000Z',
              pausedAt: null,
              accumulatedPauseSec: 0,
              endsAt: '2026-07-10T18:06:00.000Z',
            }
          : null,
      },
    ],
    queue: [],
    emittedAt: '2026-07-10T18:00:00.000Z',
    serverNow: '2026-07-10T18:00:00.000Z',
  }
}

function renderSettings(role: 'manager' | 'staff', snapshotState: SnapshotState, actionsOverrides: Partial<SessionActions> = {}) {
  const actions = actionsStub(actionsOverrides)
  render(
    <SnapshotContext.Provider value={snapshotState}>
      <SessionActionsContext.Provider value={actions}>
        <StaffDirectoryContext.Provider value={{ roster: [{ id: 's1', name: 'שרה', role: 'manager' }], login: vi.fn() }}>
          <AuthProvider currentStaff={{ id: 's1', name: 'שרה', role }}>
            <SettingsScreen />
          </AuthProvider>
        </StaffDirectoryContext.Provider>
      </SessionActionsContext.Provider>
    </SnapshotContext.Provider>,
  )
  return { actions }
}

// jsdom in this Node version doesn't expose a working localStorage global; stub a minimal one for the test.
function fakeLocalStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size
    },
  } as Storage
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeLocalStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('staff role sees a forbidden message, not the settings UI', () => {
    renderSettings('staff', { snapshot: activeSnapshot(false), connection: 'online', offsetMs: 0 })
    expect(screen.getByText('המסך הזה זמין למנהלים בלבד')).toBeDefined()
    expect(screen.queryByText('צוות')).toBeNull()
  })

  it('manager can close the session when the field is free, after confirming', async () => {
    const { actions } = renderSettings('manager', { snapshot: activeSnapshot(false), connection: 'online', offsetMs: 0 })
    const closeButton = screen.getByText('סגור ערב') as HTMLButtonElement
    expect(closeButton.disabled).toBe(false)
    fireEvent.click(closeButton)
    expect(actions.closeSession).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('סגור מגרש'))
    await waitFor(() => expect(actions.closeSession).toHaveBeenCalled())
  })

  it('cancelling the close confirmation does not call closeSession', () => {
    const { actions } = renderSettings('manager', { snapshot: activeSnapshot(false), connection: 'online', offsetMs: 0 })
    fireEvent.click(screen.getByText('סגור ערב'))
    fireEvent.click(screen.getByText('ביטול'))
    expect(actions.closeSession).not.toHaveBeenCalled()
    expect(screen.queryByText('סגור מגרש')).toBeNull()
  })

  it('keeps the close button enabled when a match is live (force-close is reachable), and warns the confirm dialog will cancel it', async () => {
    const { actions } = renderSettings('manager', { snapshot: activeSnapshot(true), connection: 'online', offsetMs: 0 })
    const closeButton = screen.getByText('סגור ערב') as HTMLButtonElement
    expect(closeButton.disabled).toBe(false)

    fireEvent.click(closeButton)
    expect(screen.getByText(/יש משחק פעיל במגרש/)).toBeDefined()

    fireEvent.click(screen.getByText('סגור מגרש'))
    await waitFor(() => expect(actions.closeSession).toHaveBeenCalled())
  })

  it('does not show the live-match warning in the confirm dialog when the field is free', () => {
    renderSettings('manager', { snapshot: activeSnapshot(false), connection: 'online', offsetMs: 0 })
    fireEvent.click(screen.getByText('סגור ערב'))
    expect(screen.queryByText(/יש משחק פעיל במגרש/)).toBeNull()
  })

  it('persists the wake-lock toggle to localStorage', () => {
    renderSettings('manager', { snapshot: activeSnapshot(false), connection: 'online', offsetMs: 0 })
    fireEvent.click(screen.getByText('כבוי'))
    expect(localStorage.getItem('queueManager.wakeLockEnabled')).toBe('1')
  })
})
