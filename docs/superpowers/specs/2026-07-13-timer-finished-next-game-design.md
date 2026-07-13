# Timer Finished State + One-Tap Next Game — Design

**Date:** 2026-07-13
**Status:** Approved

## Problem

At 00:00 the field card goes red (`finishing`) but keeps the same live
controls (pause / +1 / finish). Staff can't tell at a glance the match is
*over*, and starting the next game is a two-step dance (finish → then start).
Add a clear "finished" label and a one-tap path to the next game. Must be easy
to use.

## Mobbin references

- Audible "Time's up" — at zero, a focused state: label + primary action +
  secondary "extend". Adapted **inline** (no popup — live-flow hard rule).
- Ladder rest screen — a "Next →" preview so you see what the action produces.
- Runna — one big primary + stacked secondary; single clear primary.
- Duolingo / HQ Trivia — "Time's up!" as a definitive label.

## Constraints

- No blocking popups in live flows — inline card state only.
- `FieldCard` is presentational; server snapshot is the only state source.
- Queue is the hero — keep the card compact.
- No hardcoded strings; RTL logical properties; touch targets ≥44px, primary 60px.

## Trigger

The derived `finishing` state only: a **live** match with `secondsLeft <= 0`
(`timerState()` in `lib/time.ts`). Paused-at-0 stays `paused`. No new flag.

## Card layout in the finishing state

Replaces the live control row:

- **Badge** → `field.state.finishing` value changed from "מסתיים…" to
  **"נגמר הזמן"** (time's up). Pairs with the existing end-flash + beep.
- **Up Next preview** (only when ≥2 teams wait) — `field.nextOnField` +
  `teamA נגד teamB`, reusing the free-card pattern.
- **Primary, full-width, big:**
  - ≥2 teams wait → `action.finishAndStartNext` ("סיים והתחל הבא") →
    `onFinishAndNext`.
  - <2 teams → `action.finish` ("סיים"), full width → `onFinish`.
- **Secondary row:** `action.extendMinute` ("+1 דק׳") always; plus
  `action.finishOnly` ("סיים בלבד") → `onFinish` when the primary is
  finish-and-next.
- **Pause is dropped** in this state (pausing a finished clock is meaningless).

## Behavior

`onFinishAndNext` composes existing actions in `MainScreen`:
`await actions.finish(id)` then `await actions.startMatch()`, with the same
status toast + error handling as today's finish. Not a new transactional
endpoint: if `startMatch` fails (line emptied concurrently), the finish already
committed → the field is simply free, a safe recoverable outcome.

`MainScreen` passes `nextTwo` (queue front-two) to the active card as well as
the free card, and the new `onFinishAndNext` callback.

## Files

- `apps/web/src/components/FieldCard.tsx` (+ `.test.tsx`) — finishing-state
  branch: label, up-next preview, primary variants (finish-and-next vs finish),
  secondary row, dropped pause.
- `apps/web/src/screens/MainScreen.tsx` — compose `handleFinishAndNext`, pass
  `nextTwo` + callback to the active card.
- `apps/web/src/i18n/he.json` — add `action.finishAndStartNext`,
  `action.finishOnly`; change `field.state.finishing`.

## Success criteria

- At 00:00 with ≥2 waiting: badge reads "נגמר הזמן", up-next preview shows,
  primary "סיים והתחל הבא" finishes + starts next in one tap.
- At 00:00 with <2 waiting: primary collapses to "סיים"; no up-next, no
  start-next.
- Live/ending (>0s) still shows pause/extend/finish unchanged.
- FieldCard unit tests cover every finishing-state variant. `pnpm typecheck` +
  `pnpm --filter web test` green.
