import type { ReactNode } from 'react'
import { useAuthState } from '@/hooks/useAuthState'
import { t } from '@/i18n'
import { AuthProvider } from '@/state/AuthContext'

/**
 * Top-level manager bootstrap. Opens a trusted manager session with no
 * center PIN screen; personal staff names and PINs stay absent.
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
  if (phase === 'error' || !currentStaff) {
    return (
      <div role="alert" className="flex min-h-dvh items-center justify-center text-danger">
        {t('app.loadError')}
      </div>
    )
  }
  return <AuthProvider currentStaff={currentStaff}>{children}</AuthProvider>
}
