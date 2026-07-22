# Match Started Captain Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `match.started` activity rows carry both captains' names, denormalized at write time, so the real-mode Activity feed matches demo mode and shows "התחלת משחק: קפטן א נגד קפטן ב" instead of a bare action label.

**Architecture:** Load both captain names inside the existing kickoff transaction in `MatchesService.start()` and denormalize `captainAName`/`captainBName` into the `match.started` activity's `afterJson` (a new object, not a mutation of the DB row). On the web side, `toActivityEntry` extracts those two fields off `afterJson` when the mapped action is `match.start` and sets them on the returned `ActivityEntry` as `captainA`/`captainB` — fields the feed's renderer already knows how to display.

**Tech Stack:** NestJS + Drizzle + Postgres (API), Vitest + Testcontainers (API integration tests), TypeScript strict mode + Vitest (web unit tests).

## Global Constraints

- No `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — an optional field (`captainA?: string`) must be omitted entirely when there's no value, never assigned `undefined`.
- `apps/api/src/matches/**` is a critical path (this repo's `CLAUDE.md`): touching it makes the whole change critical. The API test in Task 1 is written as a frozen failing test first (TDD) and must not be weakened to make the implementation pass — if it's ever edited after going green, that's a signal the implementation is wrong, not the test.
- No schema migration, no new endpoint, no change to `MatchView` or the `/sessions/:id/start` response shape — only `activity_log.after_json`'s content changes.
- No i18n change — `activity.start`'s message key and the `activityMessage()` captain-pair rendering already exist and are reused as-is.
- Zero hardcoded user-facing strings — not applicable here (no new strings introduced).

---

### Task 1: API — denormalize captain names into `match.started`'s `afterJson`

**Files:**
- Modify: `apps/api/test/matches.int.test.ts` (add test inside `describe('POST /sessions/:id/start', ...)`, after the existing test at line 122)
- Modify: `apps/api/src/matches/matches.service.ts:107-115`

**Interfaces:**
- Consumes: `matchRow` (`MatchRow`, from `../matches/match-view`) — already in scope in `start()`, has `captainAId`/`captainBId`. `captains` table and `inArray` from `drizzle-orm` — both already imported in this file (lines 9, 16).
- Produces: the `activity_log` row written for `action: 'match.started'` has `after_json` = all existing `matches` row fields **plus** `captainAName: string | null` and `captainBName: string | null` (`null` only if a captain row is somehow missing — should not happen in practice since `entryA`/`entryB` were just read from the live line).

- [ ] **Step 1: Write the failing test**

Add this test in `apps/api/test/matches.int.test.ts`, immediately after the test ending at line 122 (`expect(logRow).toMatchObject({ centerId, sessionId, staffId })`), inside the same `describe('POST /sessions/:id/start', ...)` block:

```ts
    it('denormalizes both captain names into the match.started activity afterJson', async () => {
      const { centerId, staffId, staffCookies } = await seedCenter()
      const { sessionId } = await seedSessionWithField(centerId, staffId, 300)
      const a = await seedCaptain(centerId, 'קפטן א')
      const b = await seedCaptain(centerId, 'קפטן ב')
      await seedQueueEntry(sessionId, centerId, a, 1)
      await seedQueueEntry(sessionId, centerId, b, 2)

      const res = await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).set('Cookie', staffCookies).send({})
      expect(res.status).toBe(201)

      const [logRow] = await pg.db
        .select()
        .from(activityLog)
        .where(and(eq(activityLog.entityId, res.body.id), eq(activityLog.action, 'match.started')))
      if (!logRow) throw new Error('activity log row not found')

      const afterJson = logRow.afterJson as { captainAId: string; captainBId: string; captainAName: string; captainBName: string }
      const nameById: Record<string, string> = { [a]: 'קפטן א', [b]: 'קפטן ב' }
      expect(afterJson.captainAName).toBe(nameById[afterJson.captainAId])
      expect(afterJson.captainBName).toBe(nameById[afterJson.captainBId])
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api vitest run test/matches.int.test.ts -t "denormalizes both captain names"`
Expected: FAIL — `afterJson.captainAName` is `undefined`, not a captain name (the current `afterJson` is the raw `matches` row, which has no `captainAName`/`captainBName` field at all).

- [ ] **Step 3: Write minimal implementation**

In `apps/api/src/matches/matches.service.ts`, replace the block from `await this.activity.write(tx, {` (currently line 107) through its closing `})` (currently line 115):

```ts
      const captainRows = await tx
        .select({ id: captains.id, name: captains.name })
        .from(captains)
        .where(inArray(captains.id, [matchRow.captainAId, matchRow.captainBId]))
      const captainAName = captainRows.find((c) => c.id === matchRow.captainAId)?.name ?? null
      const captainBName = captainRows.find((c) => c.id === matchRow.captainBId)?.name ?? null

      await this.activity.write(tx, {
        centerId,
        sessionId,
        staffId,
        action: 'match.started',
        entityType: 'match',
        entityId: matchRow.id,
        afterJson: { ...matchRow, captainAName, captainBName },
      })
```

Leave everything else in `start()` untouched — `matchRow` itself is still the plain DB row passed to `buildMatchView(tx, matchRow)` on the next line.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter api vitest run test/matches.int.test.ts`
Expected: PASS — every test in the file, including the new one and the pre-existing `'pairs the front two line entries...'` test whose `logRow` assertion (`toMatchObject({ centerId, sessionId, staffId })`) still holds since `toMatchObject` ignores extra fields.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/matches.int.test.ts apps/api/src/matches/matches.service.ts
git commit -m "$(cat <<'EOF'
feat(api): denormalize captain names into match.started activity log

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Web — extract captain names from `match.start`'s `afterJson`

**Files:**
- Modify: `apps/web/src/state/real/readAdapters.test.ts` (add tests inside `describe('toActivityEntry', ...)`)
- Modify: `apps/web/src/state/real/readAdapters.ts`

**Interfaces:**
- Consumes: `WireActivityEntry.afterJson` (`unknown | null`, from `packages/shared/src/reads.ts`), `WireActivityEntry.action` (`string`).
- Produces: `ActivityEntry.captainA?: string` / `captainB?: string` (already-existing optional fields on the type in `apps/web/src/state/ActivityContext.tsx`) are set, only as non-empty strings, when the mapped action is `'match.start'` and the corresponding name is present in `afterJson`.

- [ ] **Step 1: Write the failing test**

Add these tests in `apps/web/src/state/real/readAdapters.test.ts`, inside the existing `describe('toActivityEntry', ...)` block (after the `it.each` block ending at line 90, before the closing `})` of that `describe`):

```ts
  it('extracts both captain names from afterJson for match.started', () => {
    const e = toActivityEntry({
      ...base,
      action: 'match.started',
      staffId: 'staff-1',
      afterJson: { captainAId: 'a', captainAName: 'קפטן א', captainBId: 'b', captainBName: 'קפטן ב' },
    } as WireActivityEntry, resolve)
    expect(e.action).toBe('match.start')
    expect(e.captainA).toBe('קפטן א')
    expect(e.captainB).toBe('קפטן ב')
  })

  it('omits captain names for match.started when afterJson is malformed, without throwing', () => {
    const e = toActivityEntry({ ...base, action: 'match.started', staffId: 'staff-1', afterJson: null } as WireActivityEntry, resolve)
    expect(e.action).toBe('match.start')
    expect(e.captainA).toBeUndefined()
    expect(e.captainB).toBeUndefined()
  })

  it('does not extract captain names for actions other than match.started', () => {
    const e = toActivityEntry({
      ...base,
      action: 'line.added',
      staffId: 'staff-1',
      afterJson: { captainAName: 'קפטן א', captainBName: 'קפטן ב' },
    } as WireActivityEntry, resolve)
    expect(e.captainA).toBeUndefined()
    expect(e.captainB).toBeUndefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/state/real/readAdapters.test.ts -t "captain"`
Expected: FAIL — `e.captainA` is `undefined` in the first test (current `toActivityEntry` never reads `afterJson` for any action).

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/state/real/readAdapters.ts`, add this helper above `toActivityEntry` (after the `ACTION_MAP` block, before the `toActivityEntry` function):

```ts
function stringField(json: unknown, key: string): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined
  const value = Reflect.get(json, key)
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
```

Then, inside `toActivityEntry`, replace the final `return` statement (the one after the `action` computation, currently):

```ts
  return {
    id: a.id,
    atIso: a.createdAt,
    action,
    rawAction: a.action,
    eventKind: 'action',
    outcome: 'success',
    staffId: a.staffId,
    staffName,
  }
```

with:

```ts
  const captainA = action === 'match.start' ? stringField(a.afterJson, 'captainAName') : undefined
  const captainB = action === 'match.start' ? stringField(a.afterJson, 'captainBName') : undefined

  return {
    id: a.id,
    atIso: a.createdAt,
    action,
    rawAction: a.action,
    eventKind: 'action',
    outcome: 'success',
    staffId: a.staffId,
    staffName,
    ...(captainA !== undefined ? { captainA } : {}),
    ...(captainB !== undefined ? { captainB } : {}),
  }
```

The conditional spread (rather than `captainA: captainA`) is required by `exactOptionalPropertyTypes` — assigning `undefined` directly to an optional field is a type error in this codebase.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/state/real/readAdapters.test.ts`
Expected: PASS — all tests in the file, including the three new ones.

Also run the web package's typecheck to confirm the conditional-spread pattern satisfies `exactOptionalPropertyTypes`:

Run: `pnpm --filter web typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/real/readAdapters.test.ts apps/web/src/state/real/readAdapters.ts
git commit -m "$(cat <<'EOF'
feat(web): render captain names on match.started activity rows

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Manual verification (after both tasks)

1. Run `pnpm --filter web dev` (or `VITE_DEMO=1 pnpm --filter web dev` if no local Postgres/API is running).
2. Start a session, seed two named captains into the line, click "start match."
3. Open the Activity tab (פעילות) and confirm the new `match.started` row reads `התחלת משחק: <captainA> נגד <captainB>` instead of the bare `התחלת משחק` label the screenshot showed.
4. If running against the real API (not demo mode), confirm existing rows written before this change still render fine (no crash) — their `afterJson` predates `captainAName`/`captainBName`, exercising the "malformed/missing JSON → omit names, no throw" path from Task 2.
