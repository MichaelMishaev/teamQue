import { t } from '@/i18n'

/** Single responsibility: a prominent, reusable route back to field selection. */
export function AllFieldsLink() {
  return (
    <a
      href="/"
      aria-label={t('settings.navigation.home')}
      className="inline-flex min-h-[72px] w-full items-center gap-3 rounded-[var(--btn-radius)] border-2 border-accent bg-accent-dim p-3 text-ink no-underline transition-colors duration-150 hover:bg-surface-2 active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span
        aria-hidden="true"
        className="flex size-[var(--touch-target-min)] shrink-0 items-center justify-center rounded-[var(--btn-radius)] bg-accent text-on-accent"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] font-bold leading-tight">{t('settings.navigation.home')}</span>
        <span className="mt-1 block text-[13px] font-medium leading-tight">{t('settings.navigation.homeHint')}</span>
      </span>
    </a>
  )
}
