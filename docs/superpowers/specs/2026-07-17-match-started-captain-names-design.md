# Match Started Captain Names — Design

## Problem

`docs/superpowers/specs/2026-07-16-activity-queue-captain-names-design.md` enriched
line add/remove/move rows with captain names but explicitly left match lifecycle
rows out of scope. Today `match.started` rows in the Activity feed render as a
bare action label (`יוסי · התחלת משחק`) with no indication of which two captains
kicked off — `matches.service.ts`'s `start()` writes the raw `matches` row
(`captainAId`/`captainBId`, no names) as `afterJson`, and the web adapter never
looks for captain data on `match.start` at all. Demo mode (`mockSession.ts`)
already logs `match.start` with both captain names, so real mode is visibly
behind demo.

## Decision

- Enrich only `match.started`. `match.finished` (manual + auto) stays name-less
  — explicit follow-up, not in this change.
- Do not add field/court name, even though it would be free here (the `field`
  row is already loaded in `start()`). Out of scope for this change.
- Enrich at **write time** (denormalize `captainAName`/`captainBName` into the
  activity's `afterJson`), matching the pattern already established and shipped
  for line events. No schema migration, no read-endpoint join.

## Scope

**In**

- `apps/api/src/matches/matches.service.ts` — `start()`'s `activity.write` call
  for `match.started`.
- `apps/web/src/state/real/readAdapters.ts` — `toActivityEntry`'s handling of
  the `match.start` action.

**Out**

- `match.finished` (manual or auto) — follow-up.
- Field/court name on `match.started` rows.
- Any other match lifecycle action (`match.paused`, `match.resumed`,
  `match.extended`, `match.replayed`).
- Backfilling existing `activity_log` rows.
- Changing `MatchView` / the `/sessions/:id/start` response shape — this only
  changes what's written into `activity_log.after_json`, not the API response.

## Design

### API — write payload

In `MatchesService.start()`, `entryA`/`entryB` (from `listLine()`) carry only
`captainId` — no name. Before the existing `this.activity.write(...)` call,
load both captain names in one query:

```ts
const captainRows = await tx
  .select({ id: captains.id, name: captains.name })
  .from(captains)
  .where(inArray(captains.id, [entryA.captainId, entryB.captainId]))
```

Build the enriched JSON as a **new object**, not a mutation of `matchRow` —
`matchRow` is passed to `buildMatchView(tx, matchRow)` right after the activity
write and must stay the plain DB row:

```ts
afterJson: {
  ...matchRow,
  captainAName: captainRows.find((c) => c.id === matchRow.captainAId)?.name ?? null,
  captainBName: captainRows.find((c) => c.id === matchRow.captainBId)?.name ?? null,
}
```

Names are point-in-time (denormalized at match start), same historical-accuracy
rationale as the line-events spec — a later captain rename doesn't rewrite past
activity rows.

### Web — `toActivityEntry`

`ACTION_MAP['match.started']` already resolves to `'match.start'`. Extend the
extraction step (currently only for line add/remove/move) to also cover
`match.start`: read `captainAName`/`captainBName` off `afterJson`, set
`ActivityEntry.captainA`/`captainB` only when they're non-empty strings. Same
fail-soft rule as the existing extraction — malformed/missing JSON omits the
names and falls back to the bare action label, never throws.

No `ActivityFeed.tsx` or i18n change: `activityMessage()` already renders
`captainA נגד captainB` when both are set, and the `activity.start` key already
exists.

### Demo

No change — `mockSession.ts` already logs `match.start` with both captain
names for both kickoff call sites.

## Testing

`apps/api/src/matches/**` is a listed critical path in this repo's
`CLAUDE.md`: touching it makes the whole change critical, requiring a
reviewer-authored (Codex) frozen failing test first — not a standard
test-after-the-fact. This specific change adds no new mutation and touches no
locking/ordering logic (it's a read-only name lookup inside the existing
kickoff transaction), but the project rule draws no exception for that, so the
implementation plan must route through the critical-path process rather than
skip it.

**API**

- Frozen failing test (Codex-authored per critical-path rule): `start()`'s
  written `match.started` activity `afterJson` includes `captainAName` and
  `captainBName` matching the two kicked-off captains.
- Existing `start()` test coverage (occupied field, busy captain, line-too-short
  errors, `MatchView` shape) must still pass unchanged — this change adds a
  query and a JSON field, nothing else.

**Web**

- `toActivityEntry`: `match.started` with both names present → `captainA` /
  `captainB` set. Missing/malformed `afterJson` → no crash, names omitted,
  base label still renders.
- No new `ActivityFeed` test needed — `activityMessage()`'s captain-pair
  rendering is already covered by the line-events tests.

## Out of scope (explicit)

- `match.finished` captain names (manual + auto) — follow-up.
- Field/court name on `match.started`.
- Any other match lifecycle action.
- Historical backfill.
