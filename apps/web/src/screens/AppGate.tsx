import type { ReactNode } from 'react'
import { useAuthState } from '@/hooks/useAuthState'
import { t } from '@/i18n'
import { CenterUnlock } from '@/screens/CenterUnlock'
import { StaffLogin } from '@/screens/StaffLogin'
import { AuthProvider } from '@/state/AuthContext'

/**
 * Single responsibility: top-level auth gate (client-prd §3.4). Resolves
 * GET /auth/me on mount and renders CenterUnlock → StaffLogin → children,
 * exposing the signed-in staff's identity/role to children via AuthContext —
 * `currentStaff` comes from useAuthState (seeded by `/auth/me` on load, or by
 * StaffLogin's own login response), never a caller-supplied prop.
 *
 * TODO/concern: any /auth/me failure restarts at CenterUnlock, even when only
 * the staff session expired (see useAuthState.ts) — acceptable simplification
 * for MVP per task spec, revisit once the API distinguishes the two 401s.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { phase, currentStaff, onCenterUnlocked, onLoggedIn } = useAuthState()

  if (phase === 'loading') {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-muted">
        {t('app.loading')}
      </div>
    )
  }
  if (phase === 'needs-center') return <CenterUnlock onSuccess={onCenterUnlocked} />
  if (phase === 'needs-login') return <StaffLogin onSuccess={onLoggedIn} />
  return <AuthProvider currentStaff={currentStaff}>{children}</AuthProvider>
}
