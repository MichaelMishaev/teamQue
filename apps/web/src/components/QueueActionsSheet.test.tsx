import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueueActionsSheet } from './QueueActionsSheet'
import type { QueueEntryView } from 'shared'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function entry(id: string, name: string, position: number): QueueEntryView {
  return { id, position, team: { id: `${id}-cap`, name, nickname: null, gamesToday: 0, lastPlayedAt: null } }
}

function noop(): SessionActions {
  return {
    addToLine: vi.fn(),
    searchTeams: vi.fn().mockResolvedValue([]),
    reorderLine: vi.fn(),
    moveTop: vi.fn().mockResolvedValue(undefined),
    moveBottom: vi.fn().mockResolvedValue(undefined),
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

function renderSheet(target: QueueEntryView, actionsOverrides: Partial<SessionActions> = {}) {
  const actions = { ...noop(), ...actionsOverrides }
  const onClose = vi.fn()
  render(
    <SessionActionsContext.Provider value={actions}>
      <QueueActionsSheet open onClose={onClose} entry={target} />
    </SessionActionsContext.Provider>,
  )
  return { actions, onClose }
}

describe('QueueActionsSheet', () => {
  it('move to top calls moveTop with this entry id', async () => {
    const { actions } = renderSheet(entry('e2', 'ג', 2))
    fireEvent.click(screen.getByText('לראש התור'))
    await waitFor(() => expect(actions.moveTop).toHaveBeenCalledWith('e2'))
  })

  it('move to bottom calls moveBottom with this entry id', async () => {
    const { actions } = renderSheet(entry('e2', 'ג', 2))
    fireEvent.click(screen.getByText('לסוף התור'))
    await waitFor(() => expect(actions.moveBottom).toHaveBeenCalledWith('e2'))
  })

  it('remove calls removeFromLine and closes the sheet', async () => {
    const removeFromLine = vi.fn().mockResolvedValue({ activityId: 'act-1' })
    const { actions, onClose } = renderSheet(entry('e1', 'א', 1), { removeFromLine })
    fireEvent.click(screen.getByText('הסר'))
    await waitFor(() => expect(actions.removeFromLine).toHaveBeenCalledWith('e1'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does not offer a change-captains action', () => {
    renderSheet(entry('e1', 'א', 1))
    expect(screen.queryByText('החלף קפטנים')).toBeNull()
  })

  it('rename reveals an input pre-filled with the team name and saves via updateTeam on blur', async () => {
    const updateTeam = vi.fn().mockResolvedValue(undefined)
    const { actions } = renderSheet(entry('e1', 'א', 1), { updateTeam })
    fireEvent.click(screen.getByText('שנה שם'))
    const input = screen.getByDisplayValue('א')
    fireEvent.change(input, { target: { value: 'ב' } })
    fireEvent.blur(input)
    await waitFor(() => expect(actions.updateTeam).toHaveBeenCalledWith('e1-cap', { name: 'ב' }))
  })

  it('rename does not save when blurred unchanged or emptied', async () => {
    const updateTeam = vi.fn().mockResolvedValue(undefined)
    renderSheet(entry('e1', 'א', 1), { updateTeam })
    fireEvent.click(screen.getByText('שנה שם'))
    fireEvent.blur(screen.getByDisplayValue('א'))
    expect(updateTeam).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('שנה שם'))
    const input = screen.getByDisplayValue('א')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.blur(input)
    expect(updateTeam).not.toHaveBeenCalled()
  })
})
