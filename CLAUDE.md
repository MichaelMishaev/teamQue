# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Football Match Queue Manager** — mobile-first RTL-Hebrew PWA for youth-center staff running live football queues. Captains (team leaders) only are tracked, never individual players. **The queue is the hero surface — the match timer is a status readout, never the centerpiece.** Single center, single field/court at MVP (schema is multi-center and multi-field ready).

Authoritative specs (read before feature work):
- `docs/plans/2026-07-10-mvp-development-plan.md` — **master phase plan**: implementation is strictly phased (Phase 0 → 9), each gated by a QA checklist that must be checked off before the next phase starts. Check its status tracker before doing implementation work to see which phase is active.
- `docs/prds/technical-prd.md` — architecture, DB schema, API table, timer algorithm, adapted dev rules
- `docs/prds/features-prd.md` — user stories US-XXX (these ARE the acceptance criteria; E2E specs reference them)
- `docs/prds/client-prd.md` — UI/UX spec
- `design.md` — design system: token hierarchy (primitive → semantic → component), RTL rules, component inventory

## Commands

```bash
pnpm install                    # workspace root
pnpm dev                        # builds shared, then starts the web Vite dev server (force-kills whatever's on :5179 first, see apps/web/scripts/free-dev-port.mjs)
pnpm test                       # shared build + vitest run across all packages
pnpm typecheck                  # strict tsc across all packages
pnpm build                      # pnpm -r build (shared → web → api, build order matters)

# single test file, per package:
pnpm --filter web vitest run src/lib/time.test.ts
pnpm --filter api vitest run src/queue/search-order.test.ts
pnpm --filter shared vitest run src/contracts.test.ts

# api-only, run from apps/api or with --filter api:
pnpm --filter api dev           # tsx watch src/main.ts
pnpm --filter api db:generate   # drizzle-kit generate (new migration from schema.ts diff)
pnpm --filter api db:migrate    # drizzle-kit migrate (applies drizzle/*.sql)
pnpm --filter api seed          # tsx scripts/seed.ts
```

`apps/api`'s `vitest run` executes **both** `src/**/*.test.ts` (unit) and `test/**/*.test.ts` (integration). Integration tests spin up a throwaway Postgres via `@testcontainers/postgresql` and apply the committed `drizzle/` migrations — **Docker must be running** to run them. To run only unit tests: `pnpm --filter api vitest run src`.

## Architecture

pnpm monorepo, three packages, strict build order (`shared` → `web`/`api`, since both depend on `shared`'s built `dist/`):

- **`packages/shared`** — zod contracts: enums, request/response shapes, the `SessionSnapshot` view type, `SOCKET_EVENTS`, typed domain errors. This is the only source of truth for shapes shared across the API and web — the Drizzle enums in `apps/api/src/db/schema.ts` are generated from `shared`'s zod enums so the DB and the contracts cannot drift.
- **`apps/api`** — NestJS + Socket.IO + Drizzle + Postgres. One Nest module per domain (`auth`, `staff`, `captains`, `sessions`, `queue`, `matches`, `actions` (undo), `activity`, `reads`, `realtime`). `reads` is staff-only (activity feed/log, session history — `StaffSessionGuard`-guarded); it is unrelated to the public `/line` surface below.
- **`apps/web`** — Vite + React 19 + Tailwind v4, shadcn-style components. Presentational; the session snapshot from the server is the only state source (no client-derived queue/match state).

**Realtime model**: every mutating API service calls `SessionEventsService.broadcast(sessionId)` after its own transaction commits (technical-prd §5). This rebuilds the *full* session snapshot via `SnapshotService` and emits it to the session's Socket.IO room (`session:<id>`) — never a diff, never a partial patch. Clients are dumb renderers of whatever snapshot they last received; there is no separate client-side reducer reconciling deltas.

**Timers are computed, never ticked.** The server stores `started_at` / `planned_duration_sec` / `accumulated_pause_sec` / `paused_at` on a match row; remaining time is a pure function of those fields, both server-side (auto-finish scheduling) and client-side (`apps/web/src/lib/time.ts`, driven by `apps/web/src/lib/server-clock.ts` for clock-skew correction). Never introduce a `setInterval` that decrements a counter — recompute from the stored timestamps instead.

**Line-manager queue model**: `queue_entries` rows are single-team waitlist entries, never an "A vs B" pairing — see the doc comment on `queueEntries` in `apps/api/src/db/schema.ts`. Two entries only pair into a `matches` row at kickoff (`POST /sessions/:id/start`), which deletes both queue rows. `position` is renumbered 1..n on every line mutation under a per-session Postgres advisory lock (`apps/api/src/queue/line.service.ts`) to keep renumbering race-free under concurrent staff actions.

**Single-service deploy**: in production the API serves the built web SPA at `/` (same origin as the API + Socket.IO), configured in `apps/api/src/app.module.ts` via `ServeStaticModule` with API route prefixes excluded so they still reach their controllers. This keeps auth cookies `SameSite=Lax` with no CORS. The `Dockerfile` builds `shared` → `web` (with `VITE_API_URL=""`) → `api`, then runs `db:migrate` before starting `node apps/api/dist/main.js`. Railway watches `/apps/api/**` and `/apps/web/**` (`railway.json`).

**Auth is open (no PIN gate) at the HTTP boundary**: `GET /auth/me` always resolves to a real identity (seeded manager by default, or whoever was picked via `SwitchUser`). `apps/web/src/screens/AppGate.tsx` blocks briefly on that call, then mounts `RealProviders` under `AuthProvider`. Setting `VITE_DEMO=1` skips the API entirely and mounts `DemoProviders`/`mockSession.ts` (in-memory, switchable via `SwitchUser`) — useful for UI work with no backend running. Guards for privileged endpoints (manager-only routes, staff PIN auth for local actions) live in `apps/api/src/auth/guards/`.

**Public read-only player view (`/line`)**: a second, anonymous, no-provider-stack surface separate from the staff app. `PublicLinePageController` (`apps/api/src/public-line-page.controller.ts`, registered directly on `AppModule`, not inside a feature module) serves the same SPA `index.html` at `GET /line`; `apps/web/src/lib/route.ts` + `apps/web/src/main.tsx` special-case that path to mount `PublicLineScreen` with none of `AppGate`/`RealProviders`/`VisitorProvider` (not even under `VITE_DEMO=1`). It reads the fixed "default court" via the pre-existing public `GET /fields`/`GET /fields/:slug` routes and subscribes to the same Socket.IO snapshot stream as staff clients — there is no per-slug routing yet, only one hardcoded court name. View/visit-end events are posted to a separate unauthenticated, throttled endpoint (`POST /activity/:slug/public-line-events`, `apps/api/src/activity/public-line-telemetry.controller.ts` + `.writer.ts`) as `activityLog` rows (`public_line.viewed` / `public_line.visit_ended`). Entry point from staff UI: the "open player view" link in `HomeScreen`/`MainScreen`, shown only for that one default court.

**Exception logging**: the global `HttpExceptionFilter` (`APP_FILTER` in `app.module.ts`) writes every rejected/failed HTTP request (4xx/5xx) with a resolved `centerId` into the activity log via `ExceptionActivityWriter` (`apps/api/src/activity/exception-activity.writer.ts`) as `eventKind: 'exception'` rows — status code, error code, method, a normalized path (UUIDs replaced with `:id`), and a `correlationId` (also returned as `X-Correlation-Id`), deliberately never the raw message/stack/body/cookies. `ReadsService` and `ActivityFeed.tsx` render these alongside normal action entries.

## Critical paths (devRules tier classification)

A diff touching **any** of these globs makes the **whole change critical** — reviewer-authored frozen test, Codex adversarial gate, N-parallel race tests. Unsure → critical.

```
apps/api/src/queue/**        # races — position renumbering under the per-session advisory lock
apps/api/src/matches/**      # races — kickoff pairs two queue_entries into one match, exactly-one-wins
apps/api/src/actions/**      # irreversible — undo/replay state transitions
apps/api/src/auth/**         # auth — guards, manager-only routes, staff PIN
apps/api/src/db/schema.ts    # irreversible — schema
apps/api/drizzle/**          # irreversible — migrations
```

Everything else is **standard** (the fast path): `apps/web/**`, `packages/shared/**`, and the remaining api modules (`staff`, `captains`, `sessions`, `activity`, `reads`, `realtime`).

Not critical here, deliberately: **money** (no billing surface exists) and **data isolation** (single center / single field at MVP — the multi-center schema is ready but carries no live tenant wall). Both flip to critical the day they gain a real surface.

## Hard rules (baseline `~/Desktop/devRules.md`; project additions in technical-prd §12)

- **Tests**: a failing test is frozen — fix the implementation, never the test. Every bug gets a regression test before it's closed. Standard paths: test what's worth testing, no test-first mandate, no coverage gates. Critical paths (above): failing test first, authored by Codex, plus N-parallel concurrent-attempt tests on any line mutation.
- **TypeScript max-strict**: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **i18n**: zero hardcoded user-facing strings — everything through `apps/web/src/i18n/he.json` + typed `t()`. Missing key = compile error.
- **RTL**: logical properties only (`ms-*/me-*/ps-*/pe-*`, `start/end`); `ml/mr/left/right` are forbidden. Times/numbers LTR-isolated (`<bdi>`/`dir="ltr"`) with `tabular-nums`.
- **Tokens**: components consume semantic Tailwind utilities (`bg-surface`, `text-accent`) and component tokens (`--btn-height-big`) — a hex value in a component file is a bug.
- **UX**: no blocking popups in live flows — undo toasts, disabled-with-reason, inline errors. Touch targets ≥44px; primary actions 60px. **Known flagged exception:** `QueueList`'s three reorder confirmations (pair-grip drag, single-row drag, move-to-top/bottom, all via `PairSwitchConfirmDialog`) block on every reorder instead of using an undo toast — a deliberate "maximal protection" call made during that feature's design, in tension with this rule, not yet revisited (see `docs/superpowers/specs/2026-07-15-swap-partner-naming-design.md`).
- **No console.log** in production code; typed domain errors (`apps/api/src/common/domain-error.ts`, per-module `errors.ts`), fail-closed guards.

## Component conventions

Shared components live in `apps/web/src/components/` (ui primitives in `ui/`), are presentational (server snapshot is the only state source), state their single responsibility in a JSDoc header, and get behavior unit tests (Testing Library, jsdom) — assert variants/callbacks/derived states, never markup snapshots.
