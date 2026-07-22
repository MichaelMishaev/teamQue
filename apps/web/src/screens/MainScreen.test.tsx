import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from 'shared'
import { MainScreen } from './MainScreen'
import { showStatusToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import { AuthProvider } from '@/state/AuthContext'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'
import { SnapshotContext, type SnapshotState } from '@/state/SnapshotContext'

vi.mock('@/components/UndoToast', () => ({ showStatusToast: vi.fn() }))

function actionsStub(): SessionActions {
  return {
    addToLine: vi.fn(),
    searchTeams: vi.fn().mockResolvedValue([]),
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
    closeSession: vi.fn(),
    updateDuration: vi.fn(),
    updateTeam: vi.fn(),
  }
}

function renderMain(snapshotState: SnapshotState, role: 'manager' | 'staff') {
  const actions = actionsStub()
  render(
    <SnapshotContext.Provider value={snapshotState}>
      <SessionActionsContext.Provider value={actions}>
        <AuthProvider currentStaff={{ id: 's1', name: 'שרה', role }}>
          <MainScreen />
        </AuthProvider>
      </SessionActionsContext.Provider>
    </SnapshotContext.Provider>,
  )
  return actions
}

const NO_SESSION: SnapshotState = { snapshot: null, connection: 'online', offsetMs: 0 }

function activeSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    session: { id: 's1', slug: 'abc234', date: '2026-07-10', location: null, matchDurationSec: 360, status: 'active' },
    fields: [{ id: 'f1', name: 'מגרש ראשי', position: 0, liveMatch: null }],
    queue: [],
    emittedAt: '2026-07-10T18:00:00.000Z',
    serverNow: '2026-07-10T18:00:00.000Z',
    ...overrides,
  }
}

function team(id: string, name: string): SessionSnapshot['queue'][number]['team'] {
  return { id, name, nickname: null, gamesToday: 0, lastPlayedAt: null }
}

// Open-fields pivot: MainScreen's snapshot now comes from GET /fields/:slug,
// so !snapshot means "bad/closed link" (no session ever exists to open from
// here — creation lives on the public HomeScreen), not "no session yet".
describe('MainScreen — no snapshot (bad or closed field link)', () => {
  it('shows the field-not-found empty state, regardless of role', () => {
    renderMain(NO_SESSION, 'staff')
    expect(screen.getByText('המגרש לא נמצא')).toBeDefined()
    expect(screen.queryByText('פתח ערב משחקים')).toBeNull()
  })
})

describe('MainScreen — active session, field free', () => {
  it('opens the public player view in a separate tab from Main', () => {
    const snapshot = activeSnapshot({
      fields: [{ id: 'f1', name: t('home.create.nameDefault'), position: 0, liveMatch: null }],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'manager')

    const link = screen.getByRole('link', { name: 'פתיחת תצוגת שחקנים בחלון חדש' })
    expect(link.getAttribute('href')).toBe('/line')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('does not offer the fixed Independence Square player view from another field', () => {
    renderMain({ snapshot: activeSnapshot(), connection: 'online', offsetMs: 0 }, 'manager')

    expect(screen.queryByRole('link', { name: 'פתיחת תצוגת שחקנים בחלון חדש' })).toBeNull()
  })

  it('disables start with a reason when the line has fewer than two teams', () => {
    const snapshot = activeSnapshot({ queue: [{ id: 'e1', position: 1, team: team('ca', 'יוסי') }] })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getByText('צריך שתי קבוצות בתור')).toBeDefined()
    expect(screen.getByText('התור (1)')).toBeDefined()
  })

  it('shows the front-two-of-the-line start prompt once two teams are waiting', () => {
    const snapshot = activeSnapshot({
      queue: [
        { id: 'e1', position: 1, team: team('ca', 'יוסי') },
        { id: 'e2', position: 2, team: team('cb', 'רון') },
      ],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getByText(/הבא במגרש/)).toBeDefined()
    expect(screen.getByText('התור (2)')).toBeDefined()
    expect((screen.getByRole('button', { name: /התחל/ }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows a games-ahead/eta estimate for queue entries past the front two', () => {
    const snapshot = activeSnapshot({
      queue: [
        { id: 'e1', position: 1, team: team('ca', 'א') },
        { id: 'e2', position: 2, team: team('cb', 'ב') },
        { id: 'e3', position: 3, team: team('cc', 'ג') },
        { id: 'e4', position: 4, team: team('cd', 'ד') },
      ],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getAllByText('משחק אחד לפניך')).toHaveLength(2)
  })

  it('shows the empty-line state when there is an active session but no waiting teams', () => {
    renderMain({ snapshot: activeSnapshot(), connection: 'online', offsetMs: 0 }, 'manager')
    expect(screen.getByText('התור ריק — הוסיפו משחק בשורת החיפוש למטה')).toBeDefined()
  })
})

describe('MainScreen — active session, field live', () => {
  it('confirms a finished match without offering an undo action', async () => {
    const snapshot = activeSnapshot({
      fields: [
        {
          id: 'f1',
          name: 'מגרש ראשי',
          position: 0,
          liveMatch: {
            id: 'm1',
            captainA: team('ca', 'א'),
            captainB: team('cb', 'ב'),
            status: 'live',
            plannedDurationSec: 360,
            startedAt: new Date().toISOString(),
            pausedAt: null,
            accumulatedPauseSec: 0,
            endsAt: new Date(Date.now() + 360_000).toISOString(),
          },
        },
      ],
    })
    const actions = renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')

    fireEvent.click(screen.getByRole('button', { name: 'סיים' }))

    await waitFor(() => expect(actions.finish).toHaveBeenCalledWith('m1'))
    expect(showStatusToast).toHaveBeenCalledWith('toast.matchFinished')
    expect(actions.undo).not.toHaveBeenCalled()
  })

  it('at 00:00 with a waiting pair, "finish and start next" finishes then starts the next match', async () => {
    const snapshot = activeSnapshot({
      fields: [
        {
          id: 'f1',
          name: 'מגרש ראשי',
          position: 0,
          liveMatch: {
            id: 'm1',
            captainA: team('ca', 'א'),
            captainB: team('cb', 'ב'),
            status: 'live',
            plannedDurationSec: 360,
            startedAt: new Date(Date.now() - 400_000).toISOString(),
            pausedAt: null,
            accumulatedPauseSec: 0,
            endsAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      ],
      queue: [
        { id: 'e1', position: 1, team: team('cc', 'יוסי') },
        { id: 'e2', position: 2, team: team('cd', 'רון') },
      ],
    })
    const actions = renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')

    fireEvent.click(screen.getByRole('button', { name: /סיים והתחל הבא/ }))

    await waitFor(() => expect(actions.finish).toHaveBeenCalledWith('m1'))
    await waitFor(() => expect(actions.startMatch).toHaveBeenCalled())
  })

  it('shows the live FieldCard instead of the start prompt', () => {
    const snapshot = activeSnapshot({
      fields: [
        {
          id: 'f1',
          name: 'מגרש ראשי',
          position: 0,
          liveMatch: {
            id: 'm1',
            captainA: team('ca', 'א'),
            captainB: team('cb', 'ב'),
            status: 'live',
            plannedDurationSec: 360,
            startedAt: new Date().toISOString(),
            pausedAt: null,
            accumulatedPauseSec: 0,
            endsAt: new Date(Date.now() + 360_000).toISOString(),
          },
        },
      ],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getByText('משחק פעיל')).toBeDefined()
    expect(screen.queryByText('הבא במגרש')).toBeNull()
  })

  it('marks a trailing odd queue entry as waiting for a pair while a match is live', () => {
    const snapshot = activeSnapshot({
      fields: [
        {
          id: 'f1',
          name: 'מגרש ראשי',
          position: 0,
          liveMatch: {
            id: 'm1',
            captainA: team('ca', 'א'),
            captainB: team('cb', 'ב'),
            status: 'live',
            plannedDurationSec: 360,
            startedAt: new Date().toISOString(),
            pausedAt: null,
            accumulatedPauseSec: 0,
            endsAt: new Date(Date.now() + 360_000).toISOString(),
          },
        },
      ],
      queue: [
        { id: 'e1', position: 1, team: team('cc', 'ג') },
        { id: 'e2', position: 2, team: team('cd', 'ד') },
        { id: 'e3', position: 3, team: team('ce', 'ה') },
      ],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
  })
})
