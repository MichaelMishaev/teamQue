# Activity Queue Captain Names — Design

## Problem

Staff looking for “who was added / removed / moved” open **היסטוריה** (History), which only lists finished matches (US-070 / US-073). Those queue mutations are already written to `activity_log` and shown under **פעילות** (Activity, US-072), but real-mode rows render as action labels only (`שרה · הוספה לתור`) with no captain name.

Demo mode already fills `ActivityEntry.captainA` for add/remove; the live adapter (`toActivityEntry`) drops payload detail. `line.moved` is also collapsed into the same `line.reorder` action as a full-line drag, so top/bottom moves are indistinguishable.

## Decision

- Keep History = finished matches only.
- Enrich **Activity** for add, remove, and single-captain move (top/bottom) with captain names and distinct move copy.
- Full-line `line.reordered` stays a generic “סידור מחדש של התור” row (no name list).
- Enrich at **write time** (denormalize `captainName` into activity JSON). No schema migration; no read-endpoint join.

## Scope

**In**

- API write paths that log `line.added`, `line.removed`, `line.moved` (and replay’s re-queue `line.added` writes).
- Web `ActivityAction` + `toActivityEntry` + i18n + `ActivityFeed` message keys.
- Demo `mockSession` so VITE_DEMO matches production behavior for moves.

**Out**

- Putting queue events into the History tab or merging History + Activity.
- Enriching match lifecycle rows (start/finish with both captains) — follow-up.
- Backfilling existing `activity_log` rows.
- Changing undo semantics or undoable action kinds.
- API response shape changes beyond richer `beforeJson` / `afterJson` content.

## Design

### API — write payloads

| Server action | JSON change |
|---|---|
| `line.added` | `afterJson`: existing entry row fields **plus** `captainName: string`. Same for replay’s per-captain `line.added` writes in `MatchesService.replay`. |
| `line.removed` | `beforeJson`: existing snapshot (`captainId`, positions, `formerPosition`, …) **plus** `captainName`. Undo continues to read only `captainId` + `formerPosition` (`asRemovedEntrySnapshot` ignores extras). |
| `line.moved` | `beforeJson` stays `{ position }` (from). `afterJson` becomes `{ position, captainName, to: 'top' \| 'bottom' }`. The adapter reads name + direction from `afterJson` only. |
| `line.reordered` | Unchanged (`entryIds` only). |

Captain name is taken from the captain row already loaded in the same transaction (add resolves captain; remove/move already have `target.captainId` and can load the name before `activity.write`).

No new columns, endpoints, or migrations.

### Web — action mapping & copy

Extend `ActivityAction` with `line.moveTop` and `line.moveBottom`.

| Server `action` | Web `ActivityAction` | Hebrew base (nominal) | Detail |
|---|---|---|---|
| `line.added` | `line.addToLine` | הוספה לתור | `: {captainA}` when present |
| `line.removed` | `line.remove` | הסרה מהתור | `: {captainA}` when present |
| `line.moved` + `to: 'top'` | `line.moveTop` | העברה לראש התור | `: {captainA}` when present |
| `line.moved` + `to: 'bottom'` | `line.moveBottom` | העברה לסוף התור | `: {captainA}` when present |
| `line.reordered` | `line.reorder` | סידור מחדש של התור | no name |
| `line.moved` missing/invalid `to` | fall back to `line.reorder` | generic reorder | fail soft |

`toActivityEntry`:

1. Map actions as above (stop mapping all `line.moved` → `line.reorder`).
2. Extract `captainName` from `afterJson` for add and move; from `beforeJson` for remove; set `ActivityEntry.captainA` when it is a non-empty string.
3. Never throw on malformed JSON — omit `captainA` and keep the base label (covers pre-enrichment rows).

`ActivityFeed.activityMessage` already appends `: {captainA}` when set; no layout change required beyond new `MESSAGE_KEY` / `he.json` entries:

- `activity.moveTop`
- `activity.moveBottom`

Existing `activity.addToLine` / `activity.remove` / `activity.reorder` keys stay.

### Demo

`mockSession.moveTop` / `moveBottom` log `line.moveTop` / `line.moveBottom` with `captainA` set to the moved captain’s name (instead of generic `line.reorder`). Add/remove already log names.

### Testing (TDD)

**API**

- Unit or focused service tests: written activity for add/remove/move includes `captainName` (and `to` for moves).
- Existing undo `line.removed` coverage still passes with the extra field.

**Web**

- `toActivityEntry`: add/remove → `captainA`; moved top/bottom → correct action + name; reordered → `line.reorder` without name; missing name → no crash.
- `ActivityFeed`: new move keys render; name suffix still applied.
- Demo behavior covered indirectly via existing activity feed tests or mock action assertions if present.

## Out of scope (explicit)

- History tab changes.
- Match start/finish name enrichment in Activity.
- Historical backfill of `captainName`.
- Showing names for full-line drag reorder.
