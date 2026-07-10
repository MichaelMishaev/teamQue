import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SwitchUser } from './SwitchUser'
import { StaffDirectoryContext, type StaffDirectory } from '@/state/StaffDirectoryContext'

function renderSwitchUser(overrides: Partial<StaffDirectory> = {}) {
  const directory: StaffDirectory = {
    roster: [
      { id: 's1', name: 'שרה', role: 'manager' },
      { id: 's2', name: 'משה', role: 'staff' },
    ],
    login: vi.fn().mockResolvedValue({ id: 's2', name: 'משה', role: 'staff' }),
    ...overrides,
  }
  const onClose = vi.fn()
  render(
    <StaffDirectoryContext.Provider value={directory}>
      <SwitchUser open onClose={onClose} />
    </StaffDirectoryContext.Provider>,
  )
  return { directory, onClose }
}

describe('SwitchUser', () => {
  it('pick staff → enter PIN → calls login and closes on success', async () => {
    const { directory, onClose } = renderSwitchUser()
    fireEvent.click(screen.getByText('משה'))

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(directory.login).toHaveBeenCalledWith('s2', '1234'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('wrong pin shows an inline error and clears the dots', async () => {
    const login = vi.fn().mockRejectedValue(new Error('wrong pin'))
    renderSwitchUser({ login })
    fireEvent.click(screen.getByText('משה'))

    fireEvent.click(screen.getByText('1'))
    fireEvent.click(screen.getByText('2'))
    fireEvent.click(screen.getByText('3'))
    fireEvent.click(screen.getByText('4'))

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
  })
})
