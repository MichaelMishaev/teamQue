import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthState, type AuthPhase } from '@/hooks/useAuthState'
import { AppGate } from './AppGate'

vi.mock('@/hooks/useAuthState')
vi.mock('@/screens/CenterUnlock', () => ({
  CenterUnlock: () => <div>center-unlock-stub</div>,
}))
vi.mock('@/screens/StaffLogin', () => ({
  StaffLogin: () => <div>staff-login-stub</div>,
}))

function mockPhase(phase: AuthPhase) {
  vi.mocked(useAuthState).mockReturnValue({
    phase,
    currentStaff: phase === 'authed' ? { id: 's1', name: 'שרה', role: 'manager' } : null,
    onCenterUnlocked: vi.fn(),
    onLoggedIn: vi.fn(),
  })
}

describe('AppGate', () => {
  it('does not render manager children while loading', () => {
    mockPhase('loading')
    render(<AppGate><div>manager-content</div></AppGate>)
    expect(screen.getByRole('status')).toBeDefined()
    expect(screen.queryByText('manager-content')).toBeNull()
  })

  it('renders the center PIN gate before manager children', () => {
    mockPhase('needs-center')
    render(<AppGate><div>manager-content</div></AppGate>)
    expect(screen.getByText('center-unlock-stub')).toBeDefined()
    expect(screen.queryByText('manager-content')).toBeNull()
  })

  it('renders the staff PIN gate after center unlock', () => {
    mockPhase('needs-login')
    render(<AppGate><div>manager-content</div></AppGate>)
    expect(screen.getByText('staff-login-stub')).toBeDefined()
    expect(screen.queryByText('manager-content')).toBeNull()
  })

  it('renders manager children only after authentication', () => {
    mockPhase('authed')
    render(<AppGate><div>manager-content</div></AppGate>)
    expect(screen.getByText('manager-content')).toBeDefined()
  })
})
