import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QueueEntryView } from 'shared'
import { QueueList } from './QueueList'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function entry(
  id: string,
  name: string,
  position: number,
  stats: Pick<QueueEntryView['team'], 'gamesToday' | 'lastPlayedAt'> = { gamesToday: 0, lastPlayedAt: null },
): QueueEntryView {
  return { id, position, team: { id: `${id}-cap`, name, nickname: null, ...stats } }
}

function renderQueueList(queue: QueueEntryView[], opts: { matchDurationSec?: number; baseSec?: number } = {}) {
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
      <QueueList queue={queue} matchDurationSec={opts.matchDurationSec ?? 480} baseSec={opts.baseSec ?? 0} />
    </SessionActionsContext.Provider>,
  )
  return { actions }
}

describe('QueueList', () => {
  it('renders every line entry as a single-team row, front two marked next', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3)]
    renderQueueList(queue)
    expect(screen.getAllByText('הבא')).toHaveLength(2) // both halves of the imminent match are marked next
    expect(screen.getByText('3')).toBeDefined() // third row shows its position, not "הבא"
  })

  it('keeps the selected teen\'s last-played time visible after they enter the queue', () => {
    const queue = [entry('e1', 'טורי', 1, { gamesToday: 1, lastPlayedAt: '2026-07-12T06:16:00.000Z' })]

    renderQueueList(queue)

    expect(screen.getByText('· 1 היום')).toBeDefined()
    expect(screen.getByText('09:16')).toBeDefined()
  })

  it('opens QueueActionsSheet for the row whose ⋯ was tapped', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2)]
    renderQueueList(queue)
    const menuButtons = screen.getAllByRole('button')
    fireEvent.click(menuButtons[1]!) // second row's ⋯
    expect(screen.getByRole('heading', { name: 'ב' })).toBeDefined() // sheet title uses the picked entry's team name
  })

  describe('predicted pairing', () => {
    it('shows a games-ahead/eta line for every pair after the front two', () => {
      const queue = [entry('e1', 'טל', 1), entry('e2', 'נדב', 2), entry('e3', 'רון', 3), entry('e4', 'חלח', 4)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getAllByText('משחק אחד לפניך')).toHaveLength(2)
      expect(screen.getAllByText('9')).toHaveLength(2)
    })

    it('marks a trailing odd entry as waiting for a pair with an approximate eta', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
      expect(screen.getByText('(משוער)')).toBeDefined()
    })

    it('folds the live match remaining time into every eta via baseSec', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 200 })
      // (200 + 480 + 60) / 60 = 12.33 -> rounds to 12 (both entries in the pair share the same eta)
      expect(screen.getAllByText('12')).toHaveLength(2)
    })
  })
})
