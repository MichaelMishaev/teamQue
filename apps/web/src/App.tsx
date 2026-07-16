import { useEffect, useState } from 'react'
import { ConnectivityBanner } from '@/components/ConnectivityBanner'
import { InstallAppButton } from '@/components/InstallAppButton'
import { IntroSplash } from '@/components/IntroSplash'
import { showStatusToast, UndoToaster } from '@/components/UndoToast'
import { ActivityFeed } from '@/screens/ActivityFeed'
import { ClosedFieldScreen } from '@/screens/ClosedFieldScreen'
import { HistoryScreen } from '@/screens/HistoryScreen'
import { MainScreen } from '@/screens/MainScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { SwitchUser } from '@/screens/SwitchUser'
import { t, type MessageKey } from '@/i18n'
import { cn } from '@/lib/cn'
import { fieldUrl } from '@/lib/route'
import { formatTimeOfDay } from '@/lib/time'
import { useSnapshot } from '@/state/SnapshotContext'

/**
 * Single responsibility: the app shell — top bar (user chip, tabs, clock,
 * ConnectivityBanner) shared by every tab, plus the SwitchUser overlay and
 * the global UndoToaster (client-prd §3.1). Which screen renders per tab is
 * the only thing that changes below the header.
 */
type Tab = 'main' | 'history' | 'activity' | 'settings'

const TABS: { id: Tab; labelKey: MessageKey }[] = [
  { id: 'main', labelKey: 'tabs.main' },
  { id: 'history', labelKey: 'tabs.history' },
  { id: 'activity', labelKey: 'tabs.activity' },
  { id: 'settings', labelKey: 'tabs.settings' },
]

export default function App({ slug = '' }: { slug?: string }) {
  const { snapshot, connection, offsetMs } = useSnapshot()
  const [tab, setTab] = useState<Tab>('main')
  const [switchUserOpen, setSwitchUserOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const clock = formatTimeOfDay(new Date(nowMs + offsetMs).toISOString())

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

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <IntroSplash />
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-bg/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <nav className="flex items-center gap-1">
            {TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'min-h-[var(--touch-target-min)] rounded-lg px-2.5 text-[13px] font-semibold',
                  tab === id ? 'bg-accent-dim text-accent' : 'text-muted',
                )}
              >
                {t(labelKey)}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
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
            <InstallAppButton />
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
