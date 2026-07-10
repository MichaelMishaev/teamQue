# Technical PRD — Football Match Queue Manager

Status: Approved design (2026-07-10)
Companion docs: [features-prd.md](./features-prd.md), [client-prd.md](./client-prd.md)
Source product spec: [./prd.md](./prd.md)
Dev rules baseline: `~/Desktop/devRules.md` (adapted — see §12)

---

## 1. Decisions Summary

| Decision | Choice |
|---|---|
| Tenancy | Single center now, multi-ready (`center_id` on every table) |
| Fields | **Single field at MVP** — schema/API are multi-field-ready; multi-field is a UI unlock (post-MVP) |
| Staff auth | Personal 4-digit PIN per staff member + center unlock PIN |
| Stack | NestJS API + Vite React PWA (two Railway services) + Railway Postgres |
| Realtime | Socket.IO, full-session **snapshot broadcast** after every mutation |
| Timers | Server-authoritative, **computed not ticked** |
| Offline | Online-first; resilient reconnect; no offline action queue (post-MVP) |
| Language | Hebrew only, RTL, all strings in locale files |
| Client UI | Tailwind CSS v4 + shadcn/ui (Radix) + dnd-kit + Sonner |

## 2. System Architecture

```
┌─────────────────┐     HTTPS REST + Socket.IO     ┌──────────────────┐
│  web (PWA)      │ ◄────────────────────────────► │  api (NestJS 11) │
│  Vite + React19 │                                │  REST + WS       │
│  static (nginx) │                                │  gateway         │
└─────────────────┘                                └────────┬─────────┘
                                                            │ Drizzle ORM
                                                   ┌────────▼─────────┐
                                                   │  Postgres        │
                                                   │  (Railway addon) │
                                                   └──────────────────┘
```

Three Railway services in one Railway project:

| Service | What | Notes |
|---|---|---|
| `api` | NestJS 11, Socket.IO gateway, Drizzle ORM, Pino structured logger | Single instance. Scaling beyond one instance requires the Socket.IO Redis adapter — documented, deliberately not built now. |
| `web` | Vite + React 19 SPA, built to static files | Served by nginx (or Railway static). `vite-plugin-pwa` generates manifest + service worker. SW caches **app shell only**, never API data. |
| `db` | Railway Postgres addon | Migrations via `drizzle-kit migrate` as Railway **pre-deploy command**. |

### Monorepo layout (pnpm workspaces)

```
apps/
  api/          # NestJS
  web/          # Vite React PWA
packages/
  shared/       # zod schemas, shared TS types, API contract types
docs/
  prds/
```

`packages/shared` is the single source of truth for request/response shapes and socket payloads. Both apps import from it; drift between client and server is a compile error.

## 3. Data Model

Conventions: UUID v7 primary keys; all timestamps `timestamptz` (UTC, N-23); every table carries `center_id` (multi-ready); soft business rules enforced in the service layer, hard invariants in the DB.

```sql
centers (
  id uuid PK,
  name text NOT NULL,
  pin_hash text NOT NULL,              -- center unlock PIN (argon2id)
  settings jsonb NOT NULL DEFAULT '{}',-- { defaultMatchDurationSec: 360, ... }
  created_at timestamptz NOT NULL
)

staff (
  id uuid PK,
  center_id uuid NOT NULL REFERENCES centers,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager','staff')),
  pin_hash text NOT NULL,              -- personal 4-digit PIN (argon2id)
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL
)

captains (
  id uuid PK,
  center_id uuid NOT NULL REFERENCES centers,
  name text NOT NULL,
  nickname text,
  note text,                           -- private staff note
  tags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL
)
-- Duplicate names ALLOWED (real-world requirement). UI disambiguates
-- via nickname + games-today. No unique constraint on name.

sessions (
  id uuid PK,
  center_id uuid NOT NULL REFERENCES centers,
  date date NOT NULL,
  location text,
  match_duration_sec int NOT NULL,     -- session default, per-match override allowed
  status text NOT NULL CHECK (status IN ('active','closed')),
  created_by uuid NOT NULL REFERENCES staff,
  created_at timestamptz NOT NULL
)
-- Partial unique index: at most ONE active session per center.
CREATE UNIQUE INDEX one_active_session ON sessions (center_id) WHERE status = 'active';

fields (
  id uuid PK,
  session_id uuid NOT NULL REFERENCES sessions,
  center_id uuid NOT NULL,
  name text NOT NULL,
  position int NOT NULL                -- display order
)

matches (
  id uuid PK,
  session_id uuid NOT NULL REFERENCES sessions,
  center_id uuid NOT NULL,
  field_id uuid REFERENCES fields,     -- NULL while queued (queue is per-field optional, see §note)
  captain_a_id uuid NOT NULL REFERENCES captains,
  captain_b_id uuid NOT NULL REFERENCES captains,
  status text NOT NULL CHECK (status IN ('queued','live','paused','finished','cancelled')),
  queue_position int,                  -- NULL unless status='queued'
  planned_duration_sec int NOT NULL,
  started_at timestamptz,
  paused_at timestamptz,               -- non-NULL only while status='paused'
  accumulated_pause_sec int NOT NULL DEFAULT 0,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('auto','manual','cancelled')),
  started_by uuid REFERENCES staff,    -- NULL when auto
  ended_by uuid REFERENCES staff,      -- NULL when auto
  CHECK (captain_a_id <> captain_b_id)
)
-- Indexes: (session_id, status), (session_id, captain_a_id), (session_id, captain_b_id),
-- (field_id) WHERE status IN ('live','paused')  -- at most one live match per field is
-- enforced by a partial unique index:
CREATE UNIQUE INDEX one_live_match_per_field ON matches (field_id)
  WHERE status IN ('live','paused');

activity_log (
  id uuid PK,
  center_id uuid NOT NULL,
  session_id uuid REFERENCES sessions,
  staff_id uuid REFERENCES staff,      -- NULL for automatic actions
  action text NOT NULL,                -- 'match.started', 'queue.reordered', ...
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL
)
-- Written in the SAME transaction as its mutation (N-12). Append-only, never updated.
```

**Queue model note:** the queue lives on `matches` rows with `status='queued'`. MVP uses a **single shared queue** (`field_id` NULL while queued; the field is chosen at start). The schema also supports per-field queues (`field_id` set while queued) if ever needed — no UI for that at MVP.

**Derived values (never stored):** captain games-today and last-played-at are computed by query over today's session matches. At 50 captains / ~100 matches per evening this is trivially fast with the indexes above.

## 4. Timer Design (critical)

**Timers are computed, never ticked.** No `setInterval` owns truth anywhere.

Server state per match: `started_at`, `planned_duration_sec`, `accumulated_pause_sec`, `paused_at`.

```
elapsed(now)   = (paused_at ?? now) - started_at - accumulated_pause_sec
remaining(now) = planned_duration_sec - elapsed(now)
ends_at        = started_at + planned_duration_sec + accumulated_pause_sec   (only while live)
```

- **Pause** sets `paused_at = now()`. **Resume** adds `now() - paused_at` to `accumulated_pause_sec`, clears `paused_at`. **Extend** adds N seconds to `planned_duration_sec` (works on live and paused matches).
- **Client rendering:** the client computes the countdown locally every second from snapshot fields + a **server-clock offset** measured on each socket connect (server sends its `now` in the connect ack; client stores `offset = serverNow - Date.now()`). Wrong device clocks therefore cannot corrupt displayed time. Client never trusts `Date.now()` raw for business display (N-23).
- **Screen lock / reconnect:** nothing was counting, so nothing is lost. On reconnect the client receives a fresh snapshot and the countdown is instantly correct.
- **Auto-finish:** a NestJS interval scheduler (every 5s) runs one query for `live` matches with `ends_at <= now()`, transitions each to `finished` with `end_reason='auto'`, writes the activity log entry (staff_id NULL, action `match.finished.auto`), and broadcasts the snapshot. Because it derives from DB state, it survives API restarts and never double-fires (the UPDATE is conditional on `status='live'`).
- Auto-finish latency tolerance: up to ~5s after zero. The client shows 00:00 + "מסתיים…" state during that window.

## 5. Realtime Protocol (Socket.IO)

- Namespace `/session`; room per session id (`session:<uuid>`).
- Handshake auth: the same httpOnly staff-session cookie as REST; unauthenticated sockets are disconnected (fail closed, R-16).
- Connect ack payload: `{ serverNow: ISO8601 }` → client computes clock offset.
- On join: server immediately emits `session:snapshot`.
- After **every successful mutation** (REST or scheduler): server emits `session:snapshot` to the room.

```ts
// packages/shared — socket contract
type SessionSnapshot = {
  session: { id; date; location; matchDurationSec; status };
  fields: Array<{ id; name; position;
    liveMatch: MatchView | null }>;
  queue: MatchView[];                 // ordered by queue_position
  captainsToday: Record<CaptainId, { gamesToday: number; lastPlayedAt: string | null }>;
  emittedAt: string;                  // server timestamp
};
```

- Client is a **dumb renderer** of the latest snapshot (TanStack Query cache replaced on each event). Optimistic UI only for drag-reorder; reverted if the PATCH fails.
- Reconnect: Socket.IO auto-reconnect → rejoin room → fresh snapshot. Missed events are irrelevant by design (snapshots are self-contained).
- Offline UX: socket `disconnect` → show offline banner, disable mutating controls, keep last snapshot visible (see client PRD §7).

## 6. Auth & Sessions

Two-layer auth, both PINs hashed with argon2id:

1. **Device unlock (center PIN)** — `POST /auth/center` with center PIN → long-lived (90d) httpOnly `Secure` `SameSite=Lax` cookie identifying the center. Entered once per device.
2. **Staff login (personal PIN)** — `POST /auth/login { staffId, pin }` → 12h httpOnly cookie carrying a signed JWT `{ staffId, centerId, role }` (stateless — no session table; **never** localStorage, R-22). "Switch user" = one tap → staff picker → PIN.

- **Rate limiting (R-25):** center PIN: 5 attempts / 15 min / IP. Staff PIN: 5 attempts per staff member → 60s lockout (progressive: doubles each round). Applied via Nest throttler guard.
- **Guards fail closed (R-16):** `CenterGuard` → `StaffSessionGuard` → `RolesGuard`; any undeterminable state throws `ForbiddenException`.
- Roles: `manager` (everything incl. staff management, session close, settings) vs `staff` (live operations). MVP permission matrix is small and lives in one `as const` table with a permission-matrix test (R-13).

## 7. API Surface (REST, OpenAPI)

NestJS modules: `auth`, `staff`, `captains`, `sessions` (owns fields, matches, queue), `activity`. OpenAPI spec generated from decorators; client types generated from the spec in `packages/shared` (R-37).

| Method & Path | Purpose |
|---|---|
| `POST /auth/center` | Device unlock with center PIN |
| `POST /auth/login` | Staff PIN login |
| `POST /auth/logout` | End staff session |
| `GET  /auth/me` | Current staff + center |
| `GET  /staff` | Staff picker list (names only, pre-login) |
| `POST /staff` · `PATCH /staff/:id` | Manage staff (manager only) |
| `GET  /captains?q=` | Search; each hit includes `gamesToday`, `lastPlayedAt` |
| `POST /captains` | Create (name only required) |
| `PATCH /captains/:id` | Edit name/nickname/note/tags |
| `GET  /sessions/active` | Today's active session snapshot (REST fallback for socket) |
| `POST /sessions` | Open session (date, location, duration, fields) |
| `PATCH /sessions/:id` | Edit settings / close session |
| `POST /sessions/:id/matches` | **Quick-add**: captains by id or `{ newName }` inline-create; enqueue |
| `PATCH /sessions/:id/queue` | Reorder (array of match ids in new order) |
| `POST /matches/:id/start` | Start the match. `fieldId` optional in body — MVP has one field per session, so the server infers it; required only when a session has 2+ fields (post-MVP) |
| `POST /matches/:id/pause` · `/resume` | Pause / resume |
| `POST /matches/:id/extend` | Body: `addSec` |
| `POST /matches/:id/finish` | Manual finish |
| `POST /matches/:id/cancel` | Cancel queued match (soft-remove, undoable) |
| `PATCH /matches/:id/captains` | Swap/replace captains on a queued match |
| `POST /matches/:id/replay` | Duplicate finished/queued match to queue bottom |
| `POST /actions/:activityId/undo` | Server-side inverse of a recent undoable action |
| `GET  /sessions/:id/history` | Finished matches of a session |
| `GET  /sessions/:id/summary` | End-of-session report: match count, unique captains, total play time, first/last match, avg actual duration, top captains, extend + manual/auto finish counts (single aggregate query) |
| `GET  /sessions?from=&to=` | Past sessions list |
| `GET  /activity?sessionId=` | Staff activity log |

### Match state machine

Explicit transition table (`as const`, N-10), property-based tested over all `(from, to)` pairs (N-8):

```
queued    → live        (start: requires free field; captain not already live — see below)
queued    → cancelled   (cancel/remove)
live      → paused      (pause)
live      → finished    (manual finish | auto finish | extend keeps live)
paused    → live        (resume)
paused    → finished    (manual finish)
```

Everything else → `InvalidTransitionError` (409).

**Concurrency invariants (N-9), DB-enforced:**
- Start is a conditional update: `UPDATE matches SET status='live', ... WHERE id=$1 AND status='queued'` — two staff starting the same match → exactly one succeeds, the other gets `InvalidTransitionError`.
- One live match per field → partial unique index (`one_live_match_per_field`).
- Captain can't play on two fields at once → service check inside the start transaction: any `live|paused` match in this session containing either captain → `CaptainAlreadyPlayingError` (409). Serialized by transaction + the field unique index.

### Undo (no blocking confirmations)

Undoable actions: cancel/remove from queue, manual finish (within 30s), reorder. Each returns its `activityId`; `POST /actions/:activityId/undo` applies the server-side inverse (e.g. cancelled → queued at prior position), is itself audit-logged (`action: 'undo'`), and is rejected after its window or if state moved on (`UndoExpiredError`).

## 8. Error Handling

- Typed domain errors extending `DomainError` (R-17): `InvalidTransitionError`, `CaptainAlreadyPlayingError`, `FieldOccupiedError`, `UndoExpiredError`, `SessionClosedError`, `PinLockedError`… Global exception filter maps to HTTP: domain → 409/422, auth → 401/403, unknown → 500 (logged, generic body).
- Error responses: `{ code: 'CAPTAIN_ALREADY_PLAYING', message, details? }` — `code` is the client's i18n key input; UI never displays raw server messages.
- No swallowed errors (R-18); no `console.*` in production code — Pino with request context (R-19).

## 9. Security

- All input validated at the boundary with zod schemas from `packages/shared` (nest zod pipe). Strings length-capped; names sanitized (stored raw, escaped at render by React — plus no `dangerouslySetInnerHTML` anywhere, R-23 adapted).
- Parameterised queries only — Drizzle query builder; raw SQL fragments forbidden (R-21).
- Secrets only in Railway env vars; `.env*` git-ignored (R-20).
- Cookies: httpOnly, `Secure`, `SameSite=Lax` (R-22). CORS locked to the web origin. Helmet defaults.
- Dependency audit (`pnpm audit`) in CI; high/critical blocks deploy (R-24).

## 10. Testing Strategy

| Layer | Tool | Scope |
|---|---|---|
| Domain unit (TDD) | Vitest | State machine (property-based, all transition pairs — N-8), timer math, queue ordering, undo inverses, fairness stats |
| Component unit | Vitest + Testing Library (jsdom) | Shared components: behavior assertions (state variants, derived states, callbacks, disabled logic) — never markup snapshots. TDD for new components; existing ones carry a regression baseline |
| Concurrency | Vitest + real PG | N≥5 parallel starts of same match / same field / same captain → exactly one success (N-9) |
| API integration | Vitest + Testcontainers PG + supertest | Endpoints against real Postgres; migrations run on empty DB first (R-36); permission matrix per (role × endpoint) (R-13) |
| Socket | Vitest + socket.io-client | Snapshot on join, snapshot after mutation, auth rejection, reconnect |
| E2E | Playwright, mobile viewport 375×812 first (N-15) | Core flows only: unlock→login; quick-add→start→auto-finish; reorder; undo; two-device sync (two contexts) |

- Coverage ≥ 80% on `api` domain modules; auth module 90% (R-15). Web shared components get behavior unit tests (no coverage gate); flows verified via E2E.
- Every E2E spec header references its user story ID from features-prd (N-14).
- Test data via factory helpers, hermetic (N-16).

## 11. Railway Deployment

| Item | Value |
|---|---|
| Services | `api` (Node 22), `web` (static), `db` (Postgres addon) |
| API pre-deploy | `pnpm drizzle-kit migrate` |
| Health checks | `GET /health` (api) — checks DB connectivity |
| Env vars | `DATABASE_URL` (Railway ref), `SESSION_SECRET`, `WEB_ORIGIN`, `NODE_ENV` |
| Domains | `web` public; `api` public (same-site subdomain, e.g. `api.<domain>`) so cookies work with `SameSite=Lax` |
| CI (GitHub Actions) | lint → type-check → unit → integration (Testcontainers) → E2E → deploy via Railway; all gates required (R-38) |
| Branching | Trunk-based, `main` always deployable (R-27) |

WebSockets are natively supported on Railway; no special config beyond sticky sessions being unnecessary (single api instance).

## 12. Dev Rules — Adaptation for This App

Baseline: `devRules.md`. Applied verbatim unless listed here.

| Rule | Adaptation | Why |
|---|---|---|
| R-10 (depend on abstractions/DI) | Applied only where a second implementation is plausible (none at MVP). Services depend on Drizzle repos directly; no interface ceremony for single-impl classes. | K-2 simplicity; YAGNI |
| R-13 (permission matrix) | Kept, but matrix is small (2 roles) — one table-driven test file | Scale-appropriate |
| R-15 (coverage) | 80% on api domain modules; web shared components carry behavior unit tests (Testing Library) but no coverage gate — E2E covers flows | Behavior tests catch regressions; a % gate on UI invites snapshot noise |
| R-28 (feature flags) | Dropped for MVP | No risky-rollout surface yet; single deploy target |
| R-31/R-34/R-35 (QA artifacts) | User stories live in features-prd.md and ARE the acceptance criteria; E2E specs reference their US-IDs | Same intent, single source |
| R-37 (OpenAPI drift) | Kept: generated spec committed; CI diff check | |
| N-11 (idempotency for side effects) | N/A — no email/SMS/webhooks at MVP. The undo/replay endpoints are state-guarded instead | No external side effects exist |
| N-20 (CWV gates in CI) | Lighthouse CI budget on the built PWA (LCP ≤ 2.5s on simulated 4G mobile), advisory at MVP, blocking post-launch | Avoid blocking early iteration on lab noise |
| N-13 (locale files) | Kept strictly — Hebrew `he.json` from day one; missing key = CI error | |
| K-1..K-4, R-1..R-9, R-11/R-12/R-14, R-16..R-27, R-29/R-30, R-32/R-33, R-36, R-38, N-7..N-10, N-12, N-14..N-19, N-21..N-25 | Verbatim | |

## 13. Non-Goals (technical)

- No multi-field UI at MVP — sessions create exactly one field; the `fields` table, partial unique index, and one-captain-one-field service check stay in place so enabling multiple fields later touches only the UI and session setup.

- No Redis / horizontal scaling (single api instance is 100× headroom for 5 staff devices).
- No offline action queue / CRDT sync (post-MVP; PRD §19).
- No SSR / SEO work — the app is behind a PIN.
- No push notifications, no email, no external integrations.
- No admin web console beyond in-app manager screens; center/staff seeding via migration script.
