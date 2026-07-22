# Queue pairing groups + estimated time until match

**Status:** approved
**Date:** 2026-07-13

## Problem

Staff running a live queue can't tell at a glance which two waiting captains will play each
other, or how long a captain further back in the line has to wait. Today only the front two
entries (`isNext`) are visually distinguished — everyone else is a flat, identically-styled list.

## Chosen approach

Two additions, both **purely derived on the client from the existing `SessionSnapshot`** — no new
API endpoints, no schema changes, no pairs persisted. This preserves the line-manager invariant
that `queue_entries` are never an "A vs B" pairing in the database (`apps/api/src/db/schema.ts`
doc comment on `queueEntries`); pairing here is a *display projection* only, recomputed from
`snapshot.queue` order on every render.

### 1. Pairing groups (visual grouping, not text)

Mockup iterations showed that text alone ("vs Ron") next to identically-styled independent row
boxes does not read as "these two belong together" — confirmed by user feedback on the first
mockup pass. The shape has to carry the meaning:

- `pairIndex = Math.floor(indexInQueue / 2)` (0-based index in `snapshot.queue` array order).
- Every two consecutive entries share **one rounded card** (`pair-group`) containing both rows,
  separated by a 1px hairline divider — not two independent bordered boxes.
- A small in-flow label ("זוג 2") sits **above** the card as normal text, not absolutely
  positioned over the card border — an earlier version overlapped the label on the rounded corner
  and got clipped by the card's rounding. Pattern validated against real products: Opal's "App
  Lists" screen and Revolut Business's "Cards" screen both label a grouped card this way.
- `pairIndex === 0` (the front two, already-next pair): keeps today's accent border + "הבא"
  badges, wrapped in the same pair-group/label structure for consistency ("זוג 1 · הבא").
- **Odd queue length:** the last leftover entry has no partner yet. It renders alone in a
  dashed-border variant of the pair-group (`is-solo`), labeled "ממתין/ה לזוג" (waiting for
  opponent) instead of a pair number.
- No literal opponent-name text ended up in the final design — the merged-card shape communicates
  pairing; per-row subtext is reserved for the time estimate instead (see below).

### 2. Estimated time until match starts

Formula (pure function of snapshot state, recomputed on render — never a ticking `setInterval`,
consistent with `apps/web/src/lib/time.ts`'s "compute from timestamps" pattern):

```
GAP_SEC = 60  // 1 minute between matches, staff-requested buffer

baseSec =
  field free  → 0
  match live  → remainingSeconds(liveMatch) + GAP_SEC   // reuses existing pause-aware helper

etaSec(pairIndex) = baseSec + pairIndex × (session.matchDurationSec + GAP_SEC)
```

- Both captains in a pair share the same `etaSec` and the same `gamesAhead` (= `pairIndex`).
- Displayed as two joined facts on one subtext line: **"N משחקים לפניך · בעוד M דק׳"** (games
  ahead is literally the pair index — showing it doubles as an explanation for where the minutes
  number comes from). Hebrew count agreement: 1 → "משחק אחד לפניך", N>1 → "N משחקים לפניך".
- `pairIndex === 0` rows show no games-ahead/eta text — already communicated by the "הבא" badge.
- The odd leftover entry still gets a computed `etaSec` (its own `pairIndex` counts even without a
  confirmed partner) but the label reads "…(משוער)" (estimated) since kickoff still needs a second
  entry to exist.
- Row 3+ already shows a muted "last played" subtext line (`17:00 · היום 2`, added
  2026-07-13/prior work). Per explicit decision, both lines stay, stacked: the new games-ahead/eta
  line (accent color, more actionable) above the existing last-played line (muted).

## Known limitation

Projected `etaSec` for pairs beyond the live match uses the session's configured
`matchDurationSec`, not a per-match actual — if staff extend the live match, only *its* remaining
time is exact; every pair after it is still an estimate. Worth stating in UI copy only if it comes
up as a support question; not gating this design.

## Components affected (for the follow-up plan)

- New pure helper (exact file TBD in plan — likely `apps/web/src/lib/queue-pairing.ts`): groups
  `snapshot.queue` into pairs and computes `gamesAhead`/`etaSec` per entry, given
  `matchDurationSec` and `baseSec`. Unit-tested per the repo's TDD hard rule: empty queue, odd
  length, field free, live match running, live match paused.
- `apps/web/src/components/QueueList.tsx`: computes `baseSec` from live match state (reusing
  `apps/web/src/lib/time.ts` helpers) and session `matchDurationSec`, then renders grouped
  pair-units instead of a flat row list. **Risk to verify in the plan:** rows are currently
  dnd-kit sortable items (drag handle `≡` per row, per `line.controller.ts` reorder endpoints) —
  the pair-group wrapper changes JSX nesting but must not change the flat `SortableContext` items
  list, or drag-and-drop breaks.
- `apps/web/src/components/QueueRow.tsx`: gains optional `gamesAhead?: number` / `etaSec?: number`
  props rendering the new subtext line, alongside the existing last-played line.
- New presentational wrapper component for the pair-group/label/divider markup (component
  conventions require single-responsibility + JSDoc header + behavior tests for anything shared).
- `apps/web/src/i18n/he.json`: new keys for pair label, waiting-for-pair label, games-ahead
  (singular/plural), and the "in N min" / "in N min (estimated)" strings — zero hardcoded Hebrew
  in JSX per hard rules.

## Edge cases

- Empty queue / queue length ≤ 2 → no pair-groups beyond the existing front pair, nothing new
  renders.
- Odd total count → last entry renders solo/dashed as described above.
- Field free vs. live vs. paused → `baseSec` computed correctly from existing countdown helpers in
  all three states.
- Staff reorders the line (drag-and-drop or move-top/move-bottom) → pairing and estimates
  recompute automatically since they're derived from array order every render; no stale cache risk.
- Session `matchDurationSec` changed mid-session → next render picks up the new value immediately.

## Mockups

Iterated live in an Artifact during brainstorming (not checked into the repo) — three passes:
opponent-name text only (rejected, unclear grouping) → merged pair-card with absolutely-positioned
label (rejected, label got clipped) → merged pair-card with in-flow label above the card + games-
ahead count (approved).
