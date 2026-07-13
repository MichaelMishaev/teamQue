import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RematchConfirmDialog } from './RematchConfirmDialog'
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

function renderDialog(open: boolean, actionsOverrides: Partial<SessionActions> = {}) {
  const actions = actionsStub(actionsOverrides)
  const onClose = vi.fn()
  render(
    <SessionActionsContext.Provider value={actions}>
      <RematchConfirmDialog open={open} onClose={onClose} matchId="m1" captainAName="יוסי" captainBName="רון" />
    </SessionActionsContext.Provider>,
  )
  return { actions, onClose }
}

describe('RematchConfirmDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog(false)
    expect(screen.queryByText('ליצור משחק חוזר?')).toBeNull()
  })

  it('shows the title and both captain names when open', () => {
    renderDialog(true)
    expect(screen.getByText('ליצור משחק חוזר?')).toBeDefined()
    expect(screen.getByText(/יוסי/)).toBeDefined()
    expect(screen.getByText(/רון/)).toBeDefined()
  })

  it('does not call replay until confirm is tapped', () => {
    const { actions } = renderDialog(true)
    expect(actions.replay).not.toHaveBeenCalled()
  })

  it('calls replay exactly once with the match id when confirm is tapped', () => {
    const { actions } = renderDialog(true)
    fireEvent.click(screen.getByText('אישור'))
    expect(actions.replay).toHaveBeenCalledTimes(1)
    expect(actions.replay).toHaveBeenCalledWith('m1')
  })

  it('disables confirm while the replay call is in flight, and calls onClose on success', async () => {
    let resolveReplay: () => void = () => {}
    const replay = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReplay = resolve
        }),
    )
    const { onClose } = renderDialog(true, { replay })
    fireEvent.click(screen.getByText('אישור'))
    expect((screen.getByText('אישור') as HTMLButtonElement).disabled).toBe(true)
    resolveReplay()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows an inline error and re-enables confirm when replay rejects', async () => {
    const replay = vi.fn().mockRejectedValue(new Error('network error'))
    renderDialog(true, { replay })
    fireEvent.click(screen.getByText('אישור'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect((screen.getByText('אישור') as HTMLButtonElement).disabled).toBe(false)
  })

  it('cancel closes the dialog without calling replay', () => {
    const { actions, onClose } = renderDialog(true)
    fireEvent.click(screen.getByText('ביטול'))
    expect(actions.replay).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('clears error state when dialog is closed and reopened', async () => {
    const replay = vi.fn().mockRejectedValue(new Error('network error'))
    const actions = actionsStub({ replay })
    const onClose = vi.fn()

    const { rerender } = render(
      <SessionActionsContext.Provider value={actions}>
        <RematchConfirmDialog open={true} onClose={onClose} matchId="m1" captainAName="יוסי" captainBName="רון" />
      </SessionActionsContext.Provider>,
    )

    // Trigger error by clicking confirm
    fireEvent.click(screen.getByText('אישור'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())

    // Close and reopen the dialog
    rerender(
      <SessionActionsContext.Provider value={actions}>
        <RematchConfirmDialog open={false} onClose={onClose} matchId="m1" captainAName="יוסי" captainBName="רון" />
      </SessionActionsContext.Provider>,
    )

    rerender(
      <SessionActionsContext.Provider value={actions}>
        <RematchConfirmDialog open={true} onClose={onClose} matchId="m1" captainAName="יוסי" captainBName="רון" />
      </SessionActionsContext.Provider>,
    )

    // Error should be cleared
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
