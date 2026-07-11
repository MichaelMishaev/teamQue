# Quick re-add: "played today" in QuickAddBar

**Status:** approved (Option A)
**Date:** 2026-07-11

## Problem

The same captains cycle through the line all evening (rounds-based play). Re-adding one today
means typing their name into `QuickAddBar` from scratch every time. Staff need a faster path that
doesn't add a new screen, a modal, or anything that could block or distract from live match
processing.

## Chosen approach: reveal on tap (Option A)

Tapping the (empty) `QuickAddBar` input reveals a **"played today"** list in the same results
panel that currently only appears once you type. Picking a row calls the exact same `addToLine`
path a text search result does today — no new action, no new screen.

Two alternatives were mocked and rejected for now:

- **Always-on chip row** above the bar (1-tap re-add) — fastest, but is a second permanent list
  competing with the line for hero-screen space, conflicting with design.md's "when space competes,
  the line wins."
- **Explicit toggle pill** next to the bar — more discoverable than tap-to-reveal, small permanent
  footprint (~32px). Worth revisiting later if two taps proves too slow in practice; not needed for
  a first version.

Mockups: see the three-option comparison shared during brainstorming (not checked into the repo).

## UX spec

- Trigger: `QuickAddBar` input receives focus (or is tapped) while its value is empty.
- Result panel shows a small uppercase label `t('quickAdd.playedToday')` → "שיחקו היום", followed by
  up to **8** `CaptainSearchResult` rows (existing component, unchanged), most-recently-played first.
- Typing anything switches the panel back to the existing filtered-search behavior, unchanged.
- Clearing back to empty (backspace to nothing) re-reveals the "played today" list rather than an
  empty panel.
- Selecting a row: identical to today's `pick({id})` — calls `addToLine`, resets the bar, haptic
  buzz, closes the panel. Re-added captain joins the **back** of the line (same rule as any add,
  and the same rule `replay()` already uses — no special-casing position).
- No dialog, no confirmation step. Consistent with design.md §4 (no blocking popups in live flows).

## Data & filtering rules

"Played today" candidates are captains where:

1. `gamesToday > 0` (already computed today, per `captainViewSchema`), **and**
2. the captain is **not** currently in the line (`queueEntries`) **and not** the captain of a
   `live`/`paused` match — re-surfacing someone already waiting or on the field is not useful and
   would create a confusing duplicate line entry.

Ordered by `lastPlayedAt` descending, capped at 8. This filtering is specific to this new list —
the existing free-text `searchTeams(q)` behavior is unchanged and stays out of scope (it does not
currently exclude already-queued captains; fixing that, if desired, is a separate decision).

## API / implementation notes (for the follow-up plan)

- `searchTeams('')` currently returns `[]` in both `mockSession.ts` and `realSessionActions.ts` —
  this is the empty-state being replaced for the focus-triggered case.
- Needs a way to fetch "recent, eligible-to-readd" captains distinct from a blank search — either a
  dedicated action (e.g. `recentCaptains()`) or a parameter on the existing endpoint
  (`GET /captains?recent=1`). Exact shape is an implementation decision, not fixed here.
- The exclusion rule (not in line, not live) needs access to current `queueEntries` + `matches`
  state at query time — on the API side this is a straightforward join/filter; the mock needs the
  equivalent.

## Testing (TDD per project rules)

- Unit: the new candidate-list function/query — respects `gamesToday > 0`, excludes in-line and
  on-field captains, orders by `lastPlayedAt` desc, caps at 8.
- Component: `QuickAddBar` — focusing an empty input shows the "played today" panel; typing
  replaces it with search results; picking a row calls `addToLine` and resets, same as today's
  covered behavior.
- No new i18n keys are hardcoded — `quickAdd.playedToday` added to `he.json` before use (empty key
  is a compile error per project rules).

## Out of scope

- The always-on chip row and toggle-pill variants (may revisit later).
- Changing plain-text search to exclude already-queued captains.
- Any change to `replay()` / History screen — that flow re-queues both captains of a finished match
  and is unaffected by this.
