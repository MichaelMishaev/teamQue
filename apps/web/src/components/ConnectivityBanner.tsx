import { t } from '@/i18n'

/**
 * Single responsibility: socket connectivity status strip (client-prd §7).
 * Silent while online; warn while offline; brief accent flash on resync.
 */

export type ConnectivityStatus = 'online' | 'offline' | 'resynced'

export function ConnectivityBanner({ status }: { status: ConnectivityStatus }) {
  if (status === 'online') return null
  if (status === 'offline') {
    return (
      <div role="status" className="flex items-center gap-2.5 rounded-[10px] border border-warn/35 bg-warn/10 px-3.5 py-2 text-[13.5px] font-semibold text-warn">
        ⚠ {t('banner.offline')}
      </div>
    )
  }
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-[10px] border border-accent/35 bg-accent-dim px-3.5 py-2 text-[13.5px] font-semibold text-accent">
      ✓ {t('banner.synced')}
    </div>
  )
}
