import { usePwaInstall } from '@/hooks/usePwaInstall'
import { t } from '@/i18n'

/** Single responsibility: header control that triggers the native PWA install prompt when the browser makes one available. */
export function InstallAppButton() {
  const { canInstall, promptInstall } = usePwaInstall()
  if (!canInstall) return null

  return (
    <button
      type="button"
      onClick={() => {
        void promptInstall()
      }}
      aria-label={t('app.install')}
      title={t('app.install')}
      className="inline-flex min-h-[var(--touch-target-min)] items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-dim px-2.5 text-[12.5px] font-bold text-accent shadow-sm transition-colors hover:bg-surface-2 active:bg-surface"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-4 w-4 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <path d="M12 7v6M9 10h6M10 17h4" />
      </svg>
      <span>{t('app.install.short')}</span>
    </button>
  )
}
