import { useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ConnectivityBanner } from '@/components/ConnectivityBanner'
import { IntroSplash } from '@/components/IntroSplash'
import { showStatusToast, UndoToaster } from '@/components/UndoToast'
import { useAppTabNavigation } from '@/hooks/useAppTabNavigation'
import { ActivityFeed } from '@/screens/ActivityFeed'
import { ClosedFieldScreen } from '@/screens/ClosedFieldScreen'
import { HistoryScreen } from '@/screens/HistoryScreen'
import { MainScreen } from '@/screens/MainScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { SwitchUser } from '@/screens/SwitchUser'
import { t, type MessageKey } from '@/i18n'
import { APP_TABS, type AppTab } from '@/lib/app-tab-route'
import { cn } from '@/lib/cn'
import { fieldUrl } from '@/lib/route'
import { formatTimeOfDay } from '@/lib/time'
import { useSnapshot } from '@/state/SnapshotContext'

/**
 * Single responsibility: the app shell — top bar (user chip, tabs, clock,
 * ConnectivityBanner) shared by every tab, plus the SwitchUser overlay and
 * the global UndoToaster (client-prd §3.1). Which screen renders per tab is
 * the only thing that changes below the header. useAppTabNavigation owns the
 * URL-backed destination and one-entry Android/browser Back contract (US-074).
 */
const TAB_LABEL_KEYS = {
  main: 'tabs.main',
  history: 'tabs.history',
  activity: 'tabs.activity',
  settings: 'tabs.settings',
} satisfies Record<AppTab, MessageKey>

function isUnmodifiedPrimaryClick(event: ReactMouseEvent<HTMLAnchorElement>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export default function App({ slug = '' }: { slug?: string }) {
  const { snapshot, connection, offsetMs } = useSnapshot()
  const { tab, hrefFor, selectTab } = useAppTabNavigation()
  const [switchUserOpen, setSwitchUserOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const clock = formatTimeOfDay(new Date(nowMs + offsetMs).toISOString())
  const hasPublicPlayerView = tab === 'main' && snapshot?.fields[0]?.name === t('home.create.nameDefault')

  async function handleShare(): Promise<void> {
    const url = window.location.origin + fieldUrl(slug)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ url })
        return
      }
      await navigator.clipboard.writeText(url)
      showStatusToast('field.share.copied')
    } catch {
      // user dismissed the share sheet — nothing to report
    }
  }

  async function copyPlayerViewLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/line`)
      showStatusToast('publicLine.openPlayerView.copied')
    } catch {
      showStatusToast('publicLine.openPlayerView.copyFailed')
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <IntroSplash />
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-bg/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <nav aria-label={t('tabs.navigationLabel')} className="flex items-center gap-1">
            {APP_TABS.map((id) => (
              <a
                key={id}
                href={hrefFor(id)}
                aria-current={tab === id ? 'page' : undefined}
                onClick={(event) => {
                  if (!isUnmodifiedPrimaryClick(event)) return
                  event.preventDefault()
                  selectTab(id)
                }}
                className={cn(
                  'inline-flex min-h-[var(--touch-target-min)] items-center rounded-lg px-2.5 text-[13px] no-underline',
                  tab === id ? 'bg-accent-dim font-bold text-accent' : 'font-semibold text-muted',
                )}
              >
                {t(TAB_LABEL_KEYS[id])}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            {hasPublicPlayerView && (
              <button
                type="button"
                aria-label={t('publicLine.openPlayerView.copyLink')}
                title={t('publicLine.openPlayerView.copyLink')}
                onClick={() => void copyPlayerViewLink()}
                className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-lg text-muted"
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
                  <rect x="8" y="8" width="13" height="13" rx="2" />
                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                </svg>
              </button>
            )}
            {slug !== '' && (
              <button
                type="button"
                aria-label={t('field.share')}
                onClick={() => void handleShare()}
                className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-lg text-muted"
              >
                ↗
              </button>
            )}
            <bdi dir="ltr" className="tabular text-[13.5px] font-semibold text-muted">
              {clock}
            </bdi>
          </div>
        </div>
        <ConnectivityBanner status={connection} />
      </header>

      <main className="flex flex-1 flex-col">
        {snapshot?.session.status === 'closed' && tab === 'main' ? (
          <ClosedFieldScreen />
        ) : (
          <>
            {tab === 'main' && <MainScreen />}
            {tab === 'history' && <HistoryScreen />}
            {tab === 'activity' && <ActivityFeed />}
            {tab === 'settings' && <SettingsScreen />}
          </>
        )}
      </main>

      <SwitchUser open={switchUserOpen} onClose={() => setSwitchUserOpen(false)} />
      <UndoToaster />
    </div>
  )
}
