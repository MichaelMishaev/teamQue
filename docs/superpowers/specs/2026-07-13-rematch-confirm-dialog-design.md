# Rematch Confirmation Dialog — Design

## Problem

The "משחק חוזר" (rematch) button on the History screen (`apps/web/src/screens/HistoryScreen.tsx`, `HistoryRow`) currently calls `actions.replay(match.id)` immediately on click, with no confirmation step. This creates two new `queue_entries` rows (one per captain from the finished match) appended to the bottom of the line via `POST /matches/:id/replay`.

The app's documented policy (`design.md`) is "no blocking popups in live flows," with undo-toast as the standard pattern for reversible queue actions. The user has explicitly requested an exception for this specific action: a blocking confirm dialog that the user must accept before the rematch entry is created.

## Scope

- Only the rematch button on `HistoryScreen` / `HistoryRow` is affected. This is the only place `actions.replay` is currently invoked in the app.
- No changes to the API (`apps/api/src/matches/matches.service.ts` `replay()`), to the realtime broadcast flow, or to any other queue action (remove, etc. keep their existing undo-toast pattern).

## Design

### Component

A new `RematchConfirmDialog` component built on the existing `Dialog` primitive (`apps/web/src/components/ui/dialog.tsx`). `HistoryRow`'s rematch button no longer calls `actions.replay` directly — it opens `RematchConfirmDialog` instead. The dialog itself calls `actions.replay(match.id)` only when the user taps confirm.

- Title: `"ליצור משחק חוזר?"` (Create a rematch?)
- Body: the two captain names from the finished match (e.g. `"נועם נגד איתי"`), reusing the existing captain-name formatting already used on the history row.
- Footer: two buttons —
  - `"ביטול"` (Cancel) — closes the dialog, no side effect.
  - `"אישור"` (Confirm) — triggers the API call.
- New i18n keys (no existing generic cancel/confirm strings exist in `he.json` to reuse):
  - `history.replayConfirm.title`
  - `history.replayConfirm.confirm`
  - `history.replayConfirm.cancel`

### Behavior / data flow

- Confirm button shows a disabled/loading state while `POST /matches/:id/replay` is in flight.
- On success: dialog closes; the session snapshot updates via the normal `SessionEventsService.broadcast` → Socket.IO flow already in place. No new client-side state reconciliation needed.
- On failure: dialog stays open, shows an inline error message (per the "inline errors, not popups" rule), Confirm re-enabled to retry, Cancel still closes.
- Escape, overlay click, and Cancel are all equivalent — dialog closes, no rematch is created.

### Testing (TDD — failing tests first)

Unit tests for `RematchConfirmDialog` (Testing Library / jsdom):
1. Opens on rematch button click.
2. Does NOT call `actions.replay` until Confirm is tapped.
3. Calls `actions.replay` exactly once when Confirm is tapped.
4. Shows a loading/disabled state on Confirm while the call is in flight.
5. Shows an inline error and re-enables Confirm when the call rejects.
6. Cancel, Escape, and overlay click all close the dialog without calling `actions.replay`.

Existing `HistoryRow` / `HistoryScreen` tests are updated so that clicking the rematch button asserts the dialog opens, rather than asserting an immediate `replay` call.

## Out of scope

- No changes to any other queue action's confirmation pattern (remove, pause, etc. remain undo-toast only).
- No changes to the `POST /matches/:id/replay` endpoint or its transaction logic.
