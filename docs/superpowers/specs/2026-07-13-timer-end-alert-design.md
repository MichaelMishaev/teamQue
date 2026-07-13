# Timer End Alert (00:00 "noise") — Design

**Date:** 2026-07-13
**Status:** Approved

## Problem

When a live match timer reaches 00:00 the field card goes red-with-opacity
(`finishing` state) but is otherwise silent and static. Staff running a live
queue in a busy youth-center may not be watching the screen and miss that a
match is over. Add an audible + visual cue at the 00:00 crossing.

## Constraints

- Timers are **computed, never ticked** (technical-prd §4). `secondsLeft` is
  re-derived every second in `MainScreen` from the server-owned `endsAt`; the
  crossing to zero is not an event anywhere today.
- `FieldCard` is **presentational** — server snapshot is the only state source.
  Side effects (sound) must not live inside it.
- No hardcoded strings; `motion-safe` for animation (respect reduced-motion);
  no `console.log`.

## Approach

### 1. `useMatchEndAlert` hook (new) — the trigger

Watches `{ matchId, status, secondsLeft }` and fires **once** when a match
crosses from `secondsLeft > 0` to `secondsLeft <= 0` while `status === 'live'`.

- Tracks previous `secondsLeft` in a ref, keyed by `matchId`.
- Fires only on the `prev > 0 && current <= 0` edge — so it never double-fires
  while sitting at 0, never fires when the screen loads with a match already at
  00:00 (prev seeded to current), and never fires while `paused`.
- Resets when `matchId` changes (new match) or becomes `null`.
- On the crossing: calls the injected beep function and sets an `alerting`
  flag `true` for ~1.5s (then back to `false`). Returns `alerting`.
- The beep function is injected (default `playEndBeep`) so the hook is unit
  testable without audio.

### 2. `lib/beep.ts` (new) — the sound

`playEndBeep()` lazily creates one shared `AudioContext` and synthesizes a
short **two-tone buzzer** (~two 0.15s square-wave blips). No bundled asset,
works offline. Calls `resume()` on the context (reliable: a live match always
follows the staff "Start" tap, which unlocks audio). No-ops when
`AudioContext` is unavailable (jsdom / SSR).

**Known limitation:** a second device watching a match it did not start may
stay silent until its first user interaction (browser autoplay policy).
Acceptable for MVP.

### 3. Visual flash — `FieldCard` `alerting` prop + CSS keyframe

`FieldCard` gains an optional `alerting?: boolean` prop. When true it plays a
new `motion-safe` `end-flash` keyframe (defined in `index.css`) — the red
`danger` surface pulses ~3 times over ~1.5s, then settles into the existing
static `finishing` look. `MainScreen` passes the hook's `alerting` flag down.

## Files

- `apps/web/src/hooks/useMatchEndAlert.ts` (new) + `.test.ts` — TDD the
  crossing logic (mount-at-zero, paused, refire, matchId change).
- `apps/web/src/lib/beep.ts` (new) — thin, guarded.
- `apps/web/src/screens/MainScreen.tsx` — call hook, pass `alerting` to card.
- `apps/web/src/components/FieldCard.tsx` — `alerting` prop + animation class.
- `apps/web/src/index.css` — `end-flash` keyframe.

No new i18n keys.

## Success criteria

- Live match crossing to 00:00 → beep plays once + card flashes ~3× then rests.
- No sound/flash when: paused, already at 00:00 on load, or same match already
  alerted once.
- `useMatchEndAlert` unit tests cover every guard rail. `pnpm typecheck` +
  `pnpm --filter web test` green.
