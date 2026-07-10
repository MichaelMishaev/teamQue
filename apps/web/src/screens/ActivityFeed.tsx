import { EmptyState } from '@/components/EmptyState'
import { t, type MessageKey } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatTimeOfDay } from '@/lib/time'
import { useActivityFeed } from '@/state/ActivityContext'
import type { ActivityAction, ActivityEntry } from '@/state/ActivityContext'

/**
 * Single responsibility: chronological staff activity log (client-prd §3.3,
 * US-072) — newest first, time LTR-isolated, staff-attributed rows bold,
 * automatic rows (staffName null) italic/muted. Nominal phrasing ("התחלת
 * משחק: …") sidesteps Hebrew verb gender agreement across staff names.
 */
const MESSAGE_KEY: Record<ActivityAction, MessageKey> = {
  'session.open': 'activity.sessionOpen',
  'session.close': 'activity.sessionClose',
  'session.updateDuration': 'activity.updateDuration',
  'line.addToLine': 'activity.addToLine',
  'line.reorder': 'activity.reorder',
  'line.remove': 'activity.remove',
  'match.start': 'activity.start',
  'match.pause': 'activity.pause',
  'match.resume': 'activity.resume',
  'match.extend': 'activity.extend',
  'match.finish.manual': 'activity.finishManual',
  'match.finish.auto': 'activity.finishAuto',
  'match.replay': 'activity.replay',
  'match.undo': 'activity.undo',
  'team.update': 'activity.teamUpdate',
}

function activityMessage(entry: ActivityEntry): string {
  const base = t(MESSAGE_KEY[entry.action])
  // Append the team/field detail only when it's available (demo mode and any
  // enriched entry). Real-mode activity rows carry no team names, so they show
  // the clean action label alone rather than a dangling ": נגד ()".
  if (!entry.captainA) return base
  const pair = entry.captainB ? `${entry.captainA} נגד ${entry.captainB}` : entry.captainA
  const field = entry.fieldName ? ` (${entry.fieldName})` : ''
  return `${base}: ${pair}${field}`
}

export function ActivityFeed() {
  const entries = useActivityFeed()

  if (entries.length === 0) {
    return (
      <div className="p-4">
        <EmptyState title={t('activity.empty')} />
      </div>
    )
  }

  return (
    <div className="flex flex-col p-4">
      {entries.map((entry) => (
        <ActivityRow key={entry.id} entry={entry} />
      ))}
    </div>
  )
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const isAuto = entry.staffName === null
  return (
    <div className="flex items-start gap-3 border-b border-line py-2.5 text-[14px] last:border-b-0">
      <bdi dir="ltr" className="tabular shrink-0 pt-px text-[12.5px] text-muted">
        {formatTimeOfDay(entry.atIso)}
      </bdi>
      <p className={cn('min-w-0', isAuto ? 'italic text-muted' : 'text-ink')}>
        {!isAuto && <b className="font-bold">{entry.staffName} </b>}
        {activityMessage(entry)}
      </p>
    </div>
  )
}
