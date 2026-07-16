# Open Fields — public, no-login, multi-field pivot (design)

**Date:** 2026-07-16
**Status:** approved in brainstorming (Parts 1–2 explicitly; Part 3 folded in at user's request to proceed to planning)

## 1. What & why

The app pivots from a single-center, staff-PIN-gated queue manager to an **open "go" app**:
anyone can open the site, create a **field** (מגרש), get a shareable short URL, and run a
live football queue on it — no login anywhere. Multiple fields run concurrently, each with
its **own queue**. A public home screen lists all active fields.

This bundles three changes designed together as one product direction:
1. Remove login entirely (visitor identity via device cookie).
2. Multi-field with per-field queues.
3. Shareable short URLs per field + public list.

## 2. Decisions made during brainstorming

| Question | Decision |
| --- | --- |
| Queue model across fields | **Separate queue per field** |
| Who can create a field | **Anyone, any time** — no login |
| Auth scope | **Whole app open**, staff PIN auth bypassed (not deleted) |
| Top-level object | **Field** — sessions disappear from the user's view |
| Field lifecycle | **Auto-expire after 18h of inactivity**; anyone can close manually with confirm |
| Discovery | **Public list of active fields** on the home screen + link-sharing |
| Attribution | **Anonymous device nickname** (prompted on first mutation, or auto-generated) |
| Architecture | **Approach A: field = backend session, 1:1** — reuse the whole per-session engine |

Known accepted risk: public list + open writes means any visitor can act on any field
(end a match, reorder a queue). Mitigation is friction (existing confirms, undo toasts,
attribution by nickname) — not auth. Explicitly accepted by the user.

## 3. Architecture — field = session (1:1)

Each user-facing **field** is backed by one row in the existing `sessions` table plus its
single auto-created child `fields` row (unchanged). Everything that is per-session today —
queue, advisory-lock renumbering, one-live-match enforcement, computed timers, undo,
activity log, snapshot broadcast, socket room — is therefore already per-field. The
`sessions` table gets a doc comment stating it backs the user-facing "field" concept.

### 3.1 Schema changes (one migration)

- `sessions.slug` — `text`, NOT NULL, UNIQUE. URL-safe short code (6 chars, unambiguous
  alphabet, collision-retry on insert). Generated at create.
- `sessions.lastActivityAt` — `timestamptz`, NOT NULL, default now. Touched inside
  `SessionEventsService.broadcast` (amended at planning: broadcast is the single
  post-commit choke point every mutating service already calls, so the heartbeat needs
  zero per-service changes; it is a heartbeat, not an audit record, so post-commit
  timing is fine).
- Display name: **no new column** — the child `fields.name` (already `text NOT NULL`)
  holds the name entered at creation; `sessions.location` stays unused.
- `sessions.created_by` is currently `NOT NULL REFERENCES staff` — relax to nullable and
  add nullable `created_by_visitor_id uuid REFERENCES visitors`; visitor creates populate
  the new column.
- **Drop `one_active_session` partial unique index** — many fields are open concurrently.
- **Visitors are `staff` rows with `role: 'visitor'`** (amended at planning: the earlier
  parallel-`visitors`-table idea would force nullable twin FK columns on matches/activity
  and a new param through ~12 service signatures for the same user-visible result).
  `staffRoleSchema` gains `'visitor'`; the row uses a non-hash `pinHash` sentinel so it
  can never pass PIN login; roster endpoints filter `role <> 'visitor'`. Every existing
  attribution FK, activity write, and history name join works unchanged.
- `queue_entries`, `matches`, `fields`: **no changes at all**.

### 3.2 Identity & guards

- First **mutation** attempt (not page load — spectators are never interrupted) opens a
  bottom-sheet nickname prompt with an auto-generated suggestion ("אורח 42"); `POST
  /visitors` inserts the visitor staff row and sets the existing `qlm_session` httpOnly
  cookie signed with a 365-day TTL and `role: 'visitor'`.
- **No new guard** (amended at planning): `StaffSessionGuard` already verifies that
  cookie shape unchanged and — since auth was opened in a prior change — already falls
  back to the seeded manager for cookieless requests. The nickname sheet is enforced
  client-side before the first mutation; the server keeps the fallback (no hard 401),
  which also keeps the entire existing integration suite valid. `RolesGuard` decorators
  come OFF the session open/update/close routes (the whole app is open).
- PIN auth module, staff tables, lockout logic: **kept in the codebase**; the PIN login
  UI is simply unreachable from the new screens, so staff mode is recoverable.

### 3.3 Lifecycle & expiry

- Field states reuse session status: `active` → `closed`.
- Close paths: (a) any visitor, via confirm dialog; (b) server-side sweep (interval job,
  e.g. every 15 min) closes fields with `lastActivityAt` older than **18h**.
- Closed fields: removed from the public list; their link renders a closed-field screen
  with final match history and a "create new field" CTA. Socket room emits a final
  snapshot with `status: closed`.

## 4. API surface

| Route | Behavior |
| --- | --- |
| `POST /fields` | Create: `{ name, matchDurationSec }` → creates session + child field + slug → `{ slug, snapshot }`. Tight rate limit (e.g. 5/h/IP). Replaces manager-only `POST /sessions`. |
| `GET /fields` | Public list: active fields, newest first, paginated — name, createdAt, queue length, live-match indicator. |
| `GET /fields/:slug` | Resolve slug → full session snapshot (used by field screen + socket handshake). 404 unknown, 410-style closed payload for closed fields. |
| `POST /fields/:slug/close` | Close with confirm; idempotent. |
| existing queue/match/undo/activity routes | Logic unchanged; keyed by slug-resolved session id; `VisitorGuard`; contracts unchanged except attribution carries visitor nicknames (`actorName`). |
| `POST /visitors` (or lazy via guard) | Issue visitor cookie from `{ nickname }`. |

Rate limiting: existing throttler retained globally; `POST /fields` gets the strictest
bucket. Slug resolution adds an in-memory/service-level cache if needed (not required for
MVP of this pivot).

## 5. Web UX — three screens

1. **Home (`/`)** — hero button "פתח מגרש חדש"; below it the public list of active fields
   as tappable cards (name, queue length, live indicator). Create flow asks only field
   name + match duration.
2. **Field screen (`/f/:slug`)** — today's main screen unchanged in spirit: queue is the
   hero, field card with timer readout, quick-add, reorder (existing confirm dialogs),
   undo toasts. Adds: **share button** in the header (native share sheet with the URL,
   clipboard fallback) and close-field behind a confirm.
3. **Closed-field screen** — final history + create-new CTA.

`AppGate`/`AuthProvider` are replaced by a visitor provider (cookie presence, nickname
sheet). `SwitchUser`/staff login screens are unrouted. All new strings via `he.json` +
typed `t()`; RTL logical properties; times LTR-isolated — all existing hard rules apply.

Realtime is untouched: client resolves slug → joins `session:<id>` room → renders full
snapshots. Timers stay computed from timestamps.

## 6. Error handling & abuse

- Typed domain errors extended: `FieldClosedError` (mutation on closed field → 409),
  `UnknownFieldError` (bad slug → 404). Existing errors unchanged.
- Guards fail closed (missing/invalid cookie on mutation → 401 with a typed code the
  client maps to the nickname sheet).
- Abuse mitigations: creation rate limit per IP; mutation throttling per visitor cookie;
  nickname length/content limits (plain length cap; no profanity engineering at MVP);
  everything undoable stays undoable.
- No blocking popups rule stands; the close-field confirm matches the existing
  reorder-confirm precedent.

## 7. Testing

- **Unit/TDD** (failing test first, as always): slug generation (alphabet, collision
  retry), expiry sweep boundary (17h59m vs 18h01m), `VisitorGuard` matrix
  (read-no-cookie OK, mutation-no-cookie 401, mutation-with-cookie OK),
  `lastActivityAt` touched by each mutating service.
- **Integration (Testcontainers)**: migration applies on empty DB; two concurrent active
  sessions allowed (index dropped); create→add teams→start→close full flow via slug
  routes; closed-field mutations rejected; visitor attribution lands in activity log.
- **Contract tests (`packages/shared`)**: new `FieldListItem`, create/resolve payloads,
  `actorName` in snapshot views.
- **Web behavior tests**: home list rendering, nickname sheet triggers on first mutation
  only, share button fallback, closed-field screen.
- **E2E (Playwright, 375×812 first)**: US-comment-headed spec — visitor A creates field,
  shares URL; visitor B (second context, no login) opens it, adds a team; A starts a
  match; timer visible to both; close → both see closed screen.
- Concurrency: N parallel `POST /fields` with forced slug collision → all succeed with
  unique slugs.

## 8. Out of scope

- Accounts, ownership, admin links, moderation tooling.
- Per-field settings beyond name + duration.
- Migrating/renaming the `sessions` table to `fields` (possible later cleanup).
- Deleting staff/PIN code (kept unrouted).
- Multi-center semantics (single center row remains as seed).
