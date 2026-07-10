/**
 * In-memory implementation of the app's two state abstractions
 * (SnapshotContext + SessionActions) plus the read models History/Activity/
 * Captains need that aren't part of the SessionSnapshot contract. Drives the
 * whole app in `VITE_DEMO=1` mode.
 *
 * Line model (design.md §0, task brief "THE MODEL"): the queue is a line of
 * SINGLE teams — one row per team, never "A vs B". `lineOrder` holds line
 * entry ids (distinct from captain ids, matching QueueEntryView's shape);
 * two entries pair into an InternalMatch only at startMatch (kickoff) and
 * leave the line at that point. Seeded: 12 captains (incl. two דניאל), one
 * live match with a real countdown, a 4-match finished history, and a
 * 5-deep line of single teams — all timers are real timestamps, not fake
 * ticks (technical-prd §4 applies here too).
 *
 * Every mutation is synchronous under the hood; methods are `async` only to
 * match the SessionActions contract (a real API-backed implementation is
 * genuinely async). `notify()` after every mutation is what makes React
 * re-render — see `DemoProviders.tsx` for the `useSyncExternalStore` wiring.
 */
import type { CaptainSearchResult, CaptainView, EndReason, MatchStatus, OpenSessionBody, SessionSummary, StaffRole } from 'shared'
import type { MatchView, QueueEntryView, SessionSnapshot } from '@/state/lineModel'
import type { CaptainRef, CaptainProfilePatch, SessionActions, UndoableResult } from '@/state/SessionActions'
import type { SnapshotState } from '@/state/SnapshotContext'
import type { ActivityAction, ActivityEntry } from '@/state/ActivityContext'
import type { CaptainProfile } from '@/state/CaptainsContext'
import type { FinishedMatchView, HistoryState } from '@/state/HistoryContext'

const FIELD_ID = 'field-main'
const FIELD_NAME = 'מגרש ראשי'
const DEFAULT_DURATION_SEC = 360

export interface StaffRosterItem {
  id: string
  name: string
  role: StaffRole
}

interface InternalCaptain {
  id: string
  name: string
  nickname: string | null
  tags: string[]
  note: string
  /** All-time games before tonight, so CaptainSheet totals look real. */
  seedTotalBeforeToday: number
}

/** One row in the line — a single team. Its id is the QueueEntryView id, distinct from the captain id. */
interface InternalLineEntry {
  id: string
  captainId: string
}

interface InternalMatch {
  id: string
  captainAId: string
  captainBId: string
  status: MatchStatus
  plannedDurationSec: number
  startedAt: string | null
  pausedAt: string | null
  accumulatedPauseSec: number
  endedAt: string | null
  endReason: EndReason | null
  startedByName: string | null
  endedByName: string | null
  actualDurationSec: number | null
}

type UndoPayload = { type: 'removeLine'; entry: InternalLineEntry; restoreIndex: number } | { type: 'finish'; match: InternalMatch }

interface LogEntry extends ActivityEntry {
  undo?: UndoPayload
  consumed?: boolean
}

interface InternalSession {
  id: string
  date: string
  location: string | null
  matchDurationSec: number
  status: 'active' | 'closed'
}

/** Pure aggregation over finished matches — exported for direct unit testing. */
export function computeSessionSummary(matches: FinishedMatchView[], extensions: number): SessionSummary {
  const captainGames = new Map<string, { name: string; games: number }>()
  let totalPlaySec = 0
  let manualFinishes = 0
  let autoFinishes = 0
  let firstMatchAt: string | null = null
  let lastMatchEndedAt: string | null = null

  for (const m of matches) {
    totalPlaySec += m.actualDurationSec
    if (m.endReason === 'manual') manualFinishes += 1
    if (m.endReason === 'auto') autoFinishes += 1
    if (firstMatchAt === null || m.startedAt < firstMatchAt) firstMatchAt = m.startedAt
    if (lastMatchEndedAt === null || m.endedAt > lastMatchEndedAt) lastMatchEndedAt = m.endedAt
    for (const cap of [m.captainA, m.captainB]) {
      const entry = captainGames.get(cap.id) ?? { name: cap.name, games: 0 }
      entry.games += 1
      captainGames.set(cap.id, entry)
    }
  }

  const topCaptains = [...captainGames.entries()]
    .map(([captainId, v]) => ({ captainId, name: v.name, games: v.games }))
    .sort((a, b) => b.games - a.games)
    .slice(0, 3)

  return {
    totalMatches: matches.length,
    uniqueCaptains: captainGames.size,
    totalPlaySec,
    firstMatchAt,
    lastMatchEndedAt,
    avgActualDurationSec: matches.length ? totalPlaySec / matches.length : 0,
    topCaptains,
    extensions,
    manualFinishes,
    autoFinishes,
  }
}

export interface MockSessionInstance {
  subscribe(listener: () => void): () => void
  getSnapshotState(): SnapshotState
  getHistoryState(): HistoryState
  getActivityState(): ActivityEntry[]
  getCaptainsState(): CaptainProfile[]
  listStaff(): StaffRosterItem[]
  verifyStaffPin(staffId: string, pin: string): boolean
  actions: SessionActions
  /** Test/demo seam: force reorderLine to reject, exercising the revert-on-reject UI path. */
  setReorderRejects(reject: boolean): void
}

export interface CreateMockSessionOptions {
  /** Who mutations are attributed to; read at call time so SwitchUser works without re-creating the store. */
  getActorName?: () => string | null
}

const STAFF_SEED: Array<StaffRosterItem & { pin: string }> = [
  { id: 'staff-sarah', name: 'שרה', role: 'manager', pin: '1234' },
  { id: 'staff-moshe', name: 'משה', role: 'staff', pin: '1234' },
  { id: 'staff-rachel', name: 'רחל', role: 'staff', pin: '1234' },
]

const CAPTAIN_SEED: Array<{ name: string; nickname: string | null; tags: string[]; seedTotalBeforeToday: number }> = [
  { name: 'דניאל', nickname: null, tags: ['קפטן ותיק'], seedTotalBeforeToday: 22 },
  { name: 'נועם', nickname: null, tags: [], seedTotalBeforeToday: 14 },
  { name: 'יוסי', nickname: null, tags: [], seedTotalBeforeToday: 9 },
  { name: 'רון', nickname: null, tags: [], seedTotalBeforeToday: 11 },
  { name: 'עומר', nickname: null, tags: [], seedTotalBeforeToday: 6 },
  { name: 'איתי', nickname: null, tags: [], seedTotalBeforeToday: 17 },
  { name: 'אלון', nickname: null, tags: [], seedTotalBeforeToday: 3 },
  { name: 'שחר', nickname: null, tags: [], seedTotalBeforeToday: 8 },
  { name: 'גיא', nickname: null, tags: [], seedTotalBeforeToday: 5 },
  { name: 'טל', nickname: null, tags: [], seedTotalBeforeToday: 19 },
  { name: 'דניאל', nickname: 'הקטן', tags: [], seedTotalBeforeToday: 2 },
  { name: 'נדב', nickname: null, tags: [], seedTotalBeforeToday: 12 },
]

export function createMockSession(opts: CreateMockSessionOptions = {}): MockSessionInstance {
  const getActorName = opts.getActorName ?? (() => 'שרה')

  let idSeq = 0
  const newId = (prefix: string): string => `${prefix}-${(idSeq += 1)}`
  const nowIso = (): string => new Date().toISOString()

  const listeners = new Set<() => void>()
  // useSyncExternalStore requires getSnapshot to return a stable reference
  // when nothing changed, or React loops forever re-rendering. Cache each
  // read model and invalidate on every mutation (notify).
  let cachedSnapshotState: SnapshotState | null = null
  let cachedHistoryState: HistoryState | null = null
  let cachedActivityState: ActivityEntry[] | null = null
  let cachedCaptainsState: CaptainProfile[] | null = null

  function notify(): void {
    cachedSnapshotState = null
    cachedHistoryState = null
    cachedActivityState = null
    cachedCaptainsState = null
    for (const l of listeners) l()
  }

  const captains = new Map<string, InternalCaptain>()
  const matches = new Map<string, InternalMatch>()
  const lineEntries = new Map<string, InternalLineEntry>()
  let lineOrder: string[] = []
  let liveMatchId: string | null = null
  let session: InternalSession | null = null
  let extensionsCount = 0
  let forceReorderReject = false
  const logEntries: LogEntry[] = []
  let logSeq = 0

  function logActivity(
    action: ActivityAction,
    info: { captainA?: string; captainB?: string; fieldName?: string },
    autoAction = false,
  ): LogEntry {
    const entry: LogEntry = {
      id: `act-${(logSeq += 1)}`,
      atIso: nowIso(),
      action,
      staffName: autoAction ? null : getActorName(),
      ...info,
    }
    logEntries.push(entry)
    return entry
  }

  function nameOf(captainId: string): string {
    return captains.get(captainId)?.name ?? ''
  }

  function toCaptainView(captainId: string): CaptainView {
    const c = captains.get(captainId)
    if (!c) throw new Error(`unknown captain ${captainId}`)
    const finishedForCaptain = [...matches.values()].filter(
      (m) => m.status === 'finished' && (m.captainAId === captainId || m.captainBId === captainId),
    )
    const liveMatch = liveMatchId ? matches.get(liveMatchId) : undefined
    const inLiveNow = !!liveMatch && (liveMatch.captainAId === captainId || liveMatch.captainBId === captainId)
    const gamesToday = finishedForCaptain.length + (inLiveNow ? 1 : 0)
    const lastPlayedAt = finishedForCaptain.reduce<string | null>((latest, m) => {
      if (!m.endedAt) return latest
      return !latest || m.endedAt > latest ? m.endedAt : latest
    }, null)
    return { id: c.id, name: c.name, nickname: c.nickname, gamesToday, lastPlayedAt }
  }

  function toCaptainSearchResult(captainId: string): CaptainSearchResult {
    const c = captains.get(captainId)
    if (!c) throw new Error(`unknown captain ${captainId}`)
    const view = toCaptainView(captainId)
    return { ...view, note: c.note, tags: c.tags, totalMatches: c.seedTotalBeforeToday + view.gamesToday }
  }

  function toMatchView(m: InternalMatch): MatchView {
    const endsAt =
      m.status === 'live' && m.startedAt
        ? new Date(new Date(m.startedAt).getTime() + m.plannedDurationSec * 1000 + m.accumulatedPauseSec * 1000).toISOString()
        : null
    return {
      id: m.id,
      captainA: toCaptainView(m.captainAId),
      captainB: toCaptainView(m.captainBId),
      status: m.status,
      plannedDurationSec: m.plannedDurationSec,
      startedAt: m.startedAt,
      pausedAt: m.pausedAt,
      accumulatedPauseSec: m.accumulatedPauseSec,
      endsAt,
    }
  }

  function toQueueEntryView(entryId: string, position: number): QueueEntryView {
    const entry = lineEntries.get(entryId)
    if (!entry) throw new Error(`unknown line entry ${entryId}`)
    return { id: entry.id, position, team: toCaptainView(entry.captainId) }
  }

  function resolveCaptainRef(ref: CaptainRef): string {
    if ('id' in ref) {
      if (!captains.has(ref.id)) throw new Error('captain not found')
      return ref.id
    }
    const id = newId('cap')
    captains.set(id, { id, name: ref.newName, nickname: null, tags: [], note: '', seedTotalBeforeToday: 0 })
    return id
  }

  function appendToLine(captainId: string): InternalLineEntry {
    const entry: InternalLineEntry = { id: newId('entry'), captainId }
    lineEntries.set(entry.id, entry)
    lineOrder.push(entry.id)
    return entry
  }

  // ── Seed data ──────────────────────────────────────────────────────────
  function seed(): void {
    const captainIds = CAPTAIN_SEED.map((c) => {
      const id = newId('cap')
      captains.set(id, { id, ...c, tags: [...c.tags], note: '' })
      return id
    })
    const [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12] = captainIds as [
      string, string, string, string, string, string, string, string, string, string, string, string,
    ]

    session = {
      id: newId('session'),
      date: new Date().toISOString().slice(0, 10),
      location: null,
      matchDurationSec: DEFAULT_DURATION_SEC,
      status: 'active',
    }
    logActivity('session.open', {})

    function seedFinished(aId: string, bId: string, startedAgoSec: number, actualDurationSec: number, endReason: EndReason, byName: string | null): void {
      const startedAt = new Date(Date.now() - startedAgoSec * 1000).toISOString()
      const endedAt = new Date(new Date(startedAt).getTime() + actualDurationSec * 1000).toISOString()
      const m: InternalMatch = {
        id: newId('match'),
        captainAId: aId,
        captainBId: bId,
        status: 'finished',
        plannedDurationSec: DEFAULT_DURATION_SEC,
        startedAt,
        pausedAt: null,
        accumulatedPauseSec: 0,
        endedAt,
        endReason,
        startedByName: byName,
        endedByName: endReason === 'manual' ? byName : null,
        actualDurationSec,
      }
      matches.set(m.id, m)
      logActivity(endReason === 'auto' ? 'match.finish.auto' : 'match.finish.manual', { captainA: nameOf(aId), captainB: nameOf(bId), fieldName: FIELD_NAME }, endReason === 'auto')
    }

    seedFinished(c3, c5, 70 * 60, 350, 'auto', 'שרה')
    seedFinished(c7, c9, 55 * 60, 300, 'manual', 'משה')
    seedFinished(c2, c11, 45 * 60, 380, 'auto', 'שרה')
    extensionsCount += 1 // backstory: the c2 vs c11 match above was extended once
    seedFinished(c2, c6, 30 * 60, 340, 'manual', 'משה')

    // Live match: started ~83s ago, so it opens mid-countdown like the design mock.
    const liveStartedAt = new Date(Date.now() - 83 * 1000).toISOString()
    const live: InternalMatch = {
      id: newId('match'),
      captainAId: c1,
      captainBId: c2,
      status: 'live',
      plannedDurationSec: DEFAULT_DURATION_SEC,
      startedAt: liveStartedAt,
      pausedAt: null,
      accumulatedPauseSec: 0,
      endedAt: null,
      endReason: null,
      startedByName: 'שרה',
      endedByName: null,
      actualDurationSec: null,
    }
    matches.set(live.id, live)
    liveMatchId = live.id
    logActivity('match.start', { captainA: nameOf(c1), captainB: nameOf(c2), fieldName: FIELD_NAME })

    // A line of 5 single teams, waiting their turn.
    for (const captainId of [c4, c6, c8, c10, c12]) {
      appendToLine(captainId)
      logActivity('line.addToLine', { captainA: nameOf(captainId) })
    }
  }
  seed()

  // ── Read models ────────────────────────────────────────────────────────
  function computeSnapshotState(): SnapshotState {
    if (!session) return { snapshot: null, connection: 'online', offsetMs: 0 }
    const emittedAt = nowIso()
    const snapshot: SessionSnapshot = {
      session: { id: session.id, date: session.date, location: session.location, matchDurationSec: session.matchDurationSec, status: session.status },
      fields: [{ id: FIELD_ID, name: FIELD_NAME, position: 0, liveMatch: liveMatchId ? toMatchView(matches.get(liveMatchId)!) : null }],
      queue: lineOrder.map((entryId, i) => toQueueEntryView(entryId, i + 1)),
      emittedAt,
      serverNow: emittedAt,
    }
    return { snapshot, connection: 'online', offsetMs: 0 }
  }

  function computeHistoryState(): HistoryState {
    const finished = [...matches.values()]
      .filter((m) => m.status === 'finished')
      .sort((a, b) => (b.endedAt ?? '').localeCompare(a.endedAt ?? ''))
    const finishedViews: FinishedMatchView[] = finished.map((m) => ({
      id: m.id,
      captainA: toCaptainView(m.captainAId),
      captainB: toCaptainView(m.captainBId),
      fieldName: FIELD_NAME,
      startedAt: m.startedAt ?? m.endedAt ?? nowIso(),
      endedAt: m.endedAt ?? nowIso(),
      plannedDurationSec: m.plannedDurationSec,
      actualDurationSec: m.actualDurationSec ?? 0,
      endReason: m.endReason ?? 'manual',
      startedByName: m.startedByName,
      endedByName: m.endedByName,
    }))
    return { summary: computeSessionSummary(finishedViews, extensionsCount), matches: finishedViews }
  }

  function computeActivityState(): ActivityEntry[] {
    return [...logEntries].reverse()
  }

  function computeCaptainsState(): CaptainProfile[] {
    return [...captains.keys()].map((id) => {
      const cv = toCaptainView(id)
      const c = captains.get(id)!
      return { id, name: c.name, nickname: c.nickname, tags: c.tags, note: c.note, gamesToday: cv.gamesToday, lastPlayedAt: cv.lastPlayedAt, totalMatches: c.seedTotalBeforeToday + cv.gamesToday }
    })
  }

  function getSnapshotState(): SnapshotState {
    cachedSnapshotState ??= computeSnapshotState()
    return cachedSnapshotState
  }

  function getHistoryState(): HistoryState {
    cachedHistoryState ??= computeHistoryState()
    return cachedHistoryState
  }

  function getActivityState(): ActivityEntry[] {
    cachedActivityState ??= computeActivityState()
    return cachedActivityState
  }

  function getCaptainsState(): CaptainProfile[] {
    cachedCaptainsState ??= computeCaptainsState()
    return cachedCaptainsState
  }

  function listStaff(): StaffRosterItem[] {
    return STAFF_SEED.map(({ id, name, role }) => ({ id, name, role }))
  }

  function verifyStaffPin(staffId: string, pin: string): boolean {
    return STAFF_SEED.some((s) => s.id === staffId && s.pin === pin)
  }

  // ── Actions ────────────────────────────────────────────────────────────
  const actions: SessionActions = {
    async addToLine(team) {
      if (!session) throw new Error('no active session')
      const captainId = resolveCaptainRef(team)
      appendToLine(captainId)
      logActivity('line.addToLine', { captainA: nameOf(captainId) })
      notify()
    },

    async searchTeams(q) {
      const query = q.trim().toLowerCase()
      if (!query) return []
      return [...captains.values()]
        .filter((c) => c.name.toLowerCase().includes(query) || (c.nickname?.toLowerCase().includes(query) ?? false))
        .slice(0, 20)
        .map((c) => toCaptainSearchResult(c.id))
    },

    async reorderLine(entryIds) {
      if (forceReorderReject) throw new Error('simulated reorder rejection')
      const currentIds = lineOrder
      const sameSet = entryIds.length === currentIds.length && currentIds.every((id) => entryIds.includes(id))
      if (!sameSet) throw new Error('invalid reorder payload')
      lineOrder = [...entryIds]
      logActivity('line.reorder', {})
      notify()
    },

    async moveTop(entryId) {
      if (!lineEntries.has(entryId)) throw new Error('line entry not found')
      lineOrder = [entryId, ...lineOrder.filter((id) => id !== entryId)]
      logActivity('line.reorder', {})
      notify()
    },

    async moveBottom(entryId) {
      if (!lineEntries.has(entryId)) throw new Error('line entry not found')
      lineOrder = [...lineOrder.filter((id) => id !== entryId), entryId]
      logActivity('line.reorder', {})
      notify()
    },

    async removeFromLine(entryId): Promise<UndoableResult> {
      const idx = lineOrder.indexOf(entryId)
      const entry = idx === -1 ? undefined : lineEntries.get(entryId)
      if (!entry) throw new Error('line entry not found')
      lineOrder.splice(idx, 1)
      lineEntries.delete(entryId)
      const teamName = nameOf(entry.captainId)
      const logEntry = logActivity('line.remove', { captainA: teamName })
      logEntry.undo = { type: 'removeLine', entry, restoreIndex: idx }
      notify()
      return { activityId: logEntry.id }
    },

    async startMatch(entryIds) {
      if (!session) throw new Error('no active session')
      if (liveMatchId) throw new Error('field occupied')

      let picked: [InternalLineEntry, InternalLineEntry]
      if (entryIds) {
        const [idA, idB] = entryIds
        const a = lineEntries.get(idA)
        const b = lineEntries.get(idB)
        if (!a || !b) throw new Error('line entry not found')
        picked = [a, b]
      } else {
        const frontTwo = lineOrder.slice(0, 2).map((id) => lineEntries.get(id)!)
        if (frontTwo.length < 2) throw new Error('line has fewer than two teams')
        picked = [frontTwo[0]!, frontTwo[1]!]
      }

      const [a, b] = picked
      lineOrder = lineOrder.filter((id) => id !== a.id && id !== b.id)
      lineEntries.delete(a.id)
      lineEntries.delete(b.id)

      const m: InternalMatch = {
        id: newId('match'),
        captainAId: a.captainId,
        captainBId: b.captainId,
        status: 'live',
        plannedDurationSec: session.matchDurationSec,
        startedAt: nowIso(),
        pausedAt: null,
        accumulatedPauseSec: 0,
        endedAt: null,
        endReason: null,
        startedByName: getActorName(),
        endedByName: null,
        actualDurationSec: null,
      }
      matches.set(m.id, m)
      liveMatchId = m.id
      logActivity('match.start', { captainA: nameOf(a.captainId), captainB: nameOf(b.captainId), fieldName: FIELD_NAME })
      notify()
    },

    async pause(matchId) {
      const m = matches.get(matchId)
      if (!m || m.id !== liveMatchId || m.status !== 'live') throw new Error('invalid transition')
      m.pausedAt = nowIso()
      m.status = 'paused'
      logActivity('match.pause', { captainA: nameOf(m.captainAId), captainB: nameOf(m.captainBId) })
      notify()
    },

    async resume(matchId) {
      const m = matches.get(matchId)
      if (!m || m.id !== liveMatchId || m.status !== 'paused' || !m.pausedAt) throw new Error('invalid transition')
      const pauseSpanSec = Math.floor((Date.now() - new Date(m.pausedAt).getTime()) / 1000)
      m.accumulatedPauseSec += pauseSpanSec
      m.pausedAt = null
      m.status = 'live'
      logActivity('match.resume', { captainA: nameOf(m.captainAId), captainB: nameOf(m.captainBId) })
      notify()
    },

    async finish(matchId): Promise<UndoableResult> {
      const m = matches.get(matchId)
      if (!m || m.id !== liveMatchId) throw new Error('invalid transition')
      const before = structuredClone(m)
      const nowMs = Date.now()
      const totalPauseSec = m.accumulatedPauseSec + (m.pausedAt ? Math.floor((nowMs - new Date(m.pausedAt).getTime()) / 1000) : 0)
      const elapsedWallSec = Math.floor((nowMs - new Date(m.startedAt!).getTime()) / 1000)
      m.status = 'finished'
      m.endedAt = new Date(nowMs).toISOString()
      m.endReason = 'manual'
      m.endedByName = getActorName()
      m.pausedAt = null
      m.actualDurationSec = Math.max(0, elapsedWallSec - totalPauseSec)
      liveMatchId = null
      const entry = logActivity('match.finish.manual', { captainA: nameOf(m.captainAId), captainB: nameOf(m.captainBId), fieldName: FIELD_NAME })
      entry.undo = { type: 'finish', match: before }
      notify()
      return { activityId: entry.id }
    },

    async extend(matchId) {
      const m = matches.get(matchId)
      if (!m || m.id !== liveMatchId) throw new Error('invalid transition')
      m.plannedDurationSec += 60
      extensionsCount += 1
      logActivity('match.extend', { captainA: nameOf(m.captainAId), captainB: nameOf(m.captainBId) })
      notify()
    },

    async replay(matchId) {
      if (!session) throw new Error('no active session')
      const m = matches.get(matchId)
      if (!m) throw new Error('match not found')
      appendToLine(m.captainAId)
      appendToLine(m.captainBId)
      logActivity('match.replay', { captainA: nameOf(m.captainAId), captainB: nameOf(m.captainBId) })
      notify()
    },

    async undo(activityId) {
      const entry = logEntries.find((e) => e.id === activityId)
      if (!entry || !entry.undo || entry.consumed) throw new Error('undo expired')
      if (entry.undo.type === 'removeLine') {
        const { entry: lineEntry, restoreIndex } = entry.undo
        lineEntries.set(lineEntry.id, lineEntry)
        const idx = Math.min(restoreIndex, lineOrder.length)
        lineOrder.splice(idx, 0, lineEntry.id)
      } else {
        if (liveMatchId !== null) throw new Error('field is occupied — cannot restore')
        const { match } = entry.undo
        matches.set(match.id, match)
        liveMatchId = match.id
      }
      entry.consumed = true
      logActivity('match.undo', {})
      notify()
    },

    async openSession(cfg: OpenSessionBody) {
      if (session) throw new Error('one active session per center')
      session = {
        id: newId('session'),
        date: new Date().toISOString().slice(0, 10),
        location: cfg.location ?? null,
        matchDurationSec: cfg.matchDurationSec,
        status: 'active',
      }
      logActivity('session.open', {})
      notify()
    },

    async closeSession() {
      if (!session) throw new Error('no active session')
      if (liveMatchId) throw new Error('live match in progress')
      lineOrder = []
      lineEntries.clear()
      logActivity('session.close', {})
      session = null
      notify()
    },

    async updateDuration(matchDurationSec) {
      if (!session) throw new Error('no active session')
      session.matchDurationSec = matchDurationSec
      logActivity('session.updateDuration', {})
      notify()
    },

    async updateTeam(id, patch: CaptainProfilePatch) {
      const c = captains.get(id)
      if (!c) throw new Error('captain not found')
      if (patch.nickname !== undefined) c.nickname = patch.nickname || null
      if (patch.tags !== undefined) c.tags = patch.tags
      if (patch.note !== undefined) c.note = patch.note
      logActivity('team.update', {})
      notify()
    },
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshotState,
    getHistoryState,
    getActivityState,
    getCaptainsState,
    listStaff,
    verifyStaffPin,
    actions,
    setReorderRejects(reject: boolean) {
      forceReorderReject = reject
    },
  }
}
