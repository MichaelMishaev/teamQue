/**
 * Single responsibility: the full-screen QR handoff surface — the staff
 * member taps the player-view button, holds the phone up, a teen scans the
 * code and lands on that field's read-only public line. The QR is generated
 * locally from the exact displayed stable URL; no external QR service or
 * stored image is involved. Two actions:
 * close (back button / Escape) and share (native sheet, clipboard fallback)
 * so the link can also be sent remotely, not only shown in person.
 */
import { useEffect, useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { showStatusToast } from '@/components/UndoToast'
import { t } from '@/i18n'
import { PUBLIC_LINE_URL } from '@/lib/route'

export function PublicLineQrOverlay({
  onClose,
  url = PUBLIC_LINE_URL,
}: {
  onClose: () => void
  url?: string
}) {
  const backRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    backRef.current?.focus()
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function share(): Promise<void> {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: t('publicLine.share.title'),
          text: t('publicLine.share.text'),
          url,
        })
        return
      }
      await navigator.clipboard.writeText(url)
      showStatusToast('publicLine.share.copied')
    } catch {
      // user dismissed the native share sheet — nothing to report
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('publicLine.qr.dialogLabel')}
      className="fixed inset-0 z-40 flex flex-col bg-bg"
    >
      <header className="flex min-h-[var(--touch-target-min)] items-center justify-between p-3">
        <button
          ref={backRef}
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1 rounded-lg px-2.5 text-[14px] font-semibold text-muted"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-4 w-4 shrink-0 rtl:-scale-x-100"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18 9 12l6-6" />
          </svg>
          <span>{t('publicLine.qr.back')}</span>
        </button>

        <button
          type="button"
          aria-label={t('publicLine.share')}
          onClick={() => void share()}
          className="inline-flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-semibold text-accent"
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
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          <span>{t('publicLine.share')}</span>
        </button>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-6 pb-14 text-center">
        <div>
          <h2 className="text-[17px] font-bold text-ink">{t('publicLine.title')}</h2>
          <p className="mt-1 text-[24px] font-bold text-ink">{t('publicLine.qr.instruction')}</p>
        </div>

        <div data-testid="public-view-qr" data-qr-value={url} className="rounded-3xl bg-white p-5 shadow-lg">
          <QRCodeSVG value={url} size={256} level="M" className="block h-64 w-64 max-w-full" aria-hidden="true" />
        </div>

        <bdi dir="ltr" className="text-[13px] text-muted tabular-nums">
          {url}
        </bdi>

        <span className="rounded-full border border-accent/50 bg-accent-dim px-4 py-1.5 text-[13px] font-semibold text-accent">
          {t('publicLine.realtime')} · {t('publicLine.readOnly')}
        </span>
      </div>
    </div>
  )
}
