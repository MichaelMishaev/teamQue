import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { t } from '@/i18n'
import { apiGet, apiPost } from '@/lib/api'
import { navigateToField } from '@/lib/route'
import type { FieldListItem, SessionSnapshot } from 'shared'

/**
 * Single responsibility: the public home (open-fields spec §5.1) — hero
 * "open a field" CTA above the live list of active fields. Creating asks
 * only name + duration, then navigates to the new field's URL. The list
 * refreshes on a 15s interval (no socket here — the field rooms are
 * per-session; polling a public list is the simple correct tool).
 */
const LIST_REFRESH_MS = 15_000
const MIN_MINUTES = 1
const MAX_MINUTES = 60
const DEFAULT_MINUTES = 6

export function HomeScreen() {
  const [fields, setFields] = useState<FieldListItem[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh(): Promise<void> {
      try {
        const list = await apiGet<FieldListItem[]>('/fields')
        if (!cancelled) setFields(list)
      } catch {
        if (!cancelled) setFields((prev) => prev ?? [])
      }
    }
    void refresh()
    const id = setInterval(() => void refresh(), LIST_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiPost<{ slug: string; snapshot: SessionSnapshot }>('/fields', {
        name: trimmed,
        matchDurationSec: minutes * 60,
      })
      navigateToField(created.slug)
    } catch {
      setError(t('home.create.error'))
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <header className="flex flex-col gap-1 pt-6 text-center">
        <h1 className="text-[24px] font-bold">{t('home.title')}</h1>
        <p className="text-[14px] text-muted">{t('home.subtitle')}</p>
      </header>

      <Button variant="primary" size="big" onClick={() => setCreateOpen(true)}>
        {t('home.create.cta')}
      </Button>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t('home.list.header')}</h2>
        {fields === null ? (
          <p role="status" className="text-[14px] text-muted">
            {t('app.loading')}
          </p>
        ) : fields.length === 0 ? (
          <EmptyState icon="⚽" title={t('home.list.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {fields.map((field) => (
              <li key={field.slug}>
                <button
                  type="button"
                  onClick={() => navigateToField(field.slug)}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-start"
                >
                  <span className="font-semibold">{field.name}</span>
                  <span className="flex items-center gap-2 text-[13px] text-muted">
                    {field.hasLiveMatch && <Badge state="live">{t('home.list.live')}</Badge>}
                    <span>{t('home.list.queueCount', { count: field.queueLength })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t('home.create.title')}>
        <div className="flex flex-col gap-4">
          <input
            type="text"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('home.create.namePlaceholder')}
            className="min-h-[var(--touch-target-min)] rounded-lg border border-line bg-surface px-3 text-[16px]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-muted">{t('session.setup.duration')}</span>
            <div className="flex items-center gap-3">
              <Button onClick={() => setMinutes((m) => Math.max(MIN_MINUTES, m - 1))} aria-label={t('session.setup.decrease')}>
                −
              </Button>
              <span className="tabular w-14 text-center text-[19px] font-bold" dir="ltr">
                {minutes}:00
              </span>
              <Button onClick={() => setMinutes((m) => Math.min(MAX_MINUTES, m + 1))} aria-label={t('session.setup.increase')}>
                +
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-[13.5px] font-semibold text-danger">
              {error}
            </p>
          )}
          <Button variant="primary" size="big" onClick={() => void handleCreate()} disabled={submitting || name.trim().length === 0}>
            {t('home.create.open')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
