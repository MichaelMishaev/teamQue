import type { ReactNode } from 'react'
import { useAuthState } from '@/hooks/useAuthState'
import { t } from '@/i18n'
import { CenterUnlock } from '@/screens/CenterUnlock'
import { StaffLogin } from '@/screens/StaffLogin'
import { AuthProvider } from '@/state/AuthContext'

/**
 * Top-level manager identity gate. It restores the center PIN followed by the
 * staff picker/PIN and renders manager surfaces only after /auth/me confirms
 * a staff or manager session.
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
