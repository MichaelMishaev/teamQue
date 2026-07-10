import { useRef, useState } from 'react'
import type { CaptainSearchResult as CaptainSearchResultData } from 'shared'
import { CaptainSearchResult, CreateCaptainRow } from '@/components/CaptainSearchResult'
import { t } from '@/i18n'
import { formatTimeOfDay } from '@/lib/time'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the sticky bottom quick-add bar (client-prd §3.2,
 * US-020/021/022, task brief item 6) — ONE team slot (the line is single
 * teams, not pairs). Debounced search; picking or creating a team calls
 * addToLine directly (zero extra taps) and resets.
 */

const DEBOUNCE_MS = 150

export function QuickAddBar() {
  const actions = useSessionActions()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CaptainSearchResultData[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQueryChange(value: string): void {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 1) {
      setResults([])
      return
    }
    debounceRef.current = setTimeout(() => {
      void actions.searchTeams(value).then(setResults)
    }, DEBOUNCE_MS)
  }

  function reset(): void {
    setQuery('')
    setResults([])
  }

  async function pick(ref: { id: string } | { newName: string }): Promise<void> {
    reset()
    await actions.addToLine(ref)
    navigator.vibrate?.(10)
  }

  return (
    <div
      className="sticky bottom-0 z-10 border-t border-line bg-surface p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t('quickAdd.searchPlaceholder')}
        className="mb-1 min-h-[var(--touch-target-min)] w-full rounded-xl border border-line bg-surface-2 px-3 text-[15px] outline-none"
      />
      {query.trim().length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-line bg-surface">
          {results.map((c) => (
            <CaptainSearchResult
              key={c.id}
              name={c.name}
              {...(c.nickname ? { nickname: c.nickname } : {})}
              gamesToday={c.gamesToday}
              {...(c.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(c.lastPlayedAt) } : {})}
              onSelect={() => void pick({ id: c.id })}
            />
          ))}
          <CreateCaptainRow
            name={query.trim()}
            duplicate={results.some((r) => r.name === query.trim())}
            onCreate={() => void pick({ newName: query.trim() })}
          />
        </div>
      )}
    </div>
  )
}
