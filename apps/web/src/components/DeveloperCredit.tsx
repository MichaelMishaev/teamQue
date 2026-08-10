import { t } from '@/i18n'

/** Single responsibility: a quiet, accessible developer attribution link. */
export function DeveloperCredit() {
  return (
    <footer className="shrink-0 px-4 py-2 text-center text-[12.5px] text-muted">
      <span>{t('developerCredit.prefix')}</span>{' '}
      <a
        href="https://msx.co.il"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[var(--touch-target-min)] items-center text-accent underline underline-offset-4"
      >
        <bdi dir="ltr">{t('developerCredit.linkLabel')}</bdi>
      </a>
    </footer>
  )
}
