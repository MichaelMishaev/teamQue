import { useEffect, useState } from 'react'
import youthCityNetanya from '@/assets/youth-city-netanya-summer-2026.webp'
import { CourtRow } from '@/components/CourtRow'
import { CreateCourtSheet } from '@/components/CreateCourtSheet'
import { EmptyState } from '@/components/EmptyState'
import { PublicLineQrOverlay } from '@/components/PublicLineQrOverlay'
import { showStatusToast, UndoToaster } from '@/components/UndoToast'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { ApiRequestError, apiGet, apiPost } from '@/lib/api'
import { navigateToField, PUBLIC_LINE_URL } from '@/lib/route'
import type { FieldListItem, SessionSnapshot } from 'shared'

/**
 * Single responsibility: the court list at '/' — lists active courts, guarantees
 * the Independence Square default exists, opens a court on tap and creates new
 * ones (2026-07-17 courts-landing-page spec).
 */
const DEFAULT_MATCH_DURATION_SEC = 360

interface LoadResult {
  courts: FieldListItem[]
  /** True when the default court is missing AND re-creating it failed. */
  defaultFailed: boolean
}

/** Shared across StrictMode double-mount so we don't create two default fields. */
let loadPromise: Promise<LoadResult> | null = null

/**
 * The default court is a guarantee, not a seed: if no *active* court carries the
 * default name we re-create it, including after someone closed it. A failed
 * re-create degrades to a notice — it must not cost the user the courts that do
 * exist.
 */
async function loadCourts(): Promise<LoadResult> {
  const defaultName = t('home.create.nameDefault')
  const list = await apiGet<FieldListItem[]>('/fields')
  if (list.some((court) => court.name === defaultName)) return { courts: list, defaultFailed: false }

  try {
    await apiPost<{ slug: string; snapshot: SessionSnapshot }>('/fields', {
      name: defaultName,
      matchDurationSec: DEFAULT_MATCH_DURATION_SEC,
    })
  } catch {
    return { courts: list, defaultFailed: true }
  }
  return { courts: await apiGet<FieldListItem[]>('/fields'), defaultFailed: false }
}

function loadCourtsOnce(): Promise<LoadResult> {
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

export function HomeScreen() {
  const [courts, setCourts] = useState<FieldListItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [defaultFailed, setDefaultFailed] = useState(false)
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
    let cancelled = false
    void loadCourtsOnce()
      .then((result) => {
        if (cancelled) return
        setCourts(pinDefaultFirst(result.courts))
        setDefaultFailed(result.defaultFailed)
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('home.load.error'))
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function createCourt(name: string): Promise<void> {
    setCreating(true)
    setCreateError(null)
    try {
      const created = await apiPost<{ slug: string; snapshot: SessionSnapshot }>('/fields', {
        name,
        matchDurationSec: DEFAULT_MATCH_DURATION_SEC,
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
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
              <circle cx="12" cy="12" r="2.5" />
            </svg>
            <span>{t('publicLine.openPlayerView')}</span>
          </button>
        )}
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

      {defaultFailed && (
        <p role="alert" className="text-[13px] font-semibold text-warn">
          {t('home.default.error')}
        </p>
      )}

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
        onSubmit={(name) => void createCourt(name)}
        error={createError}
        busy={creating}
      />

      {qrOpen && <PublicLineQrOverlay onClose={() => setQrOpen(false)} />}
      <UndoToaster />
    </div>
  )
}
