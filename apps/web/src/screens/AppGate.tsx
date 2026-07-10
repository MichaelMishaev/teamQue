import type { ReactNode } from 'react'
import { useAuthState } from '@/hooks/useAuthState'
import { t } from '@/i18n'
import { AuthProvider } from '@/state/AuthContext'

/**
 * Single responsibility: top-level identity gate. Auth is open (no PIN) — the
 * API's GET /auth/me always resolves to a real identity (the seeded center's
 * manager by default, or a SwitchUser-selected staff member), so this shows a
 * brief loading state, then renders children under AuthProvider seeded with
 * whatever /auth/me returned. It only blocks on the pathological case where
 * /auth/me can't resolve at all (network failure / empty DB), showing an error.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { phase, currentStaff } = useAuthState()

  if (phase === 'loading') {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-muted">
        {t('app.loading')}
      </div>
    )
  }
  if (phase === 'error') {
    return (
      <div role="alert" className="flex min-h-dvh items-center justify-center p-6 text-center text-danger">
        {t('app.loadError')}
      </div>
    )
  }
  return <AuthProvider currentStaff={currentStaff}>{children}</AuthProvider>
}
