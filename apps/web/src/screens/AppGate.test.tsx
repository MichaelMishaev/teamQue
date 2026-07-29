import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAuthState, type AuthPhase } from '@/hooks/useAuthState'
import { AppGate } from './AppGate'

vi.mock('@/hooks/useAuthState')
vi.mock('@/screens/CenterUnlock', () => ({
  CenterUnlock: () => <div>center-unlock-stub</div>,
}))

function mockPhase(phase: AuthPhase) {
  vi.mocked(useAuthState).mockReturnValue({
    phase,
    currentStaff: phase === 'authed' ? { id: 's1', name: '', role: 'manager' } : null,
    onCenterUnlocked: vi.fn(),
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

  it('renders manager children after device authentication without rendering a manager name or staff login', () => {
    mockPhase('authed')
    render(<AppGate><div>manager-content</div></AppGate>)
    expect(screen.getByText('manager-content')).toBeDefined()
    expect(screen.queryByText('שרה')).toBeNull()
    expect(screen.queryByText('staff-login-stub')).toBeNull()
  })
})
