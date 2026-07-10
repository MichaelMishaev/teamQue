import { useEffect, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { t } from '@/i18n'
import { formatTimeOfDay } from '@/lib/time'
import { useCaptainProfiles } from '@/state/CaptainsContext'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: captain details bottom sheet (US-023, F11) — opened
 * by long-press or ⋯→details on any captain surface. Nickname/tags/private
 * note are inline-editable, saved via SessionActions.updateTeam on blur
 * (no separate save button — the no-popup policy prefers implicit save).
 */
export interface CaptainSheetProps {
  open: boolean
  onClose: () => void
  captainId: string
}

export function CaptainSheet({ open, onClose, captainId }: CaptainSheetProps) {
  const actions = useSessionActions()
  const profiles = useCaptainProfiles()
  const profile = profiles.find((p) => p.id === captainId) ?? null

  const [nickname, setNickname] = useState('')
  const [note, setNote] = useState('')
  const [tagsInput, setTagsInput] = useState('')

  useEffect(() => {
    setNickname(profile?.nickname ?? '')
    setNote(profile?.note ?? '')
  }, [profile?.id, profile?.nickname, profile?.note])

  if (!profile) return null

  async function addTag(): Promise<void> {
    const tag = tagsInput.trim()
    if (!tag || !profile) return
    await actions.updateTeam(captainId, { tags: [...profile.tags, tag] })
    setTagsInput('')
  }

  async function removeTag(tag: string): Promise<void> {
    if (!profile) return
    await actions.updateTeam(captainId, { tags: profile.tags.filter((existing) => existing !== tag) })
  }

  return (
    <Sheet open={open} onClose={onClose} title={profile.name}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          {t('captain.sheet.nickname')}
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            onBlur={() => void actions.updateTeam(captainId, { nickname })}
            className="min-h-[var(--touch-target-min)] rounded-xl border border-line bg-surface-2 px-3 text-[15px] text-ink outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          {profile.tags.map((tag) => (
            <span key={tag} className="flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12.5px] text-ink">
              {tag}
              <button type="button" onClick={() => void removeTag(tag)} aria-label={t('queue.remove')} className="text-muted">
                ✕
              </button>
            </span>
          ))}
          <input
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addTag()
              }
            }}
            placeholder={t('captain.sheet.addTag')}
            className="min-h-[var(--touch-target-min)] min-w-24 flex-1 rounded-full border border-dashed border-line bg-transparent px-3 text-[13px] text-ink outline-none"
          />
        </div>

        <label className="flex flex-col gap-1 text-[13px] font-semibold text-warn">
          {t('captain.sheet.privateNote')}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => void actions.updateTeam(captainId, { note })}
            rows={2}
            className="rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-[14px] font-normal text-ink outline-none"
          />
        </label>

        <dl className="grid grid-cols-3 gap-2 text-center text-[12.5px] text-muted">
          <div>
            <dt>{t('captain.sheet.gamesToday')}</dt>
            <dd className="tabular text-[17px] font-bold text-ink">{profile.gamesToday}</dd>
          </div>
          <div>
            <dt>{t('captain.sheet.lastPlayed')}</dt>
            <dd className="tabular text-[15px] font-semibold text-ink" dir="ltr">
              {profile.lastPlayedAt ? formatTimeOfDay(profile.lastPlayedAt) : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('captain.sheet.total')}</dt>
            <dd className="tabular text-[17px] font-bold text-ink">{profile.totalMatches}</dd>
          </div>
        </dl>
      </div>
    </Sheet>
  )
}
