import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  ActivityEntry as WireActivityEntry,
  CaptainSearchResult,
  HistoryEntry,
  SessionSnapshot,
  SessionSummary,
} from 'shared'
import { apiGet, apiPost, ApiRequestError } from '@/lib/api'
import { computeOffsetMs } from '@/lib/server-clock'
import { createSessionSocket } from '@/lib/socket'
import { ActivityContext, type ActivityEntry } from '@/state/ActivityContext'
import { CaptainsContext, type CaptainProfile } from '@/state/CaptainsContext'
import { HistoryContext, type HistoryState } from '@/state/HistoryContext'
import { toActivityEntry, toCaptainProfile, toFinishedMatchView } from '@/state/real/readAdapters'
import { createRealSessionActions, type SessionIdHandle } from '@/state/real/realSessionActions'
import { SessionActionsContext } from '@/state/SessionActions'
import { SnapshotContext, type SnapshotState } from '@/state/SnapshotContext'
import { StaffDirectoryContext, type StaffRosterItem } from '@/state/StaffDirectoryContext'
import { gateActions, useVisitor, VisitorRequiredError } from '@/state/VisitorContext'

const EMPTY_HISTORY: HistoryState = { summary: null, matches: [] }
const INITIAL_SNAPSHOT_STATE: SnapshotState = { snapshot: null, connection: 'offline', offsetMs: 0 }
/** How long the "resynced" flash shows before settling to "online" (ConnectivityBanner). */
const RESYNC_DISPLAY_MS = 1500

function socketUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined) ?? window.location.origin
}

/**
 * Real-mode composition root (VITE_DEMO unset). Mounted by main.tsx as
 * AppGate's `children` — i.e. only once `phase === 'authed'` — so every
 * effect below runs with the center + staff session cookies StaffSessionGuard
 * requires already set (see main.tsx for why the nesting order matters: an
 * unauthed mount would 401 on /fields/:slug, /staff, and the socket).
 *
 * Feeds SnapshotContext from the initial `GET /fields/:slug` fetch (open-
 * fields spec — `slug` comes from the `/f/:slug` route) plus a live session
 * socket joined to that slug's room (technical-prd §5: full-snapshot
 * broadcast after every mutation — screens are dumb renderers of whatever
 * arrives here), and SessionActionsContext from realSessionActions.
 * History/Activity/Captains stay empty placeholders — wiring their read
 * endpoints isn't part of this task's scope (screens using them just render
 * empty, same as before).
 */
export function RealProviders({ slug, children }: { slug: string; children: ReactNode }) {
  const [snapshotState, setSnapshotState] = useState<SnapshotState>(INITIAL_SNAPSHOT_STATE)
  const [roster, setRoster] = useState<StaffRosterItem[]>([])
  const [history, setHistory] = useState<HistoryState>(EMPTY_HISTORY)
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [captainProfiles, setCaptainProfiles] = useState<CaptainProfile[]>([])
  // Bumped whenever a session is opened or closed. Opening a session from a
  // client that connected before any session existed leaves it outside the
  // broadcast room, so the socket must reconnect (rejoin the new session's
  // room) and the snapshot must be re-seeded — both effects depend on this.
  const [reseedNonce, setReseedNonce] = useState(0)

  // Mirror the roster in a ref so the read-fetch effect can resolve activity
  // staff names from the latest roster without depending on it (which would
  // refetch history/activity every time the roster loads).
  const rosterRef = useRef<StaffRosterItem[]>([])
  rosterRef.current = roster

  const sessionIdRef = useRef<string | null>(null)
  const sessionIdHandle = useMemo<SessionIdHandle>(
    () => ({
      get: () => sessionIdRef.current,
      set: (id) => {
        sessionIdRef.current = id
        // The snapshot schema has no "no session" shape, and closing a
        // session never gets a matching socket push — clear it locally.
        if (id === null) setSnapshotState((prev) => ({ ...prev, snapshot: null }))
        // Session-level change (open/close): force a socket reconnect + reseed.
        setReseedNonce((n) => n + 1)
      },
    }),
    [],
  )

  const { ensureVisitor } = useVisitor()
  const actions = useMemo(() => {
    const gated = gateActions(createRealSessionActions(sessionIdHandle), ensureVisitor)
    return {
      ...gated,
      // Public field links must close regardless of a live match (open-fields
      // spec §4) — the legacy /sessions/:id/close 409s on a live match, so
      // this bypasses realSessionActions.closeSession and hits the force-close
      // route directly instead.
      //
      // Deliberately does NOT go through sessionIdHandle.set(null): closing a
      // field doesn't change which slug the client cares about (the closed
      // field still resolves via GET /fields/:slug — fields.service.ts's
      // resolve() never 404s a closed field), so there's no need to null out
      // the snapshot or force a socket reconnect/reseed cycle. Instead this
      // re-fetches the now-closed snapshot directly and swaps it in, so the
      // UI goes straight from "live field" to "closed field" with no
      // intermediate `snapshot === null` ("field not found") flash.
      closeSession: async () => {
        const ok = await ensureVisitor()
        if (!ok) throw new VisitorRequiredError()
        await apiPost(`/fields/${slug}/close`, {})
        const closedSnapshot = await apiGet<SessionSnapshot>(`/fields/${slug}`)
        setSnapshotState((prev) => ({ ...prev, snapshot: closedSnapshot }))
      },
    }
  }, [sessionIdHandle, ensureVisitor, slug])

  // Initial snapshot seed: GET /fields/:slug, 404 → bad/closed link.
  useEffect(() => {
    let cancelled = false
    apiGet<SessionSnapshot>(`/fields/${slug}`)
      .then((snapshot) => {
        if (cancelled) return
        sessionIdRef.current = snapshot.session.id
        setSnapshotState((prev) => ({ ...prev, snapshot }))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof ApiRequestError && err.code === 'NOT_FOUND') {
          sessionIdRef.current = null
          setSnapshotState((prev) => ({ ...prev, snapshot: null }))
        }
      })
    return () => {
      cancelled = true
    }
  }, [reseedNonce, slug])

  // Live socket: every snapshot event replaces the snapshot; connection
  // status tracks connect/disconnect, with a brief "resynced" on reconnect.
  useEffect(() => {
    let hasConnectedOnce = false
    let resyncTimer: ReturnType<typeof setTimeout> | undefined

    const socket = createSessionSocket({
      url: socketUrl(),
      slug,
      onConnect(serverNowIso) {
        const offsetMs = computeOffsetMs(serverNowIso, Date.now())
        const isReconnect = hasConnectedOnce
        hasConnectedOnce = true
        setSnapshotState((prev) => ({ ...prev, offsetMs, connection: isReconnect ? 'resynced' : 'online' }))
        if (isReconnect) {
          clearTimeout(resyncTimer)
          resyncTimer = setTimeout(() => {
            setSnapshotState((prev) => (prev.connection === 'resynced' ? { ...prev, connection: 'online' } : prev))
          }, RESYNC_DISPLAY_MS)
        }
      },
      onSnapshot(snapshot) {
        sessionIdRef.current = snapshot.session.id
        setSnapshotState((prev) => ({ ...prev, snapshot }))
      },
      onDisconnect() {
        setSnapshotState((prev) => ({ ...prev, connection: 'offline' }))
      },
    })

    return () => {
      clearTimeout(resyncTimer)
      socket.disconnect()
    }
  }, [reseedNonce, slug])

  // History / Activity / Captains read side. These aren't part of the snapshot
  // (which only carries the live line + fields), so fetch them alongside it and
  // refresh on every snapshot broadcast (each broadcast means a mutation landed,
  // possibly a finish or a new activity row). No active session → clear them.
  const sessionId = snapshotState.snapshot?.session.id ?? null
  const snapshotStamp = snapshotState.snapshot?.emittedAt ?? null
  useEffect(() => {
    if (sessionId === null) {
      setHistory(EMPTY_HISTORY)
      setActivity([])
      setCaptainProfiles([])
      return
    }
    let cancelled = false
    void Promise.allSettled([
      apiGet<HistoryEntry[]>(`/sessions/${sessionId}/history`),
      apiGet<SessionSummary>(`/sessions/${sessionId}/summary`),
      apiGet<WireActivityEntry[]>(`/activity?sessionId=${sessionId}`),
      apiGet<CaptainSearchResult[]>('/captains'),
    ]).then((results) => {
      if (cancelled) return
      const [historyRes, summaryRes, activityRes, captainsRes] = results
      const matches = historyRes.status === 'fulfilled' ? historyRes.value.map(toFinishedMatchView) : []
      const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null
      setHistory({ summary, matches })
      if (activityRes.status === 'fulfilled') {
        const nameById = new Map(rosterRef.current.map((s) => [s.id, s.name]))
        setActivity(activityRes.value.map((row) => toActivityEntry(row, (id) => nameById.get(id) ?? null)))
      }
      if (captainsRes.status === 'fulfilled') setCaptainProfiles(captainsRes.value.map(toCaptainProfile))
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, snapshotStamp])

  // Staff roster for SwitchUser (StaffLogin's own picker fetches this directly).
  useEffect(() => {
    let cancelled = false
    apiGet<StaffRosterItem[]>('/staff')
      .then((list) => {
        if (!cancelled) setRoster(list)
      })
      .catch(() => {
        // SwitchUser's picker degrades to empty — no retry loop for MVP.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const staffDirectory = useMemo(
    () => ({
      roster,
      async login(staffId: string, pin: string): Promise<StaffRosterItem> {
        const result = await apiPost<{ staffId: string; name: string; role: StaffRosterItem['role'] }>('/auth/login', {
          staffId,
          pin,
        })
        return { id: result.staffId, name: result.name, role: result.role }
      },
    }),
    [roster],
  )

  return (
    <SnapshotContext.Provider value={snapshotState}>
      <SessionActionsContext.Provider value={actions}>
        <HistoryContext.Provider value={history}>
          <ActivityContext.Provider value={activity}>
            <CaptainsContext.Provider value={captainProfiles}>
              <StaffDirectoryContext.Provider value={staffDirectory}>{children}</StaffDirectoryContext.Provider>
            </CaptainsContext.Provider>
          </ActivityContext.Provider>
        </HistoryContext.Provider>
      </SessionActionsContext.Provider>
    </SnapshotContext.Provider>
  )
}
