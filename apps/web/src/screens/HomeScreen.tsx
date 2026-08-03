import { useEffect, useState } from 'react'
import youthCityNetanya from '@/assets/youth-city-netanya-summer-2026.webp'
import { CourtRow } from '@/components/CourtRow'
import { CreateCourtSheet } from '@/components/CreateCourtSheet'
import { EmptyState } from '@/components/EmptyState'
import { InstallAppButton } from '@/components/InstallAppButton'
import { PublicLineQrOverlay } from '@/components/PublicLineQrOverlay'
import { showStatusToast, UndoToaster } from '@/components/UndoToast'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { ApiRequestError, apiGet, apiPost } from '@/lib/api'
import { navigateToField, PUBLIC_LINE_URL } from '@/lib/route'
import type { FieldListItem, SessionSnapshot } from 'shared'

/**
 * Single responsibility: the public court list at '/' — revokes remembered
 * field access, lists active courts, opens a court on tap and creates new ones
 * for callers that already hold a manager session.
 */
const DEFAULT_MATCH_DURATION_SEC = 360

/** Shared across StrictMode double-mount so we don't create two default fields. */
let loadPromise: Promise<FieldListItem[]> | null = null

/**
 * Returning to the public landing screen is the explicit field-lock boundary.
 * Revoke every remembered field-access cookie before asking the public landing
 * endpoint for cards, so opening a protected field again requires its password.
 */
async function loadCourts(): Promise<FieldListItem[]> {
  await apiPost<unknown>('/fields/lock-all')
  return apiGet<FieldListItem[]>('/fields/landing')
}

function loadCourtsOnce(): Promise<FieldListItem[]> {
  if (loadPromise === null) loadPromise = loadCourts()
  return loadPromise
}

/**
 * GET /fields orders by createdAt DESC, so the default — being the oldest — would
 * sink below every court staff create. Partitioning (rather than sorting) keeps
 * the API's recency order intact within each group.
 */
function pinDefaultFirst(courts: FieldListItem[]): FieldListItem[] {
  const defaultName = t('home.create.nameDefault')
  return [
    ...courts.filter((court) => court.name === defaultName),
    ...courts.filter((court) => court.name !== defaultName),
  ]
}

/** Test-only: reset the in-flight guard between cases. */
export function resetHomeScreenOpenGuardForTests(): void {
  loadPromise = null
}

interface HomeScreenProps {
  /** Local-demo courts let the '/' route stay usable without an API server. */
  initialCourts?: FieldListItem[]
  createDemoField?: (name: string, password?: string) => Promise<string>
}

export function HomeScreen({ initialCourts, createDemoField }: HomeScreenProps) {
  const [courts, setCourts] = useState<FieldListItem[] | null>(() => initialCourts ?? null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)

  // Copy-then-show, not navigate (2026-07-23 qr-handoff-overlay spec): the
  // staff device stays on the court list; the teen scans the public URL.
  async function showPlayerViewQr(): Promise<void> {
    setQrOpen(true)
    try {
      await navigator.clipboard.writeText(PUBLIC_LINE_URL)
      showStatusToast('publicLine.openPlayerView.copied')
    } catch {
      showStatusToast('publicLine.openPlayerView.copyFailed')
    }
  }

  useEffect(() => {
    if (initialCourts !== undefined) return
    let cancelled = false
    void loadCourtsOnce()
      .then((loadedCourts) => {
        if (cancelled) return
        setCourts(pinDefaultFirst(loadedCourts))
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('home.load.error'))
      })
    return () => {
      cancelled = true
    }
  }, [initialCourts])

  async function createCourt(name: string, password?: string): Promise<void> {
    setCreating(true)
    setCreateError(null)
    try {
      if (createDemoField !== undefined) {
        navigateToField(await createDemoField(name, password))
        return
      }
      const created = await apiPost<{ slug: string; snapshot: SessionSnapshot }>('/fields', {
        name,
        matchDurationSec: DEFAULT_MATCH_DURATION_SEC,
        ...(password === undefined ? {} : { password }),
      })
      // Straight into the court just created — it was made to be used. Navigation
      // is a full page load, so `creating` deliberately stays true.
      navigateToField(created.slug)
    } catch (cause) {
      setCreateError(
        cause instanceof ApiRequestError && cause.code === 'RATE_LIMITED'
          ? t('home.create.rateLimited')
          : t('home.create.error'),
      )
      setCreating(false)
    }
  }

  if (loadError !== null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-4 text-center">
        <p role="alert" className="text-[13.5px] font-semibold text-danger">
          {loadError}
        </p>
      </div>
    )
  }

  if (courts === null) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center p-4">
        <p role="status" className="text-[14px] text-muted">
          {t('app.loading')}
        </p>
      </div>
    )
  }

  const hasPublicPlayerView = courts.some((court) => court.name === t('home.create.nameDefault'))

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
      <header className="flex min-h-[var(--touch-target-min)] items-center justify-between gap-3">
        <h1 className="text-[19px] font-bold text-ink">{t('home.title')}</h1>
        <div className="flex min-w-0 items-center gap-2">
          <InstallAppButton />
          {hasPublicPlayerView && (
            <button
              type="button"
              aria-label={t('publicLine.qr.dialogLabel')}
              title={t('publicLine.qr.dialogLabel')}
              onClick={() => void showPlayerViewQr()}
              className="inline-flex min-h-[var(--touch-target-min)] shrink-0 items-center gap-1.5 rounded-lg border border-accent bg-accent-dim px-3 text-[12.5px] font-bold text-accent transition-colors hover:bg-surface-2 active:bg-surface"
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
                <rect x="3" y="3" width="6" height="6" rx="1" />
                <rect x="15" y="3" width="6" height="6" rx="1" />
                <rect x="3" y="15" width="6" height="6" rx="1" />
                <path d="M15 15h2v2m4 0v.01M15 21h2m4-6v6h-2" />
              </svg>
              <span>{t('publicLine.openPlayerView')}</span>
            </button>
          )}
        </div>
      </header>

      <section className="relative aspect-[2/1] overflow-hidden rounded-xl border border-line bg-surface">
        <img
          src={youthCityNetanya}
          alt={t('home.hero.alt')}
          width={1200}
          height={600}
          decoding="async"
          fetchPriority="high"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg/95 via-bg/15 to-transparent" aria-hidden="true" />
        <div className="absolute inset-0 flex flex-col justify-end p-4">
          <h2 className="text-[21px] font-bold text-ink">{t('home.hero.title')}</h2>
          <p className="mt-0.5 text-[13px] font-semibold text-muted">{t('home.hero.meta')}</p>
        </div>
      </section>

      {courts.length === 0 ? (
        <EmptyState icon="⚽" title={t('home.empty.title')} hint={t('home.empty.hint')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {courts.map((court) => (
            <li key={court.slug}>
              <CourtRow court={court} onOpen={navigateToField} />
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="ghost"
        onClick={() => setSheetOpen(true)}
        className="min-h-[var(--touch-target-min)] self-stretch border-dashed border-line"
      >
        {t('home.create.action')}
      </Button>

      <CreateCourtSheet
        open={sheetOpen}
        onClose={() => {
          setSheetOpen(false)
          setCreateError(null)
        }}
        onSubmit={(name, password) => void createCourt(name, password)}
        error={createError}
        busy={creating}
      />

      {qrOpen && <PublicLineQrOverlay onClose={() => setQrOpen(false)} />}
      <UndoToaster />
    </div>
  )
}
