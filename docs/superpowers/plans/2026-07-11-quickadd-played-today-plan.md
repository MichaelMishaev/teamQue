# Quick re-add: "played today" in QuickAddBar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff re-add a captain who already played today with 1-2 taps, by revealing a "played today" list in the existing `QuickAddBar` when it's focused with an empty query — no new screen, no dialog.

**Architecture:** A new read-only endpoint (`GET /captains/recent`) computes the eligible candidate list server-side (played this session, not currently in the line or live/paused on the field), ordered by recency and capped at 8. The web app wires this through the existing `SessionActions` abstraction (real + mock implementations already exist for `searchTeams` — this follows the identical pattern) and `QuickAddBar` renders the same `CaptainSearchResult` row it already uses for typed search, just triggered by focus instead of typing.

**Tech Stack:** NestJS + Drizzle + Postgres (`apps/api`), React 19 + Vite + Vitest + Testing Library (`apps/web`), zod contracts (`packages/shared`, unchanged by this plan — `CaptainSearchResult` already covers the response shape).

## Global Constraints

- TDD: write the failing test before the implementation for every step below; a failing test is frozen — fix the implementation, never the test (CLAUDE.md).
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` (CLAUDE.md).
- i18n: zero hardcoded user-facing strings — every string through `apps/web/src/i18n/he.json` + typed `t()`; a missing key is a compile error (CLAUDE.md).
- RTL: logical properties only (`ms-*/me-*/ps-*/pe-*`); `ml/mr/left/right` are forbidden (CLAUDE.md).
- No `console.log` in production code (CLAUDE.md).
- "Played today" candidates: `gamesToday > 0` this session, **not** currently in the line, **not** the captain of a `live`/`paused` match; ordered by `lastPlayedAt` desc; capped at **8** (design spec `docs/superpowers/specs/2026-07-11-quickadd-played-today-design.md`).
- Re-added captains join the **back** of the line — reuses the existing `addToLine` path unchanged, no new positioning logic (design spec).

---

### Task 1: API — `GET /captains/recent`

**Files:**
- Modify: `apps/api/src/captains/captains.service.ts`
- Modify: `apps/api/src/captains/captains.controller.ts`
- Modify: `docs/prds/technical-prd.md:232` (API surface table)
- Test: `apps/api/test/captains.int.test.ts`

**Interfaces:**
- Consumes: `getCaptainSessionStats(db, sessionId, captainIds): Promise<Map<string, {gamesToday: number, lastPlayedAt: string | null}>>` from `apps/api/src/captains/session-stats.ts` (existing, unchanged). `queueEntries` table (`sessionId`, `captainId` columns) from `apps/api/src/db/schema.ts` (existing, unchanged).
- Produces: `CaptainsService.recentlyPlayed(centerId: string): Promise<CaptainSearchResult[]>` and route `GET /captains/recent` → same `CaptainSearchResult[]` shape as `GET /captains?q=`. Task 2 (web) calls this route by URL string only — no new shared types.

- [ ] **Step 1: Write the failing integration tests**

Add `queueEntries` to the existing schema import at the top of `apps/api/test/captains.int.test.ts` (currently `import { activityLog, captains, centers, fields, matches, sessions, staff } from '../src/db/schema'`):

```ts
import { activityLog, captains, centers, fields, matches, queueEntries, sessions, staff } from '../src/db/schema'
```

Then add a new `describe` block, as a sibling of the existing `describe('GET /captains', ...)` block (after its closing `})` around line 268, still inside the outer `describe('captains (integration)', ...)` so it has access to `pg`, `app`, `seedCenter`, `seedCaptain`, `seedActiveSession`, `seedMatch`):

```ts
  describe('GET /captains/recent', () => {
    it('returns only captains who played this session, most-recent first, excluding anyone in the line or live/paused', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)

      const eligibleOlder = await seedCaptain(centerId, { name: 'שוחק ישן' })
      const eligibleNewer = await seedCaptain(centerId, { name: 'שוחק חדש' })
      const inLine = await seedCaptain(centerId, { name: 'בתור' })
      const onField = await seedCaptain(centerId, { name: 'על המגרש' })
      const neverPlayed = await seedCaptain(centerId, { name: 'לא שיחק' })
      const busyOpponent = await seedCaptain(centerId, { name: 'יריב בתור' })
      const fieldOpponent = await seedCaptain(centerId, { name: 'יריב על המגרש' })

      await seedMatch(sessionId, centerId, eligibleOlder, busyOpponent, {
        status: 'finished',
        startedAt: new Date('2026-07-10T17:00:00.000Z'),
        endedAt: new Date('2026-07-10T17:05:00.000Z'),
      })
      await seedMatch(sessionId, centerId, eligibleNewer, busyOpponent, {
        status: 'finished',
        startedAt: new Date('2026-07-10T18:00:00.000Z'),
        endedAt: new Date('2026-07-10T18:05:00.000Z'),
      })
      await seedMatch(sessionId, centerId, inLine, busyOpponent, {
        status: 'finished',
        startedAt: new Date('2026-07-10T16:00:00.000Z'),
        endedAt: new Date('2026-07-10T16:05:00.000Z'),
      })
      // inLine and busyOpponent both played, but are currently in the line —
      // neither should reappear as a re-add suggestion.
      await pg.db.insert(queueEntries).values([
        { sessionId, centerId, captainId: inLine, position: 1, createdAt: new Date() },
        { sessionId, centerId, captainId: busyOpponent, position: 2, createdAt: new Date() },
      ])
      // onField and fieldOpponent are mid-match right now — busy, not "eligible to re-add".
      await seedMatch(sessionId, centerId, onField, fieldOpponent, { status: 'live', startedAt: new Date('2026-07-10T19:00:00.000Z') })

      const res = await request(app.getHttpServer()).get('/captains/recent').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      const ids = (res.body as Array<{ id: string }>).map((c) => c.id)
      expect(ids).toEqual([eligibleNewer, eligibleOlder])
      expect(ids).not.toContain(inLine)
      expect(ids).not.toContain(busyOpponent)
      expect(ids).not.toContain(onField)
      expect(ids).not.toContain(fieldOpponent)
      expect(ids).not.toContain(neverPlayed)
    })

    it('caps results at 8, keeping the most recent', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const opponent = await seedCaptain(centerId, { name: 'יריב קבוע' })

      const ids: string[] = []
      for (let i = 0; i < 10; i++) {
        const id = await seedCaptain(centerId, { name: `שחקן ${i}` })
        ids.push(id)
        await seedMatch(sessionId, centerId, id, opponent, {
          status: 'finished',
          startedAt: new Date(Date.UTC(2026, 6, 10, 17, i, 0)),
          endedAt: new Date(Date.UTC(2026, 6, 10, 17, i, 30)),
        })
      }
      // the shared opponent played every match too, but sits in the line —
      // keeps the eligible pool to exactly the 10 "שחקן i" captains.
      await pg.db.insert(queueEntries).values({ sessionId, centerId, captainId: opponent, position: 1, createdAt: new Date() })

      const res = await request(app.getHttpServer()).get('/captains/recent').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toHaveLength(8)
      const returnedIds = (res.body as Array<{ id: string }>).map((c) => c.id)
      expect(returnedIds).toEqual([...ids].reverse().slice(0, 8))
    })

    it('returns [] when there is no active session', async () => {
      const { centerId, staffCookies } = await seedCenter()
      await seedCaptain(centerId, { name: 'קפטן' })

      const res = await request(app.getHttpServer()).get('/captains/recent').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      expect(res.body).toEqual([])
    })

    it('each result matches captainSearchResultSchema with correct gamesToday/lastPlayedAt/totalMatches', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const sessionId = await seedActiveSession(centerId, staffId)
      const captainId = await seedCaptain(centerId, { name: 'ותיק' })
      const opponent = await seedCaptain(centerId, { name: 'יריב' })
      const playedAt = new Date('2026-07-10T18:00:00.000Z')
      await seedMatch(sessionId, centerId, captainId, opponent, { status: 'finished', startedAt: playedAt, endedAt: playedAt })
      const [pastSession] = await pg.db
        .insert(sessions)
        .values({ centerId, date: '2026-01-01', matchDurationSec: 300, status: 'closed', createdBy: staffId })
        .returning()
      if (!pastSession) throw new Error('session insert returned no row')
      await seedMatch(pastSession.id, centerId, captainId, opponent, { status: 'finished' })

      const res = await request(app.getHttpServer()).get('/captains/recent').set('Cookie', staffCookies)

      expect(res.status).toBe(200)
      const result = res.body[0]
      expect(captainSearchResultSchema.safeParse(result).success).toBe(true)
      expect(result).toMatchObject({ id: captainId, gamesToday: 1, lastPlayedAt: playedAt.toISOString(), totalMatches: 2 })
    })
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter api vitest run test/captains.int.test.ts -t "GET /captains/recent"`
Expected: FAIL — `404` (no such route) or a request error, since `GET /captains/recent` doesn't exist yet.

- [ ] **Step 3: Implement `CaptainsService.recentlyPlayed`**

In `apps/api/src/captains/captains.service.ts`, update the schema import to add `queueEntries`:

```ts
import { captains, matches, queueEntries, sessions } from '../db/schema'
```

Add a new import for the session-stats helper (this file currently has no import from `./session-stats`):

```ts
import { getCaptainSessionStats } from './session-stats'
```

Add a `RECENT_LIMIT` constant next to the existing `SEARCH_LIMIT`:

```ts
const SEARCH_LIMIT = 20
const RECENT_LIMIT = 8
```

Add a new public method to the `CaptainsService` class, placed directly after `search()` (before `create()`):

```ts
  /**
   * Captains eligible for a fast re-add: played at least once in the
   * center's active session (same "played" = live/paused/finished rule as
   * search()), and NOT currently in the line or on the field right now.
   * Ordered by lastPlayedAt desc, capped at RECENT_LIMIT. No active session
   * -> nothing has "played today" -> [].
   */
  async recentlyPlayed(centerId: string): Promise<CaptainSearchResult[]> {
    const sessionId = await this.activeSessionIdOrNil(centerId)
    if (sessionId === NIL_SESSION_ID) return []

    const playedFilter = sql`${matches.status} in ('live','paused','finished')`
    const matchRows = await this.db
      .select({ captainAId: matches.captainAId, captainBId: matches.captainBId, status: matches.status })
      .from(matches)
      .where(and(eq(matches.sessionId, sessionId), playedFilter))

    const playedIds = new Set<string>()
    const busyIds = new Set<string>()
    for (const row of matchRows) {
      playedIds.add(row.captainAId)
      playedIds.add(row.captainBId)
      if (row.status === 'live' || row.status === 'paused') {
        busyIds.add(row.captainAId)
        busyIds.add(row.captainBId)
      }
    }

    const queuedRows = await this.db.select({ captainId: queueEntries.captainId }).from(queueEntries).where(eq(queueEntries.sessionId, sessionId))
    for (const row of queuedRows) busyIds.add(row.captainId)

    const eligibleIds = [...playedIds].filter((id) => !busyIds.has(id))
    if (eligibleIds.length === 0) return []

    const stats = await getCaptainSessionStats(this.db, sessionId, eligibleIds)
    const rows = await this.db
      .select({ id: captains.id, name: captains.name, nickname: captains.nickname, note: captains.note, tags: captains.tags })
      .from(captains)
      .where(inArray(captains.id, eligibleIds))

    const ranked = rows
      .map((r) => ({ ...r, ...(stats.get(r.id) ?? { gamesToday: 0, lastPlayedAt: null }) }))
      .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
      .slice(0, RECENT_LIMIT)

    const totals = await this.totalMatchesByIds(ranked.map((r) => r.id))
    return ranked.map((r) => ({
      id: r.id,
      name: r.name,
      nickname: r.nickname,
      note: r.note,
      tags: r.tags,
      gamesToday: r.gamesToday,
      lastPlayedAt: r.lastPlayedAt,
      totalMatches: totals.get(r.id) ?? 0,
    }))
  }
```

In `apps/api/src/captains/captains.controller.ts`, add a new route directly after `search()` (before `create()`):

```ts
  @Get('recent')
  async recent(@Req() req: StaffAuthenticatedRequest): Promise<CaptainSearchResult[]> {
    return this.captainsService.recentlyPlayed(req.centerId)
  }
```

No new imports needed in the controller — `Get`, `Req`, `StaffAuthenticatedRequest`, `CaptainSearchResult` are already imported.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter api vitest run test/captains.int.test.ts`
Expected: PASS — all `GET /captains` and `GET /captains/recent` tests green.

- [ ] **Step 5: Update the API surface doc**

In `docs/prds/technical-prd.md`, insert a new row directly after line 232 (`| \`GET  /captains?q=\` | Search; each hit includes \`gamesToday\`, \`lastPlayedAt\` |`):

```
| `GET  /captains/recent` | "Played today" captains eligible for a fast re-add — excludes anyone currently in the line or live/paused on a field |
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/captains/captains.service.ts apps/api/src/captains/captains.controller.ts apps/api/test/captains.int.test.ts docs/prds/technical-prd.md
git commit -m "feat(api): add GET /captains/recent for played-today quick re-add"
```

---

### Task 2: Web state layer — `recentlyPlayed()` action

**Files:**
- Modify: `apps/web/src/state/SessionActions.ts`
- Modify: `apps/web/src/state/real/realSessionActions.ts`
- Test: `apps/web/src/state/real/realSessionActions.test.ts`
- Modify: `apps/web/src/state/mock/mockSession.ts`
- Test: `apps/web/src/state/mock/mockSession.test.ts`
- Modify (compile fix — each builds a full `SessionActions` object literal): `apps/web/src/screens/MainScreen.test.tsx`, `apps/web/src/screens/HistoryScreen.test.tsx`, `apps/web/src/components/QueueActionsSheet.test.tsx`, `apps/web/src/screens/SettingsScreen.test.tsx`, `apps/web/src/components/CaptainSheet.test.tsx`, `apps/web/src/components/QueueList.test.tsx`, `apps/web/src/components/QuickAddBar.test.tsx`

**Interfaces:**
- Consumes: `GET /captains/recent` (Task 1) via `apiGet` from `apps/web/src/lib/api.ts` (existing, unchanged — same helper `searchTeams` already uses).
- Produces: `SessionActions.recentlyPlayed(): Promise<CaptainSearchResult[]>`. Task 3 (`QuickAddBar.tsx`) calls `actions.recentlyPlayed()` on focus.

- [ ] **Step 1: Add the method to the `SessionActions` interface**

In `apps/web/src/state/SessionActions.ts`, add directly after the existing `searchTeams(q: string): Promise<CaptainSearchResult[]>` line:

```ts
  /** Captains eligible for a fast re-add: played today, not currently in the line or live/paused. Most-recent first, capped. */
  recentlyPlayed(): Promise<CaptainSearchResult[]>
```

This alone will break the TypeScript build across every file that constructs a full `SessionActions` object literal — Steps 2–6 below fix the two real implementations, and the final step fixes the remaining test files.

- [ ] **Step 2: Write the failing real-implementation test**

In `apps/web/src/state/real/realSessionActions.test.ts`, add a new `it` directly after the existing `'searchTeams GETs /captains?q= and skips the call for a blank query'` test:

```ts
  it('recentlyPlayed GETs /captains/recent', async () => {
    vi.mocked(apiGet).mockResolvedValue([{ id: 'cap-1' }])
    const actions = createRealSessionActions(sessionHandle('s1'))

    const results = await actions.recentlyPlayed()
    expect(apiGet).toHaveBeenCalledWith('/captains/recent')
    expect(results).toEqual([{ id: 'cap-1' }])
  })
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web vitest run src/state/real/realSessionActions.test.ts -t "recentlyPlayed"`
Expected: FAIL — TypeScript error, `recentlyPlayed` does not exist on the object returned by `createRealSessionActions`.

- [ ] **Step 4: Implement `recentlyPlayed` in `realSessionActions.ts`**

In `apps/web/src/state/real/realSessionActions.ts`, add directly after the existing `searchTeams` method:

```ts
    async recentlyPlayed() {
      return apiGet<CaptainSearchResult[]>('/captains/recent')
    },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web vitest run src/state/real/realSessionActions.test.ts`
Expected: PASS — all tests in the file green.

- [ ] **Step 6: Write the failing mock-implementation test**

In `apps/web/src/state/mock/mockSession.test.ts`, add a new `describe` block at the end of the file, as a sibling of the existing top-level `describe` blocks:

```ts
describe('mockSession recentlyPlayed', () => {
  it('returns captains who played this session, excluding anyone currently live/paused or in the line, most-recent first', async () => {
    const session = createMockSession()
    const recent = await session.actions.recentlyPlayed()
    // seed data: c11 (דניאל/הקטן) played 45m ago; c7 (אלון) and c9 (גיא) 55m ago (tie, seed order breaks it);
    // c3 (יוסי) and c5 (עומר) 70m ago (tie, seed order breaks it). c1/c2 are live, c6 played but is in the line.
    expect(recent.map((c) => c.nickname ?? c.name)).toEqual(['הקטן', 'אלון', 'גיא', 'יוסי', 'עומר'])
  })

  it('excludes a captain once they are added back into the line', async () => {
    const session = createMockSession()
    const before = await session.actions.recentlyPlayed()
    const first = before[0]
    if (!first) throw new Error('expected at least one recently-played captain in the seed')

    await session.actions.addToLine({ id: first.id })
    const after = await session.actions.recentlyPlayed()

    expect(after.some((c) => c.id === first.id)).toBe(false)
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `pnpm --filter web vitest run src/state/mock/mockSession.test.ts -t "recentlyPlayed"`
Expected: FAIL — TypeScript error, `recentlyPlayed` does not exist on `session.actions`.

- [ ] **Step 8: Implement `recentlyPlayed` in `mockSession.ts`**

In `apps/web/src/state/mock/mockSession.ts`, add directly after the existing `searchTeams` method inside the `actions` object:

```ts
    async recentlyPlayed() {
      if (!session) return []
      const busyIds = new Set<string>()
      for (const entry of lineEntries.values()) busyIds.add(entry.captainId)
      if (liveMatchId) {
        const live = matches.get(liveMatchId)
        if (live) {
          busyIds.add(live.captainAId)
          busyIds.add(live.captainBId)
        }
      }
      return [...captains.keys()]
        .map((id) => toCaptainSearchResult(id))
        .filter((c) => c.gamesToday > 0 && !busyIds.has(c.id))
        .sort((a, b) => (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? ''))
        .slice(0, 8)
    },
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --filter web vitest run src/state/mock/mockSession.test.ts`
Expected: PASS — all tests in the file green.

- [ ] **Step 10: Fix the remaining test files so the project compiles**

Each of these files builds a full `SessionActions` object literal for mocking; add `recentlyPlayed: vi.fn().mockResolvedValue([]),` directly after each file's existing `searchTeams: ...` line.

`apps/web/src/screens/MainScreen.test.tsx:12` — change:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
```
to:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
    recentlyPlayed: vi.fn().mockResolvedValue([]),
```

`apps/web/src/screens/HistoryScreen.test.tsx:12` — change:
```ts
    searchTeams: vi.fn(),
```
to:
```ts
    searchTeams: vi.fn(),
    recentlyPlayed: vi.fn(),
```

`apps/web/src/components/QueueActionsSheet.test.tsx:14` — change:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
```
to:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
    recentlyPlayed: vi.fn().mockResolvedValue([]),
```

`apps/web/src/screens/SettingsScreen.test.tsx:13` — change:
```ts
    searchTeams: vi.fn(),
```
to:
```ts
    searchTeams: vi.fn(),
    recentlyPlayed: vi.fn(),
```

`apps/web/src/components/CaptainSheet.test.tsx:24` — change:
```ts
    searchTeams: vi.fn(),
```
to:
```ts
    searchTeams: vi.fn(),
    recentlyPlayed: vi.fn(),
```

`apps/web/src/components/QueueList.test.tsx:14` — change:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
```
to:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
    recentlyPlayed: vi.fn().mockResolvedValue([]),
```

`apps/web/src/components/QuickAddBar.test.tsx:14` — change:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
```
to:
```ts
    searchTeams: vi.fn().mockResolvedValue([]),
    recentlyPlayed: vi.fn().mockResolvedValue([]),
```

- [ ] **Step 11: Run the full web test suite and typecheck**

Run: `pnpm --filter web typecheck && pnpm --filter web test`
Expected: PASS — no TypeScript errors, all existing tests still green (none of these edits change any test's behavior, only satisfy the interface).

- [ ] **Step 12: Commit**

```bash
git add apps/web/src/state/SessionActions.ts apps/web/src/state/real/realSessionActions.ts apps/web/src/state/real/realSessionActions.test.ts apps/web/src/state/mock/mockSession.ts apps/web/src/state/mock/mockSession.test.ts apps/web/src/screens/MainScreen.test.tsx apps/web/src/screens/HistoryScreen.test.tsx apps/web/src/components/QueueActionsSheet.test.tsx apps/web/src/screens/SettingsScreen.test.tsx apps/web/src/components/CaptainSheet.test.tsx apps/web/src/components/QueueList.test.tsx apps/web/src/components/QuickAddBar.test.tsx
git commit -m "feat(web): add recentlyPlayed session action (real + mock)"
```

---

### Task 3: Web UI — `QuickAddBar` reveals "played today" on focus

**Files:**
- Modify: `apps/web/src/i18n/he.json`
- Modify: `apps/web/src/components/QuickAddBar.tsx`
- Test: `apps/web/src/components/QuickAddBar.test.tsx`

**Interfaces:**
- Consumes: `actions.recentlyPlayed(): Promise<CaptainSearchResult[]>` (Task 2). `CaptainSearchResult` component (`apps/web/src/components/CaptainSearchResult.tsx`, existing, unchanged) — same `name`/`nickname`/`gamesToday`/`lastPlayedAt`/`onSelect` props already used for typed search.
- Produces: nothing consumed by a later task — this is the final, user-facing task.

- [ ] **Step 1: Add the i18n key**

In `apps/web/src/i18n/he.json`, insert directly after the existing `"quickAdd.searchPlaceholder": "חיפוש קפטן…",` line:

```json
  "quickAdd.playedToday": "שיחקו היום",
```

- [ ] **Step 2: Write the failing component tests**

In `apps/web/src/components/QuickAddBar.test.tsx`, add two new `it` blocks inside the existing `describe('QuickAddBar', ...)`, after the existing `'flags a duplicate hint...'` test:

```ts
  it('focusing the empty bar shows "played today" results with a header label; picking one calls addToLine', async () => {
    const recentlyPlayed = vi.fn().mockResolvedValue([team('c9', 'אלון', 2)])
    const addToLine = vi.fn().mockResolvedValue(undefined)
    renderBar({ recentlyPlayed, addToLine })

    fireEvent.focus(screen.getByPlaceholderText('חיפוש קפטן…'))
    await screen.findByText('שיחקו היום')
    await screen.findByText('אלון')
    fireEvent.click(screen.getByText('בחר'))

    await waitFor(() => expect(addToLine).toHaveBeenCalledWith({ id: 'c9' }))
  })

  it('typing after focus switches back to the typed-search panel, hiding "played today"', async () => {
    const recentlyPlayed = vi.fn().mockResolvedValue([team('c9', 'אלון', 2)])
    const searchTeams = vi.fn().mockResolvedValue([team('c1', 'דניאל', 3)])
    renderBar({ recentlyPlayed, searchTeams })

    const input = screen.getByPlaceholderText('חיפוש קפטן…')
    fireEvent.focus(input)
    await screen.findByText('אלון')

    fireEvent.change(input, { target: { value: 'דנ' } })
    await screen.findByText('דניאל', {}, { timeout: 1000 })
    expect(screen.queryByText('שיחקו היום')).toBeNull()
  })

  it('clearing the query back to empty re-reveals "played today" instead of an empty panel', async () => {
    const recentlyPlayed = vi.fn().mockResolvedValue([team('c9', 'אלון', 2)])
    renderBar({ recentlyPlayed })

    const input = screen.getByPlaceholderText('חיפוש קפטן…')
    fireEvent.focus(input)
    await screen.findByText('אלון')

    fireEvent.change(input, { target: { value: 'ד' } })
    await waitFor(() => expect(screen.queryByText('שיחקו היום')).toBeNull())

    fireEvent.change(input, { target: { value: '' } })
    await screen.findByText('שיחקו היום')
    expect(await screen.findByText('אלון')).toBeDefined()
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter web vitest run src/components/QuickAddBar.test.tsx -t "played today"`
Expected: FAIL — no element with text `שיחקו היום` is rendered yet (focusing the input currently does nothing).

- [ ] **Step 4: Implement the reveal-on-focus behavior**

Replace the full contents of `apps/web/src/components/QuickAddBar.tsx` with:

```tsx
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
 * addToLine directly (zero extra taps) and resets. Focusing the bar while
 * empty reveals "played today" (captains eligible for a fast re-add) in the
 * same results panel, ahead of typing anything.
 */

const DEBOUNCE_MS = 150

export function QuickAddBar() {
  const actions = useSessionActions()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CaptainSearchResultData[]>([])
  const [recent, setRecent] = useState<CaptainSearchResultData[]>([])
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

  function onFocus(): void {
    void actions.recentlyPlayed().then(setRecent)
  }

  function reset(): void {
    setQuery('')
    setResults([])
  }

  async function pick(ref: { id: string } | { newName: string }): Promise<void> {
    reset()
    await actions.addToLine(ref)
    navigator.vibrate?.(10)
    void actions.recentlyPlayed().then(setRecent)
  }

  const showSearch = query.trim().length > 0
  const showRecent = !showSearch && recent.length > 0

  return (
    <div
      className="sticky bottom-0 z-10 border-t border-line bg-surface p-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onFocus={onFocus}
        placeholder={t('quickAdd.searchPlaceholder')}
        className="mb-1 min-h-[var(--touch-target-min)] w-full rounded-xl border border-line bg-surface-2 px-3 text-[15px] outline-none"
      />
      {showSearch && (
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
      {showRecent && (
        <div className="max-h-64 overflow-y-auto rounded-xl border border-line bg-surface">
          <div className="px-2 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted">{t('quickAdd.playedToday')}</div>
          {recent.map((c) => (
            <CaptainSearchResult
              key={c.id}
              name={c.name}
              {...(c.nickname ? { nickname: c.nickname } : {})}
              gamesToday={c.gamesToday}
              {...(c.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(c.lastPlayedAt) } : {})}
              onSelect={() => void pick({ id: c.id })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web vitest run src/components/QuickAddBar.test.tsx`
Expected: PASS — all 6 tests in the file green (3 existing + 3 new).

- [ ] **Step 6: Run the full web suite, typecheck, and build**

Run: `pnpm --filter web typecheck && pnpm --filter web test && pnpm --filter web build`
Expected: PASS — no type errors, no test failures, build succeeds.

- [ ] **Step 7: Manual check in the dev server**

Run: `pnpm dev`, open the app in `VITE_DEMO=1` mode (component showcase / demo session). Tap the empty add bar at the bottom of the queue screen — a "שיחקו היום" section should appear above the input listing captains from the seed data who already played and aren't currently in the line or on the field (per the mock seed traced in Task 2: דניאל (הקטן), אלון, גיא, יוסי, עומר). Tap one — it should join the back of the line and disappear from the list on the next focus.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/i18n/he.json apps/web/src/components/QuickAddBar.tsx apps/web/src/components/QuickAddBar.test.tsx
git commit -m "feat(web): reveal played-today captains in QuickAddBar on focus"
```
