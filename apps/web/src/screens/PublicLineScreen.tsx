import { useEffect, useState, type ReactNode } from 'react'
import type { FieldListItem, QueueEntryView, SessionSnapshot } from 'shared'
import { ConnectivityBanner } from '@/components/ConnectivityBanner'
import { CountdownTimer } from '@/components/CountdownTimer'
import { InstallAppButton } from '@/components/InstallAppButton'
import { Badge } from '@/components/ui/badge'
import { useCountdown } from '@/hooks/useCountdown'
import { t } from '@/i18n'
import { apiGet } from '@/lib/api'
import { buildPairGroups, computeBaseSec } from '@/lib/queue-pairing'
import { createPublicLineTelemetryTracker } from '@/lib/public-line-telemetry'
import { computeOffsetMs } from '@/lib/server-clock'
import { createSessionSocket } from '@/lib/socket'
import { formatTimeOfDay, matchCountdownInput, timerState, type RunningStatus } from '@/lib/time'
import type { ConnectionStatus } from '@/state/SnapshotContext'

/**
 * Single responsibility: the QR destination for players at Independence
 * Square. It resolves the fixed public court, reads its snapshot, and replaces
 * that snapshot from realtime events. It deliberately mounts no visitor,
 * auth, SessionActions, drag, menu, or match-control surface: queue state is
 * observable here and cannot be mutated here.
 */
const DEFAULT_COURT_NAME = t('home.create.nameDefault')
const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/KuBIAtFiMMOEbVMByJzywJ?s=cl&p=a&ilr=0&amv=0'

function socketUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin
}

function dataSavingIsRequested(): boolean {
  if (typeof navigator === 'undefined') return false
  const connection = Reflect.get(navigator, 'connection')
  return typeof connection === 'object' && connection !== null && Reflect.get(connection, 'saveData') === true
}

function shouldShowMatchAtmosphere(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !dataSavingIsRequested()
}

function useMatchAtmosphere(): boolean {
  const [enabled, setEnabled] = useState(shouldShowMatchAtmosphere)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setEnabled(!reducedMotion.matches && !dataSavingIsRequested())
    update()
    reducedMotion.addEventListener('change', update)
    return () => reducedMotion.removeEventListener('change', update)
  }, [])

  return enabled
}

export function PublicLineScreen() {
  const [telemetry] = useState(createPublicLineTelemetryTracker)
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null)
  const [slug, setSlug] = useState<string | null>(null)
  const [connection, setConnection] = useState<ConnectionStatus>('online')
  const [offsetMs, setOffsetMs] = useState(0)
  const [unavailable, setUnavailable] = useState(false)
  const [shareState, setShareState] = useState<'idle' | 'shared' | 'copied' | 'failed'>('idle')
  const matchAtmosphereEnabled = useMatchAtmosphere()

  useEffect(() => {
    const previousTitle = document.title
    document.title = t('publicLine.pageTitle')
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    const handleVisibility = () => telemetry.setVisible(document.visibilityState !== 'hidden')
    const handlePageHide = () => telemetry.finish()
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('pagehide', handlePageHide)
      telemetry.finish()
    }
  }, [telemetry])

  useEffect(() => {
    let cancelled = false
    void apiGet<FieldListItem[]>('/fields')
      .then(async (courts) => {
        const court = courts.find((candidate) => candidate.name === DEFAULT_COURT_NAME)
        if (!court) throw new Error('default court unavailable')
        const initialSnapshot = await apiGet<SessionSnapshot>(`/fields/${court.slug}`)
        return { resolvedSlug: court.slug, initialSnapshot }
      })
      .then(({ resolvedSlug, initialSnapshot }) => {
        if (cancelled) return
        setSlug(resolvedSlug)
        setSnapshot(initialSnapshot)
        setOffsetMs(computeOffsetMs(initialSnapshot.serverNow, Date.now()))
        setConnection('online')
      })
      .catch(() => {
        if (!cancelled) setUnavailable(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (slug === null) return
    let connectedOnce = false
    let resyncTimer: ReturnType<typeof setTimeout> | undefined
    const socket = createSessionSocket({
      url: socketUrl(),
      slug,
      onConnect(serverNowIso) {
        setOffsetMs(computeOffsetMs(serverNowIso, Date.now()))
        setConnection(connectedOnce ? 'resynced' : 'online')
        if (connectedOnce) {
          clearTimeout(resyncTimer)
          resyncTimer = setTimeout(() => setConnection('online'), 1500)
        }
        connectedOnce = true
      },
      onSnapshot(nextSnapshot) {
        setSnapshot(nextSnapshot)
      },
      onDisconnect() {
        setConnection('offline')
      },
    })
    return () => {
      clearTimeout(resyncTimer)
      socket.disconnect()
    }
  }, [slug])

  useEffect(() => {
    telemetry.observeConnection(connection)
  }, [connection, telemetry])

  useEffect(() => {
    if (shareState === 'idle') return
    const timer = setTimeout(() => setShareState('idle'), 2_500)
    return () => clearTimeout(timer)
  }, [shareState])

  const field = snapshot?.fields.find((candidate) => candidate.name === DEFAULT_COURT_NAME) ?? snapshot?.fields[0] ?? null
  const candidateMatch = field?.liveMatch ?? null
  const liveMatch =
    candidateMatch !== null && (candidateMatch.status === 'live' || candidateMatch.status === 'paused')
      ? candidateMatch
      : null
  const countdownInput = liveMatch
    ? matchCountdownInput(liveMatch)
    : { endsAtMs: null, pausedRemainingSec: null }
  const secondsLeft = useCountdown({ ...countdownInput, offsetMs })
  const baseSec = computeBaseSec(liveMatch !== null, secondsLeft)
  const pairGroups = buildPairGroups(
    snapshot?.queue.map((entry) => entry.id) ?? [],
    baseSec,
    snapshot?.session.matchDurationSec ?? 360,
  )
  const entryById = new Map(snapshot?.queue.map((entry) => [entry.id, entry]) ?? [])

  useEffect(() => {
    if (slug === null || snapshot === null) return
    const firstPair = pairGroups[0]
    const lastPair = pairGroups.at(-1)
    telemetry.observeSnapshot(slug, {
      queueCount: snapshot.queue.length,
      pairCount: pairGroups.length,
      hasUnpairedTeam: pairGroups.some((group) => !group.hasPartner),
      hasLiveMatch: liveMatch !== null,
      firstWaitSec: firstPair?.etaSec ?? null,
      lastWaitSec: lastPair?.etaSec ?? null,
    })
  }, [slug, snapshot, telemetry])

  async function handleShare(): Promise<void> {
    const url = `${window.location.origin}/line`
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: t('publicLine.share.title'),
          text: t('publicLine.share.text'),
          url,
        })
        setShareState('shared')
        return
      }
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setShareState('copied')
    } catch (error) {
      if (typeof error === 'object' && error !== null && Reflect.get(error, 'name') === 'AbortError') return
      setShareState('failed')
    }
  }

  const shareLabel =
    shareState === 'shared'
      ? t('publicLine.share.shared')
      : shareState === 'copied'
        ? t('publicLine.share.copied')
        : shareState === 'failed'
          ? t('publicLine.share.failed')
          : t('publicLine.share')

  if (unavailable || snapshot?.session.status === 'closed') {
    return (
      <PublicLineShell connection={connection} onShare={() => void handleShare()} shareLabel={shareLabel} shareState={shareState}>
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p role="alert" className="max-w-sm text-[15px] font-semibold text-muted">
            {t('publicLine.unavailable')}
          </p>
        </div>
      </PublicLineShell>
    )
  }

  if (snapshot === null || field === null) {
    return (
      <PublicLineShell connection={connection} onShare={() => void handleShare()} shareLabel={shareLabel} shareState={shareState}>
        <div className="flex flex-1 items-center justify-center p-6">
          <p role="status" className="text-[14px] text-muted">
            {t('app.loading')}
          </p>
        </div>
      </PublicLineShell>
    )
  }

  return (
    <PublicLineShell connection={connection} onShare={() => void handleShare()} shareLabel={shareLabel} shareState={shareState}>
      <main className="flex flex-col gap-3 px-3 py-3 sm:gap-5 sm:px-6 sm:py-5">
        <section
          aria-labelledby="public-line-current-title"
          className={
            liveMatch
              ? 'relative isolate overflow-hidden rounded-[var(--fieldcard-radius)] border-[1.5px] border-accent bg-surface p-3 sm:p-5'
              : 'relative isolate overflow-hidden rounded-[var(--fieldcard-radius)] border-[1.5px] border-dashed border-line bg-surface p-3 sm:p-5'
          }
        >
          {liveMatch && matchAtmosphereEnabled && (
            <>
              <video
                data-testid="public-line-match-atmosphere"
                aria-hidden="true"
                tabIndex={-1}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-80"
              >
                <source src="/media/public-line-match-atmosphere.mp4" type="video/mp4" />
              </video>
              <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-surface/50" />
            </>
          )}

          <div className="relative z-10">
            <div className="mb-2 flex items-center justify-between gap-3 sm:mb-4">
              <div className="flex items-center gap-2">
                <Badge state={liveMatch ? 'live' : 'free'}>
                  {liveMatch ? t('field.state.live') : t('field.state.free')}
                </Badge>
                <h2 id="public-line-current-title" className="text-[13px] font-semibold text-muted">
                  {t('publicLine.current')}
                </h2>
              </div>
              {liveMatch && (
                <CountdownTimer
                  secondsLeft={secondsLeft}
                  state={timerState(liveMatch.status as RunningStatus, secondsLeft)}
                />
              )}
            </div>

            {liveMatch ? (
              <>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                  <PlayerName name={liveMatch.captainA.name} />
                  <span className="text-[12px] font-semibold text-muted">{t('match.vs')}</span>
                  <PlayerName name={liveMatch.captainB.name} />
                </div>
                {liveMatch.startedAt && (
                  <p className="mt-2 text-center text-[11.5px] text-muted sm:mt-4 sm:text-[12.5px]">
                    {t('publicLine.current.startedAt')}{' '}
                    <bdi dir="ltr" className="tabular font-mono text-ink">
                      {formatTimeOfDay(liveMatch.startedAt)}
                    </bdi>
                  </p>
                )}
              </>
            ) : (
              <p className="text-center text-[15px] font-semibold text-muted">{t('publicLine.current.empty')}</p>
            )}
          </div>
        </section>

        <section
          aria-labelledby="public-line-community-title"
          className="flex flex-col gap-3 rounded-xl border border-accent/50 bg-surface p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4"
        >
          <div className="min-w-0">
            <h2 id="public-line-community-title" className="text-[15px] font-bold text-ink sm:text-[16px]">
              {t('publicLine.community.title')}
            </h2>
            <p id="public-line-community-description" className="mt-1 text-[12.5px] leading-relaxed text-muted sm:text-[13px]">
              {t('publicLine.community.description')}
            </p>
          </div>
          <a
            href={WHATSAPP_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-describedby="public-line-community-description"
            className="inline-flex min-h-[var(--touch-target-min)] w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-accent bg-accent px-4 text-[14px] font-bold text-on-accent transition-colors hover:bg-accent/90 active:bg-accent-dim sm:w-auto"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              data-testid="public-line-whatsapp-logo"
              className="h-5 w-5 shrink-0"
              fill="currentColor"
            >
              <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.07c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35ZM12.05 21.79h-.01a9.87 9.87 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.89-9.88 2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.9 6.99c0 5.45-4.44 9.88-9.89 9.88ZM20.46 3.49A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.69 1.45c6.55 0 11.89-5.34 11.89-11.89 0-3.18-1.23-6.17-3.48-8.42Z" />
            </svg>
            <span>{t('publicLine.community.cta')}</span>
          </a>
        </section>

        <section aria-labelledby="public-line-queue-title" className="flex flex-col gap-2 sm:gap-3">
          <header className="flex items-end justify-between gap-3">
            <div>
              <h2 id="public-line-queue-title" className="text-[17px] font-bold tracking-tight sm:text-[19px]">
                {t('publicLine.queue.title', { count: snapshot.queue.length })}
              </h2>
              <p className="text-[11.5px] text-muted sm:mt-0.5 sm:text-[12.5px]">{t('publicLine.queue.subtitle')}</p>
            </div>
            <span className="text-[11px] font-semibold text-muted">{t('publicLine.realtime')}</span>
          </header>

          {pairGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center text-sm text-muted">
              {t('publicLine.queue.empty')}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-line bg-surface">
              <p className="border-b border-line bg-surface-2 px-3 py-1.5 text-[10.5px] font-semibold text-accent sm:px-4 sm:text-[11.5px]">
                {t('publicLine.queue.gamesRemaining')}
              </p>
              <ol className="relative">
                <span aria-hidden="true" className="absolute inset-y-5 start-8 z-0 w-px bg-accent/60 sm:start-9" />
                {pairGroups.map((group) => {
                  const entries = group.entryIds
                    .map((id) => entryById.get(id))
                    .filter((entry): entry is QueueEntryView => entry !== undefined)
                  const isNext = group.pairIndex === 0 && group.hasPartner
                  const gamesRemaining = group.gamesAhead + (liveMatch === null ? 0 : 1)
                  const gamesRemainingLabel =
                    gamesRemaining === 0
                      ? t('publicLine.pair.next')
                      : gamesRemaining === 1
                        ? t('publicLine.pair.gamesAheadOne')
                        : t('publicLine.pair.gamesAheadMany', { count: gamesRemaining })
                  const etaMinutes = Math.ceil(group.etaSec / 60)
                  return (
                    <li
                      key={group.entryIds[0]}
                      className={
                        isNext
                          ? 'relative grid min-h-[76px] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-accent/40 bg-accent-dim/20 px-3 py-1.5 last:border-b-0 sm:min-h-[82px] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-4'
                          : 'relative grid min-h-[72px] grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-line px-3 py-1.5 last:border-b-0 sm:min-h-[78px] sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-4'
                      }
                    >
                      <bdi
                        dir="ltr"
                        data-testid="public-line-games-remaining"
                        aria-label={gamesRemainingLabel}
                        className={
                          isNext
                            ? 'relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-accent bg-accent font-mono text-[14px] font-bold tabular text-on-accent sm:size-9 sm:text-[15px]'
                            : 'relative z-10 flex size-8 items-center justify-center rounded-full border-2 border-accent bg-surface font-mono text-[14px] font-bold tabular text-accent sm:size-9 sm:text-[15px]'
                        }
                      >
                        {gamesRemaining}
                      </bdi>

                      <div className="min-w-0">
                        {isNext && (
                          <span className="mb-0.5 inline-flex rounded-full bg-accent-dim px-2 py-0.5 text-[10px] font-bold text-accent">
                            {t('publicLine.pair.next')}
                          </span>
                        )}
                        {group.hasPartner ? (
                          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-1.5 text-center">
                            {entries[0] && <QueuedPlayer entry={entries[0]} />}
                            <span className="text-[10.5px] font-semibold text-accent sm:text-[12px]">
                              {t('match.vs')}
                            </span>
                            {entries[1] && <QueuedPlayer entry={entries[1]} />}
                          </div>
                        ) : (
                          entries[0] && (
                            <div className="min-w-0 text-center">
                              <QueuedPlayer entry={entries[0]} />
                              <p className="text-[10px] text-muted sm:text-[11.5px]">
                                {t('publicLine.pair.waitingForOpponent')}
                              </p>
                            </div>
                          )
                        )}
                      </div>

                      <div className="flex min-w-[4.5rem] shrink-0 justify-end">
                        {group.etaSec === 0 ? (
                          <span className="whitespace-nowrap text-[13px] font-bold text-accent sm:text-[15px]">
                            {t('publicLine.pair.startsNow')}
                          </span>
                        ) : (
                          <span className="flex items-baseline whitespace-nowrap text-accent">
                            <span className="text-[11px] font-semibold sm:text-[12px]">
                              {t('publicLine.pair.etaApproxPrefix')}
                            </span>
                            <bdi dir="ltr" className="tabular font-mono text-[17px] font-bold sm:text-[19px]">
                              {etaMinutes}
                            </bdi>
                            <span className="ms-1 text-[10.5px] font-semibold sm:text-[12px]">
                              {t('queue.pair.etaSuffixMinutes')}
                            </span>
                          </span>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </section>

      </main>
    </PublicLineShell>
  )
}

function PublicLineShell({
  connection,
  children,
  onShare,
  shareLabel,
  shareState,
}: {
  connection: ConnectionStatus
  children: ReactNode
  onShare: () => void
  shareLabel: string
  shareState: 'idle' | 'shared' | 'copied' | 'failed'
}) {
  const shareClass =
    shareState === 'shared' || shareState === 'copied'
      ? 'border-accent bg-accent-dim text-accent'
      : shareState === 'failed'
        ? 'border-danger bg-surface text-danger'
        : 'border-line bg-surface-2 text-ink'

  return (
    <div className="relative isolate mx-auto flex min-h-dvh w-full max-w-3xl flex-col overflow-hidden bg-bg">
      <div
        data-testid="public-line-kids-background"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-[length:100%_auto] bg-top bg-repeat-y opacity-90"
        style={{ backgroundImage: 'url(/media/public-line-kids-background.webp)' }}
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 bg-bg/25" />
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
              <h1 className="truncate text-[18px] font-bold tracking-tight">{t('publicLine.title')}</h1>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[12px] font-semibold text-muted">{DEFAULT_COURT_NAME}</p>
              <Badge state="free" className="shrink-0">
                {t('publicLine.readOnly')}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={onShare}
              aria-label={shareLabel}
              title={shareLabel}
              className={`inline-flex min-h-[var(--touch-target-min)] items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold transition-colors ${shareClass}`}
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
                <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" />
                <path d="M5 11v8h14v-8" />
              </svg>
              <span aria-live="polite">{shareLabel}</span>
            </button>
            <InstallAppButton showWhenInstalled />
          </div>
        </div>
        <div className="mt-2">
          <ConnectivityBanner status={connection} />
        </div>
      </header>
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </div>
  )
}

function PlayerName({ name }: { name: string }) {
  return <p className="min-w-0 break-words text-[18px] font-bold tracking-tight text-ink sm:text-[24px]">{name}</p>
}

function QueuedPlayer({ entry }: { entry: QueueEntryView }) {
  return (
    <p className="min-w-0 truncate text-[15.5px] font-bold text-ink sm:text-[17px]">{entry.team.name}</p>
  )
}
