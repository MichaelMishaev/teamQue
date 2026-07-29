import type { ReactNode } from 'react'
import { useAuthState } from '@/hooks/useAuthState'
import { t } from '@/i18n'
import { CenterUnlock } from '@/screens/CenterUnlock'
import { AuthProvider } from '@/state/AuthContext'

/**
 * Top-level trusted-device gate. It renders manager surfaces only after the
 * shared center credential has produced a manager session; personal staff
 * names and PINs are intentionally absent.
 */
export function AppGate({ children }: { children: ReactNode }) {
  const { phase, currentStaff, onCenterUnlocked } = useAuthState()

  if (phase === 'loading') {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-muted">
        {t('app.loading')}
      </div>
    )
  }
  if (phase === 'needs-center') return <CenterUnlock onSuccess={onCenterUnlocked} />
  return <AuthProvider currentStaff={currentStaff}>{children}</AuthProvider>
}
