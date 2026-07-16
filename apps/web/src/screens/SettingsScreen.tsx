import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { SessionSetupDialog } from '@/components/SessionSetupDialog'
import { t } from '@/i18n'
import { useSessionActions } from '@/state/SessionActions'
import { useSnapshot } from '@/state/SnapshotContext'
import { useStaffDirectory } from '@/state/StaffDirectoryContext'

const WAKE_LOCK_STORAGE_KEY = 'queueManager.wakeLockEnabled'
const MIN_MINUTES = 1
const MAX_MINUTES = 60

/**
 * Single responsibility: settings (client-prd §3.3, US-012/080) — active-session
 * duration stepper, soft-blocked + confirmed close, a StaffAdmin placeholder
 * list, and a wake-lock toggle stub. Reachable by any identity (staff or
 * visitor) — the open-fields model has no field owner, so there is no role
 * gate here. Closing a field is force-close under the open-fields pivot
 * (bypasses the legacy live-match 409) — an explicit confirm dialog, not just
 * the soft-disable, guards against a stray tap severing the field's link.
 */
export function SettingsScreen() {
  const { snapshot } = useSnapshot()
  const actions = useSessionActions()
  const { roster } = useStaffDirectory()
  const [setupOpen, setSetupOpen] = useState(false)
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wakeLockEnabled, setWakeLockEnabled] = useState(() => localStorage.getItem(WAKE_LOCK_STORAGE_KEY) === '1')

  const hasLiveMatch = snapshot?.fields.some((f) => f.liveMatch !== null) ?? false
  const durationMinutes = Math.round((snapshot?.session.matchDurationSec ?? 360) / 60)

  async function applyDuration(minutes: number): Promise<void> {
    try {
      await actions.updateDuration(minutes * 60)
    } catch {
      setError(t('settings.session.error'))
    }
  }

  async function handleClose(): Promise<void> {
    try {
      await actions.closeSession()
      setCloseConfirmOpen(false)
    } catch {
      setError(t('settings.session.error'))
    }
  }

  function toggleWakeLock(): void {
    const next = !wakeLockEnabled
    setWakeLockEnabled(next)
    localStorage.setItem(WAKE_LOCK_STORAGE_KEY, next ? '1' : '0')
  }

  return (
    <div className="flex flex-col gap-6 p-4">
      {error && (
        <p role="alert" className="text-[13.5px] font-semibold text-danger">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t('settings.session.title')}</h2>
        {snapshot ? (
          <>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
              <span className="text-[14px]">{t('session.setup.duration')}</span>
              <div className="flex items-center gap-3">
                <Button onClick={() => void applyDuration(Math.max(MIN_MINUTES, durationMinutes - 1))} aria-label={t('session.setup.decrease')}>
                  −
                </Button>
                <span className="tabular w-14 text-center text-[17px] font-bold" dir="ltr">
                  {durationMinutes}:00
                </span>
                <Button onClick={() => void applyDuration(Math.min(MAX_MINUTES, durationMinutes + 1))} aria-label={t('session.setup.increase')}>
                  +
                </Button>
              </div>
            </div>
            <Button variant="danger" onClick={() => setCloseConfirmOpen(true)}>
              {t('settings.session.close')}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setSetupOpen(true)}>
            {t('empty.noSession.cta')}
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t('settings.staff.title')}</h2>
        <div className="rounded-xl border border-line bg-surface">
          {roster.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5 last:border-b-0">
              <span className="text-[14px] font-semibold">{s.name}</span>
              <span className="text-[12.5px] text-muted">{s.role === 'manager' ? t('settings.staff.roleManager') : t('settings.staff.roleStaff')}</span>
              <Button
                onClick={() => {
                  // TODO: wire to a real deactivate-staff endpoint once apps/api ships staff management (US-080).
                }}
              >
                {t('settings.staff.deactivate')}
              </Button>
            </div>
          ))}
        </div>
        <Button
          onClick={() => {
            // TODO: wire to a real add-staff flow (name/role/PIN) once apps/api ships staff management (US-080).
          }}
        >
          {t('settings.staff.add')}
        </Button>
      </section>

      <section className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3">
        <span className="text-[14px]">{t('settings.wakeLock')}</span>
        <Button variant={wakeLockEnabled ? 'primary' : 'secondary'} onClick={toggleWakeLock}>
          {wakeLockEnabled ? t('settings.on') : t('settings.off')}
        </Button>
      </section>

      <SessionSetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />

      <Dialog open={closeConfirmOpen} onClose={() => setCloseConfirmOpen(false)} title={t('settings.session.closeConfirm.title')}>
        <div className="flex flex-col gap-4">
          <p className="text-[14px] text-muted">{t('settings.session.closeConfirm.hint')}</p>
          {hasLiveMatch && <p className="text-[14px] font-semibold text-danger">{t('settings.session.closeConfirm.hintLiveMatch')}</p>}
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setCloseConfirmOpen(false)}>
              {t('settings.session.closeConfirm.cancel')}
            </Button>
            <Button className="flex-1" variant="danger" onClick={() => void handleClose()}>
              {t('settings.session.closeConfirm.confirm')}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
