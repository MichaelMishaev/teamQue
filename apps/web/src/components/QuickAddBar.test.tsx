import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CaptainSearchResult as CaptainSearchResultData } from 'shared'
import { QuickAddBar } from './QuickAddBar'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function team(id: string, name: string, gamesToday = 0): CaptainSearchResultData {
  return { id, name, nickname: null, gamesToday, lastPlayedAt: null, note: null, tags: [], totalMatches: 0 }
}

function renderBar(overrides: Partial<SessionActions> = {}) {
  const actions: SessionActions = {
    addToLine: vi.fn().mockResolvedValue(undefined),
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
    ...overrides,
  }
  render(
    <SessionActionsContext.Provider value={actions}>
      <QuickAddBar />
    </SessionActionsContext.Provider>,
  )
  return { actions }
}

describe('QuickAddBar', () => {
  it('type → pick a result calls addToLine with that team id, then resets', async () => {
    const searchTeams = vi.fn().mockResolvedValue([team('c1', 'דניאל', 3)])
    const addToLine = vi.fn().mockResolvedValue(undefined)
    renderBar({ searchTeams, addToLine })

    fireEvent.change(screen.getByPlaceholderText('חיפוש קפטן…'), { target: { value: 'דנ' } })
    await screen.findByText('דניאל', {}, { timeout: 1000 })
    fireEvent.click(screen.getByText('בחר'))

    await waitFor(() => expect(addToLine).toHaveBeenCalledWith({ id: 'c1' }))
    // resets: search box empty, results gone
    await waitFor(() => expect((screen.getByPlaceholderText('חיפוש קפטן…') as HTMLInputElement).value).toBe(''))
  })

  it('create-and-add calls addToLine with a newName ref when there is no match', async () => {
    const searchTeams = vi.fn().mockResolvedValue([])
    const addToLine = vi.fn().mockResolvedValue(undefined)
    renderBar({ searchTeams, addToLine })

    fireEvent.change(screen.getByPlaceholderText('חיפוש קפטן…'), { target: { value: 'שחקן חדש' } })
    const createRow = await screen.findByText(/צור את/)
    fireEvent.click(createRow)

    await waitFor(() => expect(addToLine).toHaveBeenCalledWith({ newName: 'שחקן חדש' }))
  })

  it('flags a duplicate hint when a result shares the typed name', async () => {
    const searchTeams = vi.fn().mockResolvedValue([team('c1', 'דניאל')])
    renderBar({ searchTeams })

    fireEvent.change(screen.getByPlaceholderText('חיפוש קפטן…'), { target: { value: 'דניאל' } })
    await screen.findByText('דניאל', {}, { timeout: 1000 })
    expect(await screen.findByText(/קיים דניאל נוסף/)).toBeDefined()
  })
})
