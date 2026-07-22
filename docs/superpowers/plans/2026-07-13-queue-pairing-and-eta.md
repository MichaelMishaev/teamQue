# Queue pairing groups + estimated time until match — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group consecutive waiting-line entries into visually merged "pair" cards and show each captain how many games are ahead of them and an estimated time until their match starts.

**Architecture:** Two pure functions (`buildPairGroups`, `computeBaseSec`) in a new `apps/web/src/lib/queue-pairing.ts` derive pairing + ETA from the existing `SessionSnapshot` on every render — no schema or API change. A new presentational `QueuePairGroup` wrapper renders the shared card shape; `QueueRow` gains optional props for the new subtext line; `QueueList` wires them together; `MainScreen` supplies `matchDurationSec` and `baseSec`.

**Tech Stack:** React 19, TypeScript (strict), Tailwind v4, Vitest + Testing Library (jsdom), dnd-kit.

## Global Constraints

- TDD: write the failing test before the implementation for every task below (repo hard rule).
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — optional props are omitted via conditional spread (`{...(cond ? { prop } : {})}`), never passed as literal `undefined`.
- i18n: zero hardcoded Hebrew strings in `.tsx` — every user-facing string goes through `apps/web/src/i18n/he.json` + `t()`.
- RTL: logical properties only; time/number runs are LTR-isolated with `<bdi>` + `tabular` (`font-variant-numeric: tabular-nums`).
- Tokens: components use semantic Tailwind utilities (`bg-surface`, `text-accent`, `border-line`, …) — never a raw hex value.
- Design spec: `docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md` — read it if any task instruction below is ambiguous.
- Test commands are run from the repo root: `pnpm --filter web vitest run <path>` for a single file, `pnpm typecheck` and `pnpm test` before considering the whole plan done.

---

### Task 1: Pure pairing + ETA calculator

**Files:**
- Create: `apps/web/src/lib/queue-pairing.ts`
- Test: `apps/web/src/lib/queue-pairing.test.ts`

**Interfaces:**
- Consumes: nothing (pure, no imports beyond TypeScript itself).
- Produces: `MATCH_GAP_SEC: number`, `PairGroup` interface (`{ pairIndex: number; entryIds: string[]; gamesAhead: number; etaSec: number; hasPartner: boolean }`), `buildPairGroups(entryIds: string[], baseSec: number, matchDurationSec: number): PairGroup[]`, `computeBaseSec(isLive: boolean, liveRemainingSec: number): number`. Tasks 2–5 import all four from `@/lib/queue-pairing`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/queue-pairing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MATCH_GAP_SEC, buildPairGroups, computeBaseSec } from './queue-pairing'

describe('buildPairGroups', () => {
  it('returns no groups for an empty queue', () => {
    expect(buildPairGroups([], 0, 480)).toEqual([])
  })

  it('groups an even queue into full pairs', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd'], 0, 480)
    expect(groups).toEqual([
      { pairIndex: 0, entryIds: ['a', 'b'], gamesAhead: 0, etaSec: 0, hasPartner: true },
      { pairIndex: 1, entryIds: ['c', 'd'], gamesAhead: 1, etaSec: 540, hasPartner: true },
    ])
  })

  it('leaves a trailing odd entry without a partner', () => {
    const groups = buildPairGroups(['a', 'b', 'c'], 0, 480)
    expect(groups[1]).toEqual({ pairIndex: 1, entryIds: ['c'], gamesAhead: 1, etaSec: 540, hasPartner: false })
  })

  it('matches the approved mockup numbers for a 7-entry queue, field free, 8-minute matches', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 0, 480)
    expect(groups.map((g) => g.etaSec)).toEqual([0, 540, 1080, 1620])
    expect(groups.map((g) => g.gamesAhead)).toEqual([0, 1, 2, 3])
    expect(groups[3]?.hasPartner).toBe(false)
  })

  it('adds baseSec as the starting offset for every pair', () => {
    const groups = buildPairGroups(['a', 'b', 'c', 'd'], 200, 480)
    expect(groups.map((g) => g.etaSec)).toEqual([200, 740])
  })
})

describe('computeBaseSec', () => {
  it('is 0 when the field is free', () => {
    expect(computeBaseSec(false, 999)).toBe(0)
  })

  it('is the live match remaining time plus the gap when a match is running', () => {
    expect(computeBaseSec(true, 140)).toBe(140 + MATCH_GAP_SEC)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/lib/queue-pairing.test.ts`
Expected: FAIL — `Cannot find module './queue-pairing'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/lib/queue-pairing.ts`:

```ts
/**
 * Predicted pairing + estimated kickoff time for the waiting line — a display
 * projection only (queue_entries are never persisted as an A-vs-B pairing;
 * two entries pair into a match row only at kickoff, see the doc comment on
 * queueEntries in apps/api/src/db/schema.ts). Pure functions over the
 * current queue order, recomputed on every render — consistent with
 * lib/time.ts's "compute from timestamps, never tick" rule.
 */

/** Seconds staff want between one match ending and the next kicking off. */
export const MATCH_GAP_SEC = 60

export interface PairGroup {
  /** 0-based — how many full pairs play before this one. */
  pairIndex: number
  /** 1 or 2 queue entry ids, in queue order. */
  entryIds: string[]
  /** Equal to pairIndex — surfaced separately so callers don't recompute it. */
  gamesAhead: number
  /** Estimated seconds from now until this pair's match starts. */
  etaSec: number
  /** False for a trailing odd entry with no confirmed opponent yet. */
  hasPartner: boolean
}

/** Groups queue entry ids into consecutive pairs and estimates each pair's kickoff time. */
export function buildPairGroups(entryIds: string[], baseSec: number, matchDurationSec: number): PairGroup[] {
  const groups: PairGroup[] = []
  for (let i = 0; i < entryIds.length; i += 2) {
    const pairIndex = groups.length
    const ids = entryIds.slice(i, i + 2)
    groups.push({
      pairIndex,
      entryIds: ids,
      gamesAhead: pairIndex,
      etaSec: baseSec + pairIndex * (matchDurationSec + MATCH_GAP_SEC),
      hasPartner: ids.length === 2,
    })
  }
  return groups
}

/** baseSec input to buildPairGroups: 0 if the field is free, else the live match's remaining time plus the gap. */
export function computeBaseSec(isLive: boolean, liveRemainingSec: number): number {
  return isLive ? liveRemainingSec + MATCH_GAP_SEC : 0
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/lib/queue-pairing.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/queue-pairing.ts apps/web/src/lib/queue-pairing.test.ts
git commit -m "feat(web): add pure queue pairing + eta calculator"
```

---

### Task 2: `QueuePairGroup` presentational wrapper

**Files:**
- Create: `apps/web/src/components/QueuePairGroup.tsx`
- Test: `apps/web/src/components/QueuePairGroup.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (variant is a plain string union defined here).
- Produces: `QueuePairGroupVariant = 'next' | 'default' | 'solo'`, `QueuePairGroup({ label: string; variant: QueuePairGroupVariant; children: ReactNode })`. Task 4 imports both from `@/components/QueuePairGroup`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/components/QueuePairGroup.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QueuePairGroup } from './QueuePairGroup'

describe('QueuePairGroup', () => {
  it('renders the label and both children rows', () => {
    render(
      <QueuePairGroup label="זוג 2" variant="default">
        <div>Row A</div>
        <div>Row B</div>
      </QueuePairGroup>,
    )
    expect(screen.getByText('זוג 2')).toBeDefined()
    expect(screen.getByText('Row A')).toBeDefined()
    expect(screen.getByText('Row B')).toBeDefined()
  })

  it('renders a single child for a solo (unpaired) group with a dashed border', () => {
    const { container } = render(
      <QueuePairGroup label="ממתין/ה לזוג" variant="solo">
        <div>Row Only</div>
      </QueuePairGroup>,
    )
    expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
    expect(container.querySelector('.border-dashed')).not.toBeNull()
  })

  it('gives the next pair an accent-colored label', () => {
    const { container } = render(
      <QueuePairGroup label="זוג 1 · הבא" variant="next">
        <div>Row</div>
      </QueuePairGroup>,
    )
    expect(container.querySelector('.text-accent')).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueuePairGroup.test.tsx`
Expected: FAIL — `Cannot find module './QueuePairGroup'`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/web/src/components/QueuePairGroup.tsx`:

```tsx
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Single responsibility: visually groups the 1-2 QueueRows of one predicted
 * pair inside a single shared card — the shape carries the "these two play
 * each other" meaning, not color or text alone (see
 * docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md, which
 * documents why an earlier text-only version was rejected). The label sits
 * in normal flow above the card, never absolutely positioned over its
 * border, so it can never be clipped by the card's rounded corners.
 */
export type QueuePairGroupVariant = 'next' | 'default' | 'solo'

export interface QueuePairGroupProps {
  label: string
  variant: QueuePairGroupVariant
  children: ReactNode
}

export function QueuePairGroup({ label, variant, children }: QueuePairGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn('px-1 text-[12px] font-semibold text-muted', variant === 'next' && 'text-accent')}>
        {label}
      </span>
      <div
        className={cn(
          'flex flex-col rounded-xl border border-line bg-surface [&>*+*]:border-t [&>*+*]:border-line',
          variant === 'next' && 'border-accent [&>*+*]:border-accent-dim',
          variant === 'solo' && 'border-dashed',
        )}
      >
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueuePairGroup.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueuePairGroup.tsx apps/web/src/components/QueuePairGroup.test.tsx
git commit -m "feat(web): add QueuePairGroup card wrapper"
```

---

### Task 3: Extend `QueueRow` with games-ahead / eta subtext

**Files:**
- Modify: `apps/web/src/components/QueueRow.tsx`
- Modify: `apps/web/src/components/QueueRow.test.tsx`
- Modify: `apps/web/src/i18n/he.json:27` (insert new keys after `"queue.actions.error"`)

**Interfaces:**
- Consumes: nothing from Tasks 1–2 directly (props are plain `number`/`boolean`, decoupled from `PairGroup`).
- Produces: `QueueRowProps` gains `grouped?: boolean`, `gamesAhead?: number`, `etaSec?: number`, `etaApprox?: boolean`. Task 4's `SortableQueueRow` passes these through.

- [ ] **Step 1: Write the failing tests**

Add to the end of `apps/web/src/components/QueueRow.test.tsx`, inside the existing `describe('QueueRow', ...)` block, just before the final closing `})`:

```tsx
  it('shows a games-ahead + eta line when both are provided', () => {
    render(<QueueRow position={3} teamName="רון" gamesToday={0} gamesAhead={1} etaSec={540} />)
    expect(screen.getByText('משחק אחד לפניך')).toBeDefined()
    expect(screen.getByText('9')).toBeDefined()
  })

  it('uses plural phrasing for more than one game ahead', () => {
    render(<QueueRow position={5} teamName="שלי" gamesToday={0} gamesAhead={2} etaSec={1080} />)
    expect(screen.getByText('2 משחקים לפניך')).toBeDefined()
    expect(screen.getByText('18')).toBeDefined()
  })

  it('marks the eta as approximate for the unpaired leftover entry', () => {
    render(<QueueRow position={7} teamName="מני" gamesToday={0} gamesAhead={3} etaSec={1620} etaApprox />)
    expect(screen.getByText('(משוער)')).toBeDefined()
  })

  it('hides the games-ahead line when gamesAhead is not provided', () => {
    render(<QueueRow position={1} teamName="טל" gamesToday={0} next />)
    expect(screen.queryByText(/לפניך/)).toBeNull()
  })

  it('grouped rows omit their own border and background', () => {
    const { container } = render(<QueueRow position={3} teamName="רון" gamesToday={0} grouped />)
    expect(container.firstElementChild?.className).not.toContain('rounded-xl')
  })

  it('a dragging grouped row still gets its own standalone card styling', () => {
    const { container } = render(<QueueRow position={3} teamName="רון" gamesToday={0} grouped dragging />)
    expect(container.firstElementChild?.className).toContain('rounded-xl')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueueRow.test.tsx`
Expected: FAIL — `gamesAhead`/`etaSec`/`etaApprox`/`grouped` don't exist on `QueueRowProps` (TS error) and/or the new text is never rendered.

- [ ] **Step 3: Write minimal implementation**

Add these four keys to `apps/web/src/i18n/he.json` immediately after line 27 (`"queue.actions.error": "הפעולה נכשלה — נסו שוב",`), before `"quickAdd.searchPlaceholder"`:

```json
  "queue.pair.next": "זוג {index} · הבא",
  "queue.pair.label": "זוג {index}",
  "queue.pair.waiting": "ממתין/ה לזוג",
  "queue.pair.gamesAheadOne": "משחק אחד לפניך",
  "queue.pair.gamesAheadMany": "{count} משחקים לפניך",
  "queue.pair.etaPrefix": "בעוד",
  "queue.pair.etaSuffixMinutes": "דק׳",
  "queue.pair.etaApprox": "(משוער)",
```

Replace the full contents of `apps/web/src/components/QueueRow.tsx` with:

```tsx
import type { HTMLAttributes } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/badge'

/**
 * Single responsibility: one line row — a SINGLE waiting team (design.md §0:
 * the queue is a line of single teams, never "A vs B"). Position, drag
 * handle, ⋯ menu trigger; games-today is the inline fairness surface.
 * dnd-kit listeners attach via handleProps at the screen level; this stays
 * presentational. When rendered inside a QueuePairGroup (`grouped`), this
 * row omits its own border/background/radius — the group supplies them —
 * except while dragging or removing, when it pops back to a standalone card.
 */

export interface QueueRowProps {
  position: number
  teamName: string
  nickname?: string
  gamesToday: number
  lastPlayedAt?: string
  /** Front of the line — the decision the manager is about to make. Gets the accent treatment. */
  next?: boolean
  dragging?: boolean
  removing?: boolean
  /** Rendered inside a QueuePairGroup — omit this row's own border/background/radius; the group supplies them. */
  grouped?: boolean
  /** Full pairs ahead of this one. Omit entirely to hide the estimate line (used for the front pair). */
  gamesAhead?: number
  /** Estimated seconds from now until this pair's match starts. Paired with gamesAhead. */
  etaSec?: number
  /** True for the trailing entry with no confirmed opponent yet — appends "(משוער)". */
  etaApprox?: boolean
  onMenu?: () => void
  handleProps?: HTMLAttributes<HTMLSpanElement>
}

export function QueueRow({
  position,
  teamName,
  nickname,
  gamesToday,
  lastPlayedAt,
  next,
  dragging,
  removing,
  grouped,
  gamesAhead,
  etaSec,
  etaApprox,
  onMenu,
  handleProps,
}: QueueRowProps) {
  const standalone = !grouped || dragging || removing
  return (
    <div
      className={cn(
        'flex min-h-[var(--queuerow-min-height)] items-center gap-3 px-3.5 py-3',
        standalone && 'rounded-xl border border-line bg-surface',
        next && standalone && 'border-accent bg-accent-dim/40',
        next && !standalone && 'bg-accent-dim/20',
        dragging && 'rotate-[0.6deg] scale-[1.02] border-accent shadow-xl shadow-black/70',
        removing && 'border-danger',
      )}
    >
      <span
        className="cursor-grab touch-none text-[19px] tracking-tighter text-muted"
        aria-hidden
        {...handleProps}
      >
        ≡
      </span>
      {next ? (
        <Badge state="live">{t('queue.next')}</Badge>
      ) : (
        <span dir="ltr" className="tabular min-w-4 text-center font-mono text-sm text-muted">{position}</span>
      )}
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[17px] font-semibold">
          {teamName}
          {nickname && <small className="ms-1 font-normal text-muted">({nickname})</small>}
        </span>
        {gamesAhead !== undefined && etaSec !== undefined && (
          <small className="flex items-center gap-1 font-normal text-accent">
            <span>{gamesAhead === 1 ? t('queue.pair.gamesAheadOne') : t('queue.pair.gamesAheadMany', { count: gamesAhead })}</span>
            <span>·</span>
            <span>{t('queue.pair.etaPrefix')}</span>
            <bdi className="tabular font-mono">{Math.round(etaSec / 60)}</bdi>
            <span>{t('queue.pair.etaSuffixMinutes')}</span>
            {etaApprox && <span>{t('queue.pair.etaApprox')}</span>}
          </small>
        )}
        {gamesToday > 0 && (
          <small className="font-normal text-muted">
            <span>{t('captain.todayShort', { count: gamesToday })}</span>
            {lastPlayedAt && (
              <>
                {' · '}
                <bdi className="tabular font-mono">{lastPlayedAt}</bdi>
              </>
            )}
          </small>
        )}
      </div>
      {removing ? (
        <span className="text-[13px] font-bold text-danger">{t('queue.remove')}</span>
      ) : (
        <button
          type="button"
          onClick={onMenu}
          aria-label={teamName}
          className="-me-2.5 flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center text-[19px] text-muted"
        >
          ⋯
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueueRow.test.tsx`
Expected: PASS (all previous tests plus the 6 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueRow.tsx apps/web/src/components/QueueRow.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): show games-ahead + eta on QueueRow"
```

---

### Task 4: Wire `QueueList` to render pair groups

**Files:**
- Modify: `apps/web/src/components/QueueList.tsx`
- Modify: `apps/web/src/components/QueueList.test.tsx`

**Interfaces:**
- Consumes: `buildPairGroups` from `@/lib/queue-pairing` (Task 1), `QueuePairGroup`/`QueuePairGroupVariant` from `@/components/QueuePairGroup` (Task 2), `grouped`/`gamesAhead`/`etaSec`/`etaApprox` props on `QueueRow` (Task 3).
- Produces: `QueueListProps` gains required `matchDurationSec: number` and `baseSec: number`. Task 5's `MainScreen` passes both.

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `apps/web/src/components/QueueList.test.tsx` with:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { QueueEntryView } from 'shared'
import { QueueList } from './QueueList'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function entry(
  id: string,
  name: string,
  position: number,
  stats: Pick<QueueEntryView['team'], 'gamesToday' | 'lastPlayedAt'> = { gamesToday: 0, lastPlayedAt: null },
): QueueEntryView {
  return { id, position, team: { id: `${id}-cap`, name, nickname: null, ...stats } }
}

function renderQueueList(queue: QueueEntryView[], opts: { matchDurationSec?: number; baseSec?: number } = {}) {
  const actions: SessionActions = {
    addToLine: vi.fn(),
    searchTeams: vi.fn().mockResolvedValue([]),
    reorderLine: vi.fn().mockResolvedValue(undefined),
    moveTop: vi.fn(),
    moveBottom: vi.fn(),
    removeFromLine: vi.fn(),
    startMatch: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    finish: vi.fn(),
    extend: vi.fn(),
    replay: vi.fn(),
    undo: vi.fn(),
    openSession: vi.fn(),
    closeSession: vi.fn(),
    updateDuration: vi.fn(),
    updateTeam: vi.fn(),
  }
  render(
    <SessionActionsContext.Provider value={actions}>
      <QueueList queue={queue} matchDurationSec={opts.matchDurationSec ?? 480} baseSec={opts.baseSec ?? 0} />
    </SessionActionsContext.Provider>,
  )
  return { actions }
}

describe('QueueList', () => {
  it('renders every line entry as a single-team row, front two marked next', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3)]
    renderQueueList(queue)
    expect(screen.getAllByText('הבא')).toHaveLength(2) // both halves of the imminent match are marked next
    expect(screen.getByText('3')).toBeDefined() // third row shows its position, not "הבא"
  })

  it('keeps the selected teen\'s last-played time visible after they enter the queue', () => {
    const queue = [entry('e1', 'טורי', 1, { gamesToday: 1, lastPlayedAt: '2026-07-12T06:16:00.000Z' })]

    renderQueueList(queue)

    expect(screen.getByText('· 1 היום')).toBeDefined()
    expect(screen.getByText('09:16')).toBeDefined()
  })

  it('opens QueueActionsSheet for the row whose ⋯ was tapped', () => {
    const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2)]
    renderQueueList(queue)
    const menuButtons = screen.getAllByRole('button')
    fireEvent.click(menuButtons[1]!) // second row's ⋯
    expect(screen.getByRole('heading', { name: 'ב' })).toBeDefined() // sheet title uses the picked entry's team name
  })

  describe('predicted pairing', () => {
    it('shows a games-ahead/eta line for every pair after the front two', () => {
      const queue = [entry('e1', 'טל', 1), entry('e2', 'נדב', 2), entry('e3', 'רון', 3), entry('e4', 'חלח', 4)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getAllByText('משחק אחד לפניך')).toHaveLength(2)
      expect(screen.getAllByText('9')).toHaveLength(2)
    })

    it('marks a trailing odd entry as waiting for a pair with an approximate eta', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 0 })
      expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
      expect(screen.getByText('(משוער)')).toBeDefined()
    })

    it('folds the live match remaining time into every eta via baseSec', () => {
      const queue = [entry('e1', 'א', 1), entry('e2', 'ב', 2), entry('e3', 'ג', 3), entry('e4', 'ד', 4)]
      renderQueueList(queue, { matchDurationSec: 480, baseSec: 200 })
      // (200 + 480 + 60) / 60 = 12.33 -> rounds to 12; both rows of pairIndex 1 (e3, e4) render it
      expect(screen.getAllByText('12')).toHaveLength(2)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: FAIL — TS error, `matchDurationSec`/`baseSec` are not valid props on `QueueList` yet.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/web/src/components/QueueList.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QueueEntryView } from 'shared'
import { QueuePairGroup, type QueuePairGroupVariant } from '@/components/QueuePairGroup'
import { QueueRow } from '@/components/QueueRow'
import { QueueActionsSheet } from '@/components/QueueActionsSheet'
import { t } from '@/i18n'
import { buildPairGroups } from '@/lib/queue-pairing'
import { formatTimeOfDay } from '@/lib/time'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the line — touch-first drag-to-reorder (dnd-kit,
 * handle-only listeners so the page still scrolls). Consecutive entries are
 * grouped into predicted pairs (QueuePairGroup) with a games-ahead/eta
 * estimate per row past the front pair (docs/superpowers/specs/2026-07-13-
 * queue-pairing-and-eta-design.md). ⋯ opens QueueActionsSheet. Reorder is
 * optimistic: applied to local order immediately, reverted if
 * SessionActions rejects it (client-prd §5, US-030).
 */
export interface QueueListProps {
  queue: QueueEntryView[]
  matchDurationSec: number
  baseSec: number
  onError?: (message: string) => void
}

export function QueueList({ queue, matchDurationSec, baseSec, onError }: QueueListProps) {
  const actions = useSessionActions()
  const [orderIds, setOrderIds] = useState<string[]>(() => queue.map((e) => e.id))
  const [menuEntryId, setMenuEntryId] = useState<string | null>(null)

  useEffect(() => {
    setOrderIds(queue.map((e) => e.id))
  }, [queue])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = orderIds.indexOf(String(active.id))
    const newIndex = orderIds.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const previous = orderIds
    const next = arrayMove(orderIds, oldIndex, newIndex)
    setOrderIds(next)
    actions.reorderLine(next).catch(() => {
      setOrderIds(previous)
      onError?.(t('queue.actions.error'))
    })
  }

  const byId = new Map(queue.map((e) => [e.id, e]))
  const orderedEntries = orderIds.map((id) => byId.get(id)).filter((e): e is QueueEntryView => e !== undefined)
  const menuEntry = menuEntryId ? (byId.get(menuEntryId) ?? null) : null
  const pairGroups = buildPairGroups(
    orderedEntries.map((e) => e.id),
    baseSec,
    matchDurationSec,
  )

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-4">
            {pairGroups.map((group) => {
              const isNext = group.pairIndex === 0 && group.hasPartner
              const variant: QueuePairGroupVariant = isNext ? 'next' : group.hasPartner ? 'default' : 'solo'
              const label = isNext
                ? t('queue.pair.next', { index: group.pairIndex + 1 })
                : group.hasPartner
                  ? t('queue.pair.label', { index: group.pairIndex + 1 })
                  : t('queue.pair.waiting')
              return (
                <QueuePairGroup key={group.pairIndex} label={label} variant={variant}>
                  {group.entryIds.map((id, iInGroup) => {
                    const entry = byId.get(id)
                    if (!entry) return null
                    return (
                      <SortableQueueRow
                        key={entry.id}
                        entry={entry}
                        index={group.pairIndex * 2 + iInGroup}
                        isNext={isNext}
                        grouped
                        {...(!isNext ? { gamesAhead: group.gamesAhead, etaSec: group.etaSec } : {})}
                        {...(!group.hasPartner ? { etaApprox: true } : {})}
                        onMenu={() => setMenuEntryId(entry.id)}
                      />
                    )
                  })}
                </QueuePairGroup>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
      {menuEntry && <QueueActionsSheet open onClose={() => setMenuEntryId(null)} entry={menuEntry} {...(onError ? { onError } : {})} />}
    </>
  )
}

function SortableQueueRow({
  entry,
  index,
  isNext,
  grouped,
  gamesAhead,
  etaSec,
  etaApprox,
  onMenu,
}: {
  entry: QueueEntryView
  index: number
  isNext: boolean
  grouped?: boolean
  gamesAhead?: number
  etaSec?: number
  etaApprox?: boolean
  onMenu: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div ref={setNodeRef} style={style}>
      <QueueRow
        position={index + 1}
        teamName={entry.team.name}
        {...(entry.team.nickname ? { nickname: entry.team.nickname } : {})}
        gamesToday={entry.team.gamesToday}
        {...(entry.team.lastPlayedAt ? { lastPlayedAt: formatTimeOfDay(entry.team.lastPlayedAt) } : {})}
        next={isNext}
        dragging={isDragging}
        {...(grouped ? { grouped } : {})}
        {...(gamesAhead !== undefined ? { gamesAhead } : {})}
        {...(etaSec !== undefined ? { etaSec } : {})}
        {...(etaApprox ? { etaApprox } : {})}
        onMenu={onMenu}
        handleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
```

Note: the pair-to-pair gap uses `gap-4` (16px, the design system's 4px spacing unit × 4) rather than the 18px used in the throwaway mockup artifact, to stay on-token.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/components/QueueList.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/QueueList.tsx apps/web/src/components/QueueList.test.tsx
git commit -m "feat(web): render the queue as predicted pair groups"
```

---

### Task 5: Wire `MainScreen` to supply `matchDurationSec` / `baseSec`

**Files:**
- Modify: `apps/web/src/screens/MainScreen.tsx`
- Modify: `apps/web/src/screens/MainScreen.test.tsx`

**Interfaces:**
- Consumes: `computeBaseSec` from `@/lib/queue-pairing` (Task 1); `QueueListProps.matchDurationSec` / `.baseSec` (Task 4).
- Produces: nothing new for later tasks — this is the final integration point.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/screens/MainScreen.test.tsx`, inside the `describe('MainScreen — active session, field free', ...)` block, after the existing `'shows the front-two-of-the-line start prompt...'` test:

```tsx
  it('shows a games-ahead/eta estimate for queue entries past the front two', () => {
    const snapshot = activeSnapshot({
      queue: [
        { id: 'e1', position: 1, team: team('ca', 'א') },
        { id: 'e2', position: 2, team: team('cb', 'ב') },
        { id: 'e3', position: 3, team: team('cc', 'ג') },
        { id: 'e4', position: 4, team: team('cd', 'ד') },
      ],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getAllByText('משחק אחד לפניך')).toHaveLength(2)
  })
```

Add to the `describe('MainScreen — active session, field live', ...)` block, after the existing `'shows the live FieldCard...'` test:

```tsx
  it('marks a trailing odd queue entry as waiting for a pair while a match is live', () => {
    const snapshot = activeSnapshot({
      fields: [
        {
          id: 'f1',
          name: 'מגרש ראשי',
          position: 0,
          liveMatch: {
            id: 'm1',
            captainA: team('ca', 'א'),
            captainB: team('cb', 'ב'),
            status: 'live',
            plannedDurationSec: 360,
            startedAt: new Date().toISOString(),
            pausedAt: null,
            accumulatedPauseSec: 0,
            endsAt: new Date(Date.now() + 360_000).toISOString(),
          },
        },
      ],
      queue: [
        { id: 'e1', position: 1, team: team('cc', 'ג') },
        { id: 'e2', position: 2, team: team('cd', 'ד') },
        { id: 'e3', position: 3, team: team('ce', 'ה') },
      ],
    })
    renderMain({ snapshot, connection: 'online', offsetMs: 0 }, 'staff')
    expect(screen.getByText('ממתין/ה לזוג')).toBeDefined()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter web vitest run src/screens/MainScreen.test.tsx`
Expected: FAIL — TS error, `QueueList` requires `matchDurationSec`/`baseSec` which `MainScreen` doesn't yet pass.

- [ ] **Step 3: Write minimal implementation**

In `apps/web/src/screens/MainScreen.tsx`, add the import (alongside the existing `@/lib/time` import):

```tsx
import { computeBaseSec } from '@/lib/queue-pairing'
```

Right after the existing `const secondsLeft = useCountdown({ ...countdownInput, offsetMs })` line, add:

```tsx
  const baseSec = computeBaseSec(isRunning, secondsLeft)
```

Change the `QueueList` call site from:

```tsx
          {snapshot.queue.length === 0 ? <EmptyState title={t('empty.queue')} /> : <QueueList queue={snapshot.queue} onError={setError} />}
```

to:

```tsx
          {snapshot.queue.length === 0 ? (
            <EmptyState title={t('empty.queue')} />
          ) : (
            <QueueList queue={snapshot.queue} matchDurationSec={snapshot.session.matchDurationSec} baseSec={baseSec} onError={setError} />
          )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter web vitest run src/screens/MainScreen.test.tsx`
Expected: PASS (all previous tests plus the 2 new ones).

- [ ] **Step 5: Full verification and commit**

Run the whole repo's checks before committing:

```bash
pnpm typecheck
pnpm test
```

Expected: both succeed with no errors (typecheck across all packages; full vitest run across `shared`/`web`/`api`).

```bash
git add apps/web/src/screens/MainScreen.tsx apps/web/src/screens/MainScreen.test.tsx
git commit -m "feat(web): wire queue pair eta into MainScreen"
```

---

## Self-Review

**Spec coverage:** pairing-as-shape (Task 2/4), eta formula incl. live-match baseSec (Task 1/5), games-ahead count (Task 1/3), row subtext stacking above last-played (Task 3), odd-leftover "waiting" solo variant (Task 1/2/4), on-token spacing note (Task 4) — every section of `docs/superpowers/specs/2026-07-13-queue-pairing-and-eta-design.md` has a task. The "known limitation" (future pairs use session default duration, not per-match actuals) is inherent to the formula in Task 1 and needs no separate task.

**Placeholder scan:** none — every step has complete, runnable code.

**Type consistency:** `PairGroup` fields (`pairIndex`, `entryIds`, `gamesAhead`, `etaSec`, `hasPartner`) are used with identical names in Tasks 1, 4, and the design spec. `QueueRowProps`' new fields (`grouped`, `gamesAhead`, `etaSec`, `etaApprox`) match between Task 3's definition and Task 4's `SortableQueueRow` usage. `QueueListProps.matchDurationSec`/`.baseSec` match between Task 4's definition and Task 5's call site.
