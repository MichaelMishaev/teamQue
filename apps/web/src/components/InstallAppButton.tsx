import { usePwaInstall } from '@/hooks/usePwaInstall'
import { t } from '@/i18n'
import { showStatusToast } from './UndoToast'

interface InstallAppButtonProps {
  /** Keeps the browser affordance visible when another installed copy already exists. */
  showWhenInstalled?: boolean
  /** Uses an icon-only treatment for space-constrained headers. */
  compact?: boolean
}

/** Single responsibility: header control that triggers the native PWA install prompt when the browser makes one available. */
export function InstallAppButton({ showWhenInstalled = false, compact = false }: InstallAppButtonProps) {
  const { isInstalled, promptInstall } = usePwaInstall()
  if (isInstalled && !showWhenInstalled) return null

  return (
    <button
      type="button"
      onClick={() => {
        void promptInstall().then((prompted) => {
          if (!prompted) showStatusToast('app.install.fallback')
        })
      }}
      aria-label={t('app.install')}
      title={t('app.install')}
      className={
        compact
          ? 'inline-flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:bg-surface'
          : 'inline-flex min-h-[var(--touch-target-min)] items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-dim px-2.5 text-[12.5px] font-bold text-accent shadow-sm transition-colors hover:bg-surface-2 active:bg-surface'
      }
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={compact ? 'h-[18px] w-[18px] shrink-0' : 'h-4 w-4 shrink-0'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M12 7v6M9 10h6M10 17h4" />
      </svg>
      {!compact && <span>{t('app.install.short')}</span>}
    </button>
  )
}
