import type { SessionSummary } from 'shared'
import { t } from '@/i18n'
import { formatClock, formatTimeOfDay } from '@/lib/time'

/**
 * Single responsibility: the session summary stat header (client-prd §3.3,
 * US-073) — matches/captains/play-time grid + kv rows. Pure display over
 * the shared SessionSummary shape; aggregation itself lives in
 * mockSession.computeSessionSummary (unit-tested there).
 */
export function SessionSummaryCard({ summary }: { summary: SessionSummary }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label={t('history.summary.matches')} value={String(summary.totalMatches)} />
        <Stat label={t('history.summary.captains')} value={String(summary.uniqueCaptains)} />
        <Stat label={t('history.summary.playTime')} value={formatClock(summary.totalPlaySec)} />
      </div>
      <dl className="mt-3 flex flex-col gap-1.5 text-[13px] text-muted">
        <Row k={t('history.summary.range')}>
          {summary.firstMatchAt && summary.lastMatchEndedAt ? (
            <bdi className="tabular" dir="ltr">
              {formatTimeOfDay(summary.firstMatchAt)}–{formatTimeOfDay(summary.lastMatchEndedAt)}
            </bdi>
          ) : (
            '—'
          )}
        </Row>
        <Row k={t('history.summary.avgDuration')}>
          <bdi className="tabular" dir="ltr">{formatClock(Math.round(summary.avgActualDurationSec))}</bdi>
        </Row>
        <Row k={t('history.summary.extensions')}>
          <bdi className="tabular" dir="ltr">{summary.extensions}</bdi>
        </Row>
        <Row k={t('history.summary.finishes')}>{t('history.summary.finishesValue', { manual: summary.manualFinishes, auto: summary.autoFinishes })}</Row>
        <Row k={t('history.summary.topCaptains')}>{summary.topCaptains.length ? summary.topCaptains.map((c) => `${c.name} (${c.games})`).join(', ') : '—'}</Row>
      </dl>
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="tabular text-[19px] font-bold text-ink">{value}</div>
      <div className="text-[11.5px] text-muted">{label}</div>
    </div>
  )
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{k}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  )
}
