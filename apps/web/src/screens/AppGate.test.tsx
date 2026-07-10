import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthState, type AuthPhase } from '@/hooks/useAuthState'
import { AppGate } from './AppGate'

vi.mock('@/hooks/useAuthState')
vi.mock('@/screens/CenterUnlock', () => ({
  CenterUnlock: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>center-unlock-stub</button>
  ),
}))
vi.mock('@/screens/StaffLogin', () => ({
  StaffLogin: ({ onSuccess }: { onSuccess: () => void }) => (
    <button onClick={onSuccess}>staff-login-stub</button>
  ),
}))

function mockPhase(phase: AuthPhase) {
  vi.mocked(useAuthState).mockReturnValue({
    phase,
    currentStaff: null,
    onCenterUnlocked: vi.fn(),
    onLoggedIn: vi.fn(),
  })
}

describe('AppGate', () => {
  it('renders a loading indicator in the loading phase', () => {
    mockPhase('loading')
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.queryByText('children')).toBeNull()
  })

  it('renders CenterUnlock in the needs-center phase', () => {
    mockPhase('needs-center')
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByText('center-unlock-stub')).toBeDefined()
  })

  it('renders StaffLogin in the needs-login phase', () => {
    mockPhase('needs-login')
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByText('staff-login-stub')).toBeDefined()
  })

  it('renders children in the authed phase', () => {
    mockPhase('authed')
    render(
      <AppGate>
        <div>children</div>
      </AppGate>,
    )
    expect(screen.getByText('children')).toBeDefined()
  })
})
