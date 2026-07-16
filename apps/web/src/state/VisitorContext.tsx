import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { VisitorNicknameSheet } from '@/components/VisitorNicknameSheet'
import { apiGet, apiPost } from '@/lib/api'
import type { SessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: anonymous visitor identity (open-fields spec §3.2).
 * Resolves GET /visitors/me once on mount; `ensureVisitor()` is the gate
 * every mutation passes through — instant true when identified, otherwise
 * it opens the nickname sheet and settles with the outcome. Reads are
 * never gated (spectators are never interrupted).
 */
type VisitorState = { nickname: string | null; ensureVisitor(): Promise<boolean> }

const VisitorContext = createContext<VisitorState | undefined>(undefined)

export function useVisitor(): VisitorState {
  const value = useContext(VisitorContext)
  if (value === undefined) throw new Error('useVisitor must be used within VisitorProvider')
  return value
}

function suggestedNickname(): string {
  return `אורח ${Math.floor(Math.random() * 90) + 10}`
}

export function VisitorProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [suggestion] = useState(suggestedNickname)
  const pendingResolvers = useRef<Array<(ok: boolean) => void>>([])
  const nicknameRef = useRef<string | null>(null)
  nicknameRef.current = nickname

  useEffect(() => {
    let cancelled = false
    apiGet<{ visitorId: string; nickname: string }>('/visitors/me')
      .then((me) => {
        if (!cancelled) setNickname(me.nickname)
      })
      .catch(() => {
        // No identity yet — the sheet appears on the first gated action.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ensureVisitor = useCallback((): Promise<boolean> => {
    if (nicknameRef.current !== null) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      pendingResolvers.current.push(resolve)
      setSheetOpen(true)
    })
  }, [])

  function settle(ok: boolean): void {
    for (const resolve of pendingResolvers.current) resolve(ok)
    pendingResolvers.current = []
    setSheetOpen(false)
  }

  async function handleSubmit(name: string): Promise<void> {
    const me = await apiPost<{ visitorId: string; nickname: string }>('/visitors', { nickname: name })
    setNickname(me.nickname)
    settle(true)
  }

  return (
    <VisitorContext.Provider value={{ nickname, ensureVisitor }}>
      {children}
      <VisitorNicknameSheet open={sheetOpen} suggestion={suggestion} onSubmit={handleSubmit} onClose={() => settle(false)} />
    </VisitorContext.Provider>
  )
}

/** Identity dismissed mid-gate — surfaces as the generic action error. */
export class VisitorRequiredError extends Error {
  constructor() {
    super('visitor identity required')
    this.name = 'VisitorRequiredError'
  }
}

/** Wraps every MUTATING SessionActions method with the identity gate;
 * searchTeams (the only read) passes through. Explicit per-method so the
 * compiler catches any future SessionActions addition. */
export function gateActions(actions: SessionActions, ensureVisitor: () => Promise<boolean>): SessionActions {
  async function gate(): Promise<void> {
    const ok = await ensureVisitor()
    if (!ok) throw new VisitorRequiredError()
  }
  return {
    addToLine: async (team) => {
      await gate()
      return actions.addToLine(team)
    },
    searchTeams: (q) => actions.searchTeams(q),
    reorderLine: async (entryIds) => {
      await gate()
      return actions.reorderLine(entryIds)
    },
    moveTop: async (entryId) => {
      await gate()
      return actions.moveTop(entryId)
    },
    moveBottom: async (entryId) => {
      await gate()
      return actions.moveBottom(entryId)
    },
    removeFromLine: async (entryId) => {
      await gate()
      return actions.removeFromLine(entryId)
    },
    startMatch: async (entryIds) => {
      await gate()
      return entryIds === undefined ? actions.startMatch() : actions.startMatch(entryIds)
    },
    pause: async (matchId) => {
      await gate()
      return actions.pause(matchId)
    },
    resume: async (matchId) => {
      await gate()
      return actions.resume(matchId)
    },
    finish: async (matchId) => {
      await gate()
      return actions.finish(matchId)
    },
    extend: async (matchId) => {
      await gate()
      return actions.extend(matchId)
    },
    replay: async (matchId) => {
      await gate()
      return actions.replay(matchId)
    },
    undo: async (activityId) => {
      await gate()
      return actions.undo(activityId)
    },
    openSession: async (cfg) => {
      await gate()
      return actions.openSession(cfg)
    },
    closeSession: async () => {
      await gate()
      return actions.closeSession()
    },
    updateDuration: async (matchDurationSec) => {
      await gate()
      return actions.updateDuration(matchDurationSec)
    },
    updateTeam: async (id, patch) => {
      await gate()
      return actions.updateTeam(id, patch)
    },
  }
}
