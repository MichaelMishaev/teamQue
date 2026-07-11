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
      className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-full bg-surface-2 text-[15px] text-ink"
    >
      ⬇
    </button>
  )
}
