# Rematch Confirmation Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require an explicit user confirmation (visual dialog, Confirm/Cancel) before a "משחק חוזר" (rematch) creates two new queue entries — today it fires `POST /matches/:id/replay` immediately on click.

**Architecture:** A new `RematchConfirmDialog` component wraps the existing `Dialog` primitive (`apps/web/src/components/ui/dialog.tsx`). `HistoryRow` (in `apps/web/src/screens/HistoryScreen.tsx`) stops calling `actions.replay` directly on button click — it opens the dialog instead, and the dialog itself calls `actions.replay(matchId)` only when the user taps its own "אישור" (Confirm) button.

**Tech Stack:** React 19, TypeScript strict, Vitest + Testing Library (jsdom), existing `Dialog`/`Button` UI primitives, flat-key `he.json` i18n via `t()`.

## Global Constraints

- TDD: write the failing test first for every behavior; do not write implementation before its test exists and fails for the expected reason.
- i18n: zero hardcoded user-facing strings — every string goes through `t()` with a new key added to `apps/web/src/i18n/he.json`; a missing key is a compile error (`MessageKey = keyof typeof he`).
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No blocking `window.confirm`/native dialogs — use the existing hand-rolled `Dialog` component only.
- Match existing test conventions exactly: disabled-button assertions cast to `HTMLButtonElement` and read `.disabled` (never `toBeDisabled()` — `@testing-library/jest-dom` is not installed in this repo); rejected async actions use `vi.fn().mockRejectedValue(...)`; async state assertions use `waitFor` from `@testing-library/react`.
- Only touch the rematch flow. No changes to the API, to other queue actions' undo-toast pattern, or to unrelated code/comments in files you edit.

---

### Task 1: `RematchConfirmDialog` component

**Files:**
- Create: `apps/web/src/components/RematchConfirmDialog.tsx`
- Create: `apps/web/src/components/RematchConfirmDialog.test.tsx`
- Modify: `apps/web/src/i18n/he.json` (add 3 keys after the existing `"queue.actions.error"` line)

**Interfaces:**
- Consumes: `Dialog` (`apps/web/src/components/ui/dialog.tsx`) — `{ open: boolean; onClose: () => void; title?: string; children: ReactNode }`. `Button` (`apps/web/src/components/ui/button.tsx`) — `{ variant?: 'primary'|'secondary'|'danger'|'ghost'; size?: 'default'|'big'; disabled?: boolean; onClick?: () => void; className?: string }`. `useSessionActions()` (`apps/web/src/state/SessionActions.ts`) → `SessionActions.replay(matchId: string): Promise<void>`. `t(key: MessageKey, params?: Record<string, string|number>): string` (`apps/web/src/i18n`). Existing key `t('match.vs')` (`"נגד"`) and `t('queue.actions.error')` (`"הפעולה נכשלה — נסו שוב"`).
- Produces: `RematchConfirmDialog({ open, onClose, matchId, captainAName, captainBName }: RematchConfirmDialogProps): JSX.Element`, exported from `apps/web/src/components/RematchConfirmDialog.tsx`. Task 2 imports this component and these exact prop names.

- [ ] **Step 1: Write the failing test file**

```tsx
// apps/web/src/components/RematchConfirmDialog.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RematchConfirmDialog } from './RematchConfirmDialog'
import { SessionActionsContext, type SessionActions } from '@/state/SessionActions'

function actionsStub(overrides: Partial<SessionActions> = {}): SessionActions {
  return {
    addToLine: vi.fn(),
    searchTeams: vi.fn(),
    reorderLine: vi.fn(),
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
    ...overrides,
  }
}

function renderDialog(open: boolean, actionsOverrides: Partial<SessionActions> = {}) {
  const actions = actionsStub(actionsOverrides)
  const onClose = vi.fn()
  render(
    <SessionActionsContext.Provider value={actions}>
      <RematchConfirmDialog open={open} onClose={onClose} matchId="m1" captainAName="יוסי" captainBName="רון" />
    </SessionActionsContext.Provider>,
  )
  return { actions, onClose }
}

describe('RematchConfirmDialog', () => {
  it('renders nothing when closed', () => {
    renderDialog(false)
    expect(screen.queryByText('ליצור משחק חוזר?')).toBeNull()
  })

  it('shows the title and both captain names when open', () => {
    renderDialog(true)
    expect(screen.getByText('ליצור משחק חוזר?')).toBeDefined()
    expect(screen.getByText(/יוסי/)).toBeDefined()
    expect(screen.getByText(/רון/)).toBeDefined()
  })

  it('does not call replay until confirm is tapped', () => {
    const { actions } = renderDialog(true)
    expect(actions.replay).not.toHaveBeenCalled()
  })

  it('calls replay exactly once with the match id when confirm is tapped', () => {
    const { actions } = renderDialog(true)
    fireEvent.click(screen.getByText('אישור'))
    expect(actions.replay).toHaveBeenCalledTimes(1)
    expect(actions.replay).toHaveBeenCalledWith('m1')
  })

  it('disables confirm while the replay call is in flight, and calls onClose on success', async () => {
    let resolveReplay: () => void = () => {}
    const replay = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReplay = resolve
        }),
    )
    const { onClose } = renderDialog(true, { replay })
    fireEvent.click(screen.getByText('אישור'))
    expect((screen.getByText('אישור') as HTMLButtonElement).disabled).toBe(true)
    resolveReplay()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('shows an inline error and re-enables confirm when replay rejects', async () => {
    const replay = vi.fn().mockRejectedValue(new Error('network error'))
    renderDialog(true, { replay })
    fireEvent.click(screen.getByText('אישור'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined())
    expect((screen.getByText('אישור') as HTMLButtonElement).disabled).toBe(false)
  })

  it('cancel closes the dialog without calling replay', () => {
    const { actions, onClose } = renderDialog(true)
    fireEvent.click(screen.getByText('ביטול'))
    expect(actions.replay).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web vitest run src/components/RematchConfirmDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./RematchConfirmDialog"` (the component file doesn't exist yet).

- [ ] **Step 3: Add the 3 i18n keys**

In `apps/web/src/i18n/he.json`, immediately after the `"queue.actions.error": "הפעולה נכשלה — נסו שוב",` line, add:

```json
  "history.replayConfirm.title": "ליצור משחק חוזר?",
  "history.replayConfirm.confirm": "אישור",
  "history.replayConfirm.cancel": "ביטול",
```

- [ ] **Step 4: Write the component**

```tsx
// apps/web/src/components/RematchConfirmDialog.tsx
import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/i18n'
import { useSessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: the one queue-flow exception to the no-popup
 * policy (design.md §4) — requires explicit confirmation before "משחק חוזר"
 * creates two new queue entries. Opened from HistoryScreen's HistoryRow.
 */
export interface RematchConfirmDialogProps {
  open: boolean
  onClose: () => void
  matchId: string
  captainAName: string
  captainBName: string
}

export function RematchConfirmDialog({ open, onClose, matchId, captainAName, captainBName }: RematchConfirmDialogProps) {
  const actions = useSessionActions()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    setSubmitting(true)
    setError(null)
    try {
      await actions.replay(matchId)
      onClose()
    } catch {
      setError(t('queue.actions.error'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('history.replayConfirm.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px]">
          {captainAName} <span className="text-muted">{t('match.vs')}</span> {captainBName}
        </p>
        {error && (
          <p role="alert" className="text-[13.5px] font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button className="flex-1" onClick={onClose} disabled={submitting}>
            {t('history.replayConfirm.cancel')}
          </Button>
          <Button className="flex-1" variant="primary" onClick={() => void handleConfirm()} disabled={submitting}>
            {t('history.replayConfirm.confirm')}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter web vitest run src/components/RematchConfirmDialog.test.tsx`
Expected: PASS — all 7 tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/RematchConfirmDialog.tsx apps/web/src/components/RematchConfirmDialog.test.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): add rematch confirmation dialog component"
```

---

### Task 2: Wire the dialog into `HistoryRow`

**Files:**
- Modify: `apps/web/src/screens/HistoryScreen.tsx:1-91` (imports + `HistoryRow`)
- Modify: `apps/web/src/screens/HistoryScreen.test.tsx:86-90` (existing replay test)

**Interfaces:**
- Consumes: `RematchConfirmDialog` from Task 1 — `{ open, onClose, matchId, captainAName, captainBName }` exactly as defined above.

- [ ] **Step 1: Update the failing/changed test first**

Replace the existing test at `apps/web/src/screens/HistoryScreen.test.tsx:86-90`:

```tsx
  it('replay calls the replay action with that match id', () => {
    const { actions } = renderHistory([finishedMatch('m1', 'יוסי', 'רון')])
    fireEvent.click(screen.getByText('משחק חוזר'))
    expect(actions.replay).toHaveBeenCalledWith('m1')
  })
```

with:

```tsx
  it('rematch shows a confirmation dialog, and only calls replay after confirming', () => {
    const { actions } = renderHistory([finishedMatch('m1', 'יוסי', 'רון')])
    fireEvent.click(screen.getByText('משחק חוזר'))
    expect(actions.replay).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('אישור'))
    expect(actions.replay).toHaveBeenCalledWith('m1')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web vitest run src/screens/HistoryScreen.test.tsx`
Expected: FAIL — `actions.replay` has not been called after the first click (the dialog doesn't exist in `HistoryRow` yet, so `'אישור'` isn't found and/or `replay` still fires immediately).

- [ ] **Step 3: Update `HistoryRow`**

In `apps/web/src/screens/HistoryScreen.tsx`, remove the now-unused `useSessionActions` import (line 11) and add the `RematchConfirmDialog` import:

```tsx
import { useState } from 'react'
import type { FinishedMatchView } from '@/state/HistoryContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { RematchConfirmDialog } from '@/components/RematchConfirmDialog'
import { SessionSummaryCard } from '@/components/SessionSummaryCard'
import { t } from '@/i18n'
import { cn } from '@/lib/cn'
import { formatClock, formatTimeOfDay } from '@/lib/time'
import { useHistory } from '@/state/HistoryContext'
```

Replace the `HistoryRow` function body (currently lines 52-91) with:

```tsx
function HistoryRow({ match }: { match: FinishedMatchView }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const delta = match.actualDurationSec !== match.plannedDurationSec

  return (
    <div className="flex flex-col gap-1 border-b border-line px-3 py-3 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[15px] font-semibold">
          {match.captainA.name} <span className="text-[13px] font-normal text-muted">{t('match.vs')}</span> {match.captainB.name}
        </span>
        <Badge state={match.endReason === 'auto' ? 'free' : 'live'}>
          {match.endReason === 'auto' ? t('history.autoFinish') : t('history.manualFinish')}
        </Badge>
      </div>
      <Button className="self-start" onClick={() => setConfirmOpen(true)}>
        {t('queue.actions.replay')}
      </Button>
      <RematchConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        matchId={match.id}
        captainAName={match.captainA.name}
        captainBName={match.captainB.name}
      />
      <div className="text-[12.5px] text-muted">
        {match.fieldName} ·{' '}
        <bdi className="tabular" dir="ltr">
          {formatTimeOfDay(match.startedAt)}–{formatTimeOfDay(match.endedAt)}
        </bdi>
      </div>
      <div className="text-[12.5px] text-muted">
        {t('history.planned')} <bdi className="tabular" dir="ltr">{formatClock(match.plannedDurationSec)}</bdi>
        {' · '}
        {t('history.actual')}{' '}
        <bdi className={cn('tabular', delta && 'font-semibold text-warn')} dir="ltr">
          {formatClock(match.actualDurationSec)}
        </bdi>
      </div>
      {(match.startedByName || match.endedByName) && (
        <div className="text-[12.5px] text-muted">
          {match.startedByName && `${t('history.startedBy')} ${match.startedByName}`}
          {match.endedByName && ` · ${t('history.endedBy')} ${match.endedByName}`}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter web vitest run src/screens/HistoryScreen.test.tsx src/components/RematchConfirmDialog.test.tsx`
Expected: PASS — all tests in both files green.

- [ ] **Step 5: Run the full web test suite and typecheck**

Run: `pnpm --filter web vitest run && pnpm --filter web typecheck`
Expected: PASS — no regressions in other files (e.g. no other file imports `useSessionActions` from `HistoryScreen.tsx`, and no leftover unused-import error).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/screens/HistoryScreen.tsx apps/web/src/screens/HistoryScreen.test.tsx
git commit -m "feat(web): require confirmation before creating a rematch"
```

---

## Self-Review Notes

- **Spec coverage:** Dialog content (title, captain names, Cancel/Confirm) → Task 1 Step 4. Loading state → Task 1 test 5. Inline error on failure → Task 1 test 6 + Step 4 `catch` block. Cancel/Escape/overlay-click all no-op → Task 1 test 7 covers Cancel; Escape and overlay click reuse the pre-existing `Dialog`/`useFocusTrap` primitive's `onClose` callback (same code path, not new code introduced by this plan), so a dedicated test for those two would be re-testing an already-relied-upon primitive rather than this plan's code. Wiring into `HistoryRow` without changing the API → Task 2.
- **Placeholder scan:** none — every step has complete, runnable code.
- **Type consistency:** `RematchConfirmDialogProps` (Task 1) — `{ open, onClose, matchId, captainAName, captainBName }` — matches the JSX usage in Task 2 Step 3 exactly.
