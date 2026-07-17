# Courts landing page at `/`

**Date:** 2026-07-17
**Status:** Approved, pending implementation plan

## Problem

Navigating to `/` never renders a page. `HomeScreen` is a redirect bouncer: it
resolves the default court and immediately calls `navigateToField(slug)`, so the
browser lands on `/f/<slug>` and the user never sees a choice.
(`apps/web/src/screens/HomeScreen.tsx:17-46`)

Staff cannot see which courts exist, and cannot create one. The only way a court
gets created today is the implicit default-ensure inside that redirect.

## Goal

`/` renders a list of active courts with a create action. `כיכר העצמאות, מגרש 1`
is guaranteed present as the default. Tapping a court opens its queue.

## Scope

Web only. **No API, contract, schema, or migration changes.** The endpoints and
types this needs already exist and are already called by `HomeScreen`.

## Decisions

Four product decisions were made during brainstorming and are settled:

1. **`/` always shows the court list.** It does not auto-open the default.
   This knowingly adds one tap before the queue on every open, in tension with
   the "queue is the hero surface" rule in `CLAUDE.md`. Accepted deliberately;
   worth revisiting after real shift use.
2. **The default court is a guarantee, not a seed.** If no *active* court named
   `כיכר העצמאות, מגרש 1` exists, `/` re-creates it before rendering — including
   after someone closes it. Closing the default is therefore not durable.
3. **Create takes a name only.** `matchDurationSec` stays hardcoded at `360`,
   adjustable afterwards in that court's Settings tab.
4. **Create navigates straight into the new court**, not back to the list.

## Data model context

A "court" is **not** a `centers` row. `fields.centerId` (`apps/api/src/db/schema.ts:99`)
is a bare uuid with no FK — `centers` is a vestige of the pre-pivot multi-tenant
model. A public court is:

- one `sessions` row (owns the `slug`, the share-URL code), plus
- one child `fields` row at `position: 0`.

`POST /fields` creates both and returns `{ slug, snapshot }`.

## Flow

```
/  → HomeScreen
     1. GET /fields                          → FieldListItem[]
     2. no active "כיכר העצמאות, מגרש 1"?    → POST /fields {name, matchDurationSec: 360}
     3. render list, default pinned first
     4. tap row        → navigateToField(slug)     → /f/<slug>
     5. + צור מגרש חדש → sheet → POST /fields → navigateToField(newSlug)
```

## Endpoints used (both already exist)

| Endpoint | Returns | Notes |
|---|---|---|
| `GET /fields` | `FieldListItem[]` | active sessions, `fields.position = 0`, scoped to `req.centerId`, ordered `createdAt DESC` (`fields.service.ts:77-98`) |
| `POST /fields` | `{ slug, snapshot }` | throttled **5/hour/IP** (`fields.controller.ts:23-24`) |

`FieldListItem` (`packages/shared/src/reads.ts:54-61`) is
`{ slug, name, createdAt, queueLength, hasLiveMatch }` — exactly the list row
shape needed. No contract change.

`createFieldSchema` (`packages/shared/src/requests.ts:73-77`) is
`{ name: string (1..40), matchDurationSec: int (60..3600) }`.

## Ordering

`GET /fields` returns `createdAt DESC`. The default court is the **oldest**, so
it sorts to the *bottom* once any other court exists — inverting intent.

**Fix: client-side pin.** Default first, remaining courts by recency. The API
ordering contract is untouched for other callers.

## Components

All in `apps/web/src`:

### `screens/HomeScreen.tsx` — rewritten

Owns fetch, ensure-default, pin-sort, create flow. Renders the list instead of
redirecting. The module-level `openDefaultPromise` guard (`:15`) stays — it
exists to survive StrictMode double-mount and still guards the `POST`; it just
no longer guards a redirect.

### `components/CourtRow.tsx` — new, presentational

Props: a `FieldListItem` + `onOpen`. Name as title; `queueLength` and
`hasLiveMatch` as subtitle (e.g. `3 בתור · משחק חי`) — both free from the
existing contract.

Not to be confused with `components/FieldCard.tsx`, which renders a live match
*inside* a session.

### `components/CreateCourtSheet.tsx` — new

One text input, `maxLength={40}` mirroring the contract cap. 60px primary
action. Bottom sheet, not a separate page.

## Design references (Mobbin)

The governing lesson across all three: **creating is deliberately the smaller
affordance** — the existing courts dominate the screen.

- [Google Home — "Where is this device?"](https://mobbin.com/screens/7d9e9b69-7135-4ac8-8e0b-d6e97cc908c0)
  — closest match. Marked default under a list header, "Create new" as a quiet
  section below.
- [Snoonu — location sheet](https://mobbin.com/screens/dece0e6d-03b4-43d3-a93d-ea0d9088285d)
  — "+ Add new address" as a low-weight inline row, never a competing button.
- [Jobber — Create New Lead Source](https://mobbin.com/screens/7f8900ad-414d-4bea-8844-5d7dd3a697dd)
  — creation is a bottom sheet with a single name field. A court is essentially
  a name.

Applied: courts as `bg-surface` cards; create as a 44px row *below* the list;
primary action 60px; logical properties only (`ms-*/me-*`) per RTL rules.

**The default row carries no checkmark or badge** — it is distinguished only by
its pinned position. Google Home's checkmark denotes *current selection*, but
nothing is selected here; the user is navigating, not choosing state. A
checkmark would be a false affordance.

## Error handling

`POST /fields` becomes **user-reachable for the first time** — today no user can
trigger it directly, so its failure modes are currently untested in practice.

| Case | Behavior |
|---|---|
| `POST /fields` → 429 (throttle) | Inline error in the sheet. No popup (live-flow rule). Sheet stays open, typed text preserved. |
| Ensure-default `POST` fails | **Degrade, not die.** Render the courts that *were* returned, plus an inline notice. A failed guarantee must not cost the user the courts that exist. |
| `GET /fields` fails | Existing error state, unchanged. |

## Known sharp edge — not fixed here

`HomeScreen.tsx:23` identifies the default by **name equality**
(`list.find(f => f.name === defaultName)`). With decision 2 (always re-create),
this is now load-bearing.

Consequence: a user who creates a court and names it `כיכר העצמאות, מגרש 1` will
have their court silently adopted as the default forever.

Deliberately out of scope — a real fix needs a durable marker (an `isDefault`
column or a reserved slug), which is API + migration work beyond this request.
Recorded so the next person doesn't rediscover it in production.

Related: three hardcoded default field names coexist in the repo —
`he.json:132` (`כיכר העצמאות, מגרש 1`), `sessions.service.ts:18`
(`מגרש ראשי`), and `mockSession.ts:30` (`מגרש ראשי`). Not consolidated here.

## i18n

Zero hardcoded strings. `home.create.nameDefault` (`he.json:132`) already
exists and stays the single source of the default name. New keys needed for:
list title, create row label, sheet title, name input label, save action, empty
state, throttle error, ensure-default warning, queue count, live badge.

## Testing

Behavior tests only, no markup snapshots. `HomeScreen.test.tsx` already exists.

- renders courts returned by `GET /fields`
- creates the default when absent
- does **not** create when the default is already present
- pins the default first when a newer court exists
- tapping a row navigates to `/f/<slug>`
- create → `POST /fields` → navigates to the **new** slug
- 429 on create → inline error, sheet stays open
- ensure-default failure → list still renders, with notice

## Out of scope

- Renaming or closing courts from `/` (closing already exists in Settings)
- Center name plumbing — `SessionSnapshot` carries no center info at all
  (`packages/shared/src/snapshot.ts:10-25`); not needed, since the court name
  already contains the venue
- The name-as-key fix (above)
- Demo mode (`VITE_DEMO=1`) bypasses `parseRoute`/`HomeScreen` entirely
  (`main.tsx:22,26`), so this path never runs there
