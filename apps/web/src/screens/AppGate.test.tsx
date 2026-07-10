import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthState, type AuthPhase } from '@/hooks/useAuthState'
import type { CurrentStaff } from '@/state/AuthContext'
import { AppGate } from './AppGate'

vi.mock('@/hooks/useAuthState')

function mockState(phase: AuthPhase, currentStaff: CurrentStaff | null = null) {
  vi.mocked(useAuthState).mockReturnValue({ phase, currentStaff })
}

describe('AppGate', () => {
  it('renders a loading indicator in the loading phase', () => {
    mockState('loading')
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.queryByText('children')).toBeNull()
  })

  it('renders an error state when /auth/me fails, without rendering children', () => {
    mockState('error')
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByRole('alert')).toBeDefined()
    expect(screen.queryByText('children')).toBeNull()
  })

  it('renders children in the authed phase', () => {
    mockState('authed', { id: 's1', name: 'שרה', role: 'manager' })
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByText('children')).toBeDefined()
  })
})
