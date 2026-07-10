import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CaptainSheet } from './CaptainSheet'
import { CaptainsContext, type CaptainProfile } from '@/state/CaptainsContext'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function profile(overrides: Partial<CaptainProfile> = {}): CaptainProfile {
  return {
    id: 'c1',
    name: 'דניאל',
    nickname: null,
    tags: ['ותיק'],
    note: '',
    gamesToday: 2,
    lastPlayedAt: '2026-07-10T18:42:00.000Z',
    totalMatches: 24,
    ...overrides,
  }
}

function renderSheet(profiles: CaptainProfile[], actionsOverrides: Partial<SessionActions> = {}) {
  const actions: SessionActions = {
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
    updateTeam: vi.fn().mockResolvedValue(undefined),
    ...actionsOverrides,
  }
  render(
    <CaptainsContext.Provider value={profiles}>
      <SessionActionsContext.Provider value={actions}>
        <CaptainSheet open onClose={() => {}} captainId="c1" />
      </SessionActionsContext.Provider>
    </CaptainsContext.Provider>,
  )
  return { actions }
}

describe('CaptainSheet', () => {
  it('shows games today, last played, and total from the profile', () => {
    renderSheet([profile()])
    expect(screen.getByText('2')).toBeDefined()
    expect(screen.getByText('24')).toBeDefined()
  })

  it('saves the nickname on blur', async () => {
    const { actions } = renderSheet([profile()])
    const input = screen.getByText('כינוי').querySelector('input')!
    fireEvent.change(input, { target: { value: 'הקטן' } })
    fireEvent.blur(input)
    await waitFor(() => expect(actions.updateTeam).toHaveBeenCalledWith('c1', { nickname: 'הקטן' }))
  })

  it('adds a tag on Enter', async () => {
    const { actions } = renderSheet([profile()])
    const tagInput = screen.getByPlaceholderText('הוסף תגית')
    fireEvent.change(tagInput, { target: { value: 'מהיר' } })
    fireEvent.keyDown(tagInput, { key: 'Enter' })
    await waitFor(() => expect(actions.updateTeam).toHaveBeenCalledWith('c1', { tags: ['ותיק', 'מהיר'] }))
  })

  it('renders nothing when the captain id is unknown', () => {
    const { container } = render(
      <CaptainsContext.Provider value={[]}>
        <SessionActionsContext.Provider value={{} as SessionActions}>
          <CaptainSheet open onClose={() => {}} captainId="missing" />
        </SessionActionsContext.Provider>
      </CaptainsContext.Provider>,
    )
    expect(container.firstChild).toBeNull()
  })
})
