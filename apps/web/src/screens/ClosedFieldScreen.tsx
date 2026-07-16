import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { t } from '@/i18n'
import { navigateHome } from '@/lib/route'

/**
 * Single responsibility: terminal state of a field link (open-fields spec
 * §5.3) — the field is closed; offer the way back to creating or finding
 * another. Final history stays reachable via the history tab (App.tsx keeps
 * tabs mounted; this replaces only the main tab).
 */
export function ClosedFieldScreen() {
  return (
    <div className="p-4">
      <EmptyState
        icon="🏁"
        title={t('field.closed.title')}
        hint={t('field.closed.hint')}
        action={
          <Button variant="primary" className="min-w-44" onClick={() => navigateHome()}>
            {t('field.closed.cta')}
          </Button>
        }
      />
    </div>
  )
}
