import { useEffect, useState, type ReactNode } from 'react'
import { AllFieldsLink } from '@/components/AllFieldsLink'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { apiGet, apiPost } from '@/lib/api'

interface FieldAccessStatus {
  passwordRequired: boolean
  granted: boolean
}

export interface FieldAccessClient {
  getStatus: (slug: string) => Promise<FieldAccessStatus>
  unlock: (slug: string, password: string) => Promise<void>
}

const apiFieldAccessClient: FieldAccessClient = {
  getStatus: (slug) => apiGet<FieldAccessStatus>(`/fields/${slug}/access`),
  unlock: async (slug, password) => {
    await apiPost<{ ok: true }>(`/fields/${slug}/access`, { password })
  },
}

/** Gates a password-protected staff field before its live data providers mount. */
export function FieldAccessGate({ slug, children, client = apiFieldAccessClient }: { slug: string; children: ReactNode; client?: FieldAccessClient }) {
  const [status, setStatus] = useState<FieldAccessStatus | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [password, setPassword] = useState('')
  const [wrongPassword, setWrongPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    void client.getStatus(slug)
      .then((next) => {
        if (!cancelled) setStatus(next)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [client, slug])

  async function unlock(): Promise<void> {
    if (!/^\d{4}$/.test(password) || submitting) return
    setSubmitting(true)
    setWrongPassword(false)
    try {
      await client.unlock(slug, password)
      setStatus({ passwordRequired: true, granted: true })
      setPassword('')
    } catch {
      setWrongPassword(true)
      setSubmitting(false)
    }
  }

  if (loadError) {
    return <p role="alert" className="p-4 text-[13.5px] font-semibold text-danger">{t('field.access.loadError')}</p>
  }
  if (status === null) {
    return <p role="status" className="p-4 text-[14px] text-muted">{t('app.loading')}</p>
  }
  if (!status.passwordRequired || status.granted) return <>{children}</>

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-4">
      <div className="fixed start-0 end-0 top-3 z-10 flex justify-center px-4">
        <div className="w-full max-w-md">
          <AllFieldsLink />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-bold text-ink">{t('field.access.title')}</h1>
        <p className="text-[14px] text-muted">{t('field.access.hint')}</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void unlock()
        }}
      >
        <label htmlFor="field-access-password" className="flex flex-col gap-1 text-[13px] text-muted">
          {t('field.access.passwordLabel')}
        </label>
        <input
          id="field-access-password"
          value={password}
          onChange={(event) => setPassword(event.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          type="password"
          dir="ltr"
          autoFocus
          className="min-h-[var(--btn-height-big)] rounded-xl border border-line bg-surface-2 px-3 text-center text-[20px] tracking-[0.35em] text-ink outline-none"
        />
        {wrongPassword && <p role="alert" className="text-[13px] font-semibold text-danger">{t('field.access.error')}</p>}
        <Button type="submit" variant="primary" size="big" disabled={password.length !== 4 || submitting}>
          {t('field.access.submit')}
        </Button>
      </form>
    </main>
  )
}
