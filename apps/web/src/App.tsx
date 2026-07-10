import { useEffect, useState } from 'react'
import { ConnectivityBanner } from '@/components/ConnectivityBanner'
import { UndoToaster } from '@/components/UndoToast'
import { ActivityFeed } from '@/screens/ActivityFeed'
import { HistoryScreen } from '@/screens/HistoryScreen'
import { MainScreen } from '@/screens/MainScreen'
import { SettingsScreen } from '@/screens/SettingsScreen'
import { SwitchUser } from '@/screens/SwitchUser'
import { t, type MessageKey } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatTimeOfDay } from '@/lib/time'
import { useCurrentStaff } from '@/state/AuthContext'
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

export default function App() {
  const { connection, offsetMs } = useSnapshot()
  const currentStaff = useCurrentStaff()
  const [tab, setTab] = useState<Tab>('main')
  const [switchUserOpen, setSwitchUserOpen] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const clock = formatTimeOfDay(new Date(nowMs + offsetMs).toISOString())

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-bg/95 p-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setSwitchUserOpen(true)}
            className="flex min-h-[var(--touch-target-min)] items-center gap-1.5 rounded-full bg-surface-2 px-3 text-[13.5px] font-semibold"
          >
            ○ {currentStaff?.name ?? ''}
          </button>
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
          <bdi dir="ltr" className="tabular text-[13.5px] font-semibold text-muted">
            {clock}
          </bdi>
        </div>
        <ConnectivityBanner status={connection} />
      </header>

      <main className="flex flex-1 flex-col">
        {tab === 'main' && <MainScreen />}
        {tab === 'history' && <HistoryScreen />}
        {tab === 'activity' && <ActivityFeed />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      <SwitchUser open={switchUserOpen} onClose={() => setSwitchUserOpen(false)} />
      <UndoToaster />
    </div>
  )
}
