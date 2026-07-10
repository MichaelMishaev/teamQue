import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QueueEntryView } from 'shared'
import { QueueList } from './QueueList'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function entry(id: string, name: string, position: number): QueueEntryView {
  return { id, position, team: { id: `${id}-cap`, name, nickname: null, gamesToday: 0, lastPlayedAt: null } }
}

function renderQueueList(queue: QueueEntryView[]) {
  const actions: SessionActions = {
    addToLine: vi.fn(),
    searchTeams: vi.fn().mockResolvedValue([]),
    reorderLine: vi.fn().mockResolvedValue(undefined),
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
  render(
    <SessionActionsContext.Provider value={actions}>
      <QueueList queue={queue} />
    </SessionActionsContext.Provider>,
  )
  return { actions }
}

describe('QueueList', () => {
  it('renders every line entry as a single-team row, front one marked next', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2)]
    renderQueueList(queue)
    expect(screen.getByText('הבא')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined() // second row shows its position, not "הבא"
  })

  it('opens QueueActionsSheet for the row whose ⋯ was tapped', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2)]
    renderQueueList(queue)
    const menuButtons = screen.getAllByRole('button')
    fireEvent.click(menuButtons[1]!) // second row's ⋯
    expect(screen.getByRole('heading', { name: 'ב' })).toBeDefined() // sheet title uses the picked entry's team name
  })
})
