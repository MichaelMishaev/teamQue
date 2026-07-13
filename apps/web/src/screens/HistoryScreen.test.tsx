import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CaptainView } from 'shared'
import { HistoryScreen } from './HistoryScreen'
import { HistoryContext, type FinishedMatchView, type HistoryState } from '@/state/HistoryContext'
import { computeSessionSummary } from '@/state/mock/mockSession'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

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
    closeSession: vi.fn(),
    updateDuration: vi.fn(),
    updateTeam: vi.fn(),
    ...overrides,
  }
}

function captain(id: string, name: string): CaptainView {
  return { id, name, nickname: null, gamesToday: 1, lastPlayedAt: null }
}

function finishedMatch(id: string, aName: string, bName: string): FinishedMatchView {
  return {
    id,
    captainA: captain(`${id}-a`, aName),
    captainB: captain(`${id}-b`, bName),
    fieldName: 'מגרש ראשי',
    startedAt: '2026-07-10T18:00:00.000Z',
    endedAt: '2026-07-10T18:06:00.000Z',
    plannedDurationSec: 360,
    actualDurationSec: 360,
    endReason: 'auto',
    startedByName: 'שרה',
    endedByName: null,
  }
}

function renderHistory(matches: FinishedMatchView[], actionsOverrides: Partial<SessionActions> = {}) {
  const state: HistoryState = { summary: computeSessionSummary(matches, 0), matches }
  const actions = actionsStub(actionsOverrides)
  render(
    <SessionActionsContext.Provider value={actions}>
      <HistoryContext.Provider value={state}>
        <HistoryScreen />
      </HistoryContext.Provider>
    </SessionActionsContext.Provider>,
  )
  return { actions }
}

describe('HistoryScreen', () => {
  it('shows the summary header and every finished match', () => {
    renderHistory([finishedMatch('m1', 'יוסי', 'רון'), finishedMatch('m2', 'עומר', 'איתי')])
    expect(screen.getAllByText(/יוסי/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/עומר/).length).toBeGreaterThan(0)
    expect(screen.getByText('משחקים')).toBeDefined()
  })

  it('filters the match list (not the summary) by captain name', () => {
    renderHistory([finishedMatch('m1', 'יוסי', 'רון'), finishedMatch('m2', 'עומר', 'איתי')])
    fireEvent.change(screen.getByPlaceholderText('חיפוש לפי קפטן…'), { target: { value: 'עומר' } })
    const list = screen.getByPlaceholderText('חיפוש לפי קפטן…').nextElementSibling as HTMLElement
    expect(within(list).queryByText(/יוסי/)).toBeNull()
    expect(within(list).getByText(/עומר/)).toBeDefined()
  })

  it('shows the empty state when there is no history yet', () => {
    renderHistory([])
    expect(screen.getByText('אין משחקים שהסתיימו עדיין')).toBeDefined()
  })

  it('rematch shows a confirmation dialog, and only calls replay after confirming', async () => {
    const { actions } = renderHistory([finishedMatch('m1', 'יוסי', 'רון')])
    fireEvent.click(screen.getByText('משחק חוזר'))
    expect(actions.replay).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('אישור'))
    expect(actions.replay).toHaveBeenCalledWith('m1')
    await waitFor(() => expect(screen.queryByText('ליצור משחק חוזר?')).toBeNull())
  })
})
