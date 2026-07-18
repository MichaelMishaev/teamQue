# MVP Development Plan — Football Match Queue Manager

> **For agentic workers:** This is the MASTER phase plan. Each phase gets its own detailed
> bite-sized implementation plan (superpowers:writing-plans format, full code per step) written
> at phase start, then executed via superpowers:subagent-driven-development or executing-plans.
> **No phase may start until the previous phase's QA GATE is checked off.**

**Goal:** Ship the MVP defined in `docs/prds/` to production on Railway: single-court live queue manager, Hebrew RTL PWA, realtime multi-staff.

**Architecture:** pnpm monorepo — `apps/api` (NestJS 11 + Socket.IO + Drizzle + Postgres), `apps/web` (Vite + React 19 + Tailwind v4, already started), `packages/shared` (zod contracts). Snapshot-broadcast realtime; computed timers; queue-first UI.

**Tech stack:** TypeScript max-strict everywhere · Vitest + Testing Library · Testcontainers (integration) · Playwright mobile-first (E2E) · Railway (api + web + Postgres).

## Global constraints (apply to every phase)

- TDD: failing test first for all domain logic and new components; a failing test is frozen (R-11/R-12).
- TS max-strict; no `any`, no `!` (R-1..R-3). No `console.*` in production code (R-19).
- All user-facing strings via `he.json` + typed `t()` (N-13). RTL logical properties only.
- **The queue is the hero** — any screen work is measured against design.md §0.
- Single court at MVP; schema stays multi-field/multi-center ready.
- Every mutation audit-logged in the same transaction (N-12). Guards fail closed (R-16).
- Conventional commits; small independently deployable slices (R-26/R-30).
- E2E specs start with their US-ID comment and run at 375×812 first (N-14/N-15).

## How to read the QA gates

Each gate is a checklist run **before** the next phase starts. Three kinds of checks:
- `auto` — command with expected output (CI-enforceable)
- `manual` — a human (you, Michael) taps through on a real phone
- `evidence` — artifact to attach in the phase-close note (screenshot, timing, report)

Gate results are recorded by checking the boxes in THIS file + a one-line date/initials note.

---

## Phase 0 — Repo baseline & CI ✅ prerequisite for everything

**Why:** the project is not even a git repository yet; nothing else is safely checkable.

Tasks:
- [x] `git init`, initial commit of current state (respect smart-commit rules: explicit paths, no `git add .`)
- [x] GitHub repo + trunk-based `main` (R-27) — https://github.com/MichaelMishaev/queuLineManager (private)
- [x] CI workflow: `pnpm install → typecheck → test → build` on every push; all gates required (R-38)
- [x] `packages/shared` skeleton (empty zod barrel) so the workspace shape is final

### 🛑 QA GATE 0
- [x] `auto` — CI green on `main` for typecheck + 22 existing tests + web build (run 29088702420, 30s)
- [x] `auto` — `git log --oneline` shows conventional commits only (feat/fix/docs)
- [x] `manual` — clean clone on a second directory: `pnpm install && pnpm test && pnpm build` all pass
  - Gate caught a real bug: clean-clone typecheck failed — `@types/node` was implicit via hoisting. Fixed in `babaf77`.
- Gate closed: 2026-07-10 (Claude + CI evidence)

---

## Phase 1 — Shared contracts (`packages/shared`)

**Delivers:** zod schemas + TS types both apps import: `SessionSnapshot`, `MatchView`, match statuses, API request/response shapes, socket event names, error codes.

Tasks:
- [x] Write failing type-level/unit tests for schema parsing (valid + invalid payloads per N-7) — RED evidence captured (27 failing)
- [x] Implement schemas: captain, staff, session, field, match, activity, summary, snapshot
- [x] Error code enum matching technical-prd §8 (`CAPTAIN_ALREADY_PLAYING`, `UNDO_EXPIRED`…)
- [x] `apps/web` imports snapshot types (replaces any local duplicates) — `RunningStatus` derived from shared `MatchStatus`

### 🛑 QA GATE 1
- [x] `auto` — `pnpm --filter shared test` green (27 contract tests incl. all failure paths); 49 total across workspace
- [x] `auto` — workspace typecheck green with web importing shared types
- [x] `evidence` — schema ↔ PRD review: subagent reviewer verified field-by-field, zero missing/extra. One deliberate improvement over the §5 sketch (captain stats inline in CaptainView instead of a captainsToday map; serverNow added) — spec updated to match.
- Gate closed: 2026-07-10 (implementer da68cab..40a900c; task review: spec ✅, quality approved, 0 findings)

---

## Phase 2 — API foundation: scaffold, DB, auth

**Delivers:** NestJS app boots against Railway-compatible Postgres; migrations; center-PIN device unlock; staff-PIN login; guards; rate limiting.

Tasks:
- [x] NestJS 11 scaffold + Pino + config + `/health` (checks DB)
- [x] Drizzle schema per technical-prd §3 **including partial unique indexes** (`one_active_session`, `one_live_match_per_field`); first migration
- [x] Migration runs on empty DB in CI before tests (R-36) — Testcontainers per run
- [x] Auth module TDD: center PIN → 90d cookie; staff PIN → 12h JWT cookie; argon2id; progressive lockout; throttler (R-25)
- [x] Guards: `CenterGuard` → `StaffSessionGuard` → `RolesGuard`, fail closed (R-16) + permission-matrix test skeleton (R-13)
- [x] Seed script: one center, 3 staff (dev PINs)
- [x] BONUS (review-driven): compiled prod boot fixed (shared dist + DI metadata bug), pg pool drained on SIGTERM, **atomic lockout counter** (race found by review — 8 parallel failures collapsed to 1 before fix)

### 🛑 QA GATE 2
- [x] `auto` — integration suite (Testcontainers): unlock/login/lockout/expiry — happy + failure paths (14 auth int tests + N=8 race test, 5× stable)
- [x] `auto` — permission matrix test: 5 routes × 4 personas = 20 cases (R-13)
- [x] `auto` — 6 wrong PINs → lockout w/ retryAfterSec; correct PIN during lockout still 423; throttler 429 on center PIN
- [x] `manual` — curl pass against seeded data (tsx + compiled dist/main.js), incl. /health, unlock, login, me — in task-p2b report
- [x] `evidence` — auth coverage 98.92% lines (target ≥90%)
- Gate closed: 2026-07-10 (2 review rounds: 1 Critical race + 1 Critical DI-bootstrap found & fixed; 160 workspace tests green)

---

## Phase 3 — API domain: captains, sessions, matches, queue, undo, log

**Delivers:** the whole REST surface of technical-prd §7 minus sockets. This is the largest phase — its detailed plan MUST split it into 4 sub-plans: (a) captains+search, (b) session+field, (c) match state machine+queue, (d) undo+activity+summary.

Tasks (per sub-plan, all TDD):
- [ ] Captains CRUD + search with `gamesToday`/`lastPlayedAt` inline (single query, no N+1 — N-21)
- [ ] Session open/close (one-active enforced by index), duration change mid-session (US-012)
- [ ] Match state machine as `as const` table + property-based test over ALL (from,to) pairs (N-8)
- [ ] Start/pause/resume/extend/finish/cancel/replay/change-captains + queue reorder
- [ ] Concurrency tests N≥5: same match start, same field, same captain → exactly one success (N-9)
- [ ] Undo endpoint with windows (5s/30s) + inverse ops + `UNDO_EXPIRED`
- [ ] Activity log written in the same transaction as every mutation (N-12) + `GET /activity`
- [ ] `GET /sessions/:id/summary` aggregate (US-073)
- [ ] OpenAPI spec generated + committed; drift check in CI (R-37)

### 🛑 QA GATE 3
- [ ] `auto` — property-based transition test: exactly the 6 documented transitions pass, all others throw `InvalidTransitionError`
- [ ] `auto` — concurrency suite green 20 consecutive runs (`vitest --sequence.shuffle` ×20 script) — no flakes (N-19)
- [ ] `auto` — every endpoint has happy + failure path tests (N-7); domain coverage ≥80%
- [ ] `auto` — audit completeness test: for each mutating endpoint, exactly one activity row with before/after JSON in the same tx
- [ ] `manual` — full evening simulated via httpie script in repo (`scripts/manual-qa/evening.sh`): open session → add 6 matches → start/pause/extend/finish → undo a remove → close → summary returns correct counts
- [ ] `evidence` — summary numbers from the script match hand-computed values (paste both in phase notes)
- Gate closed: ____

---

## Phase 4 — Realtime: gateway, snapshots, auto-finish

**Delivers:** Socket.IO `/session` namespace; cookie-auth handshake; `serverNow` clock offset; `session:snapshot` after every mutation; 5s auto-finish scheduler.

Tasks:
- [ ] Gateway TDD (socket.io-client in tests): join room → immediate snapshot; unauthenticated → disconnect
- [ ] Snapshot builder (one query set, shape from `packages/shared`)
- [ ] Broadcast hook after every successful mutation (single choke point, not per-controller sprinkles)
- [ ] Auto-finish interval: conditional UPDATE, activity row (staff NULL), broadcast; idempotent under restart
- [ ] Reconnect test: kill socket, mutate via REST, reconnect → fresh correct snapshot

### 🛑 QA GATE 4
- [ ] `auto` — two socket clients: client A mutates via REST, client B receives snapshot <1s (asserted timing)
- [ ] `auto` — auto-finish: live match with past `ends_at` finishes within 5s, exactly once (parallel scheduler ticks test)
- [ ] `auto` — API restart mid-live-match (Testcontainers restart): timer state intact, auto-finish still fires
- [ ] `manual` — two terminals with `wscat`/script: watch snapshot arrive on both while curling a start
- [ ] `evidence` — snapshot payload for a 50-captain/30-match session measured <32KB
- Gate closed: ____

---

## Phase 5 — Web app shell: auth screens + live data wiring

**Delivers:** real app replaces showcase; unlock → staff picker → PIN → main screen skeleton fed by socket snapshot; offline banner behavior.

Tasks:
- [ ] Socket client + TanStack Query snapshot cache + clock-offset hook (TDD the offset/reconnect logic)
- [ ] Auth screens composed from `PinPad`/`StaffPicker` against real API
- [ ] App shell: top bar (user chip, clock, tabs), `ConnectivityBanner` wired to socket state
- [ ] App shell navigation: URL-backed top-level destinations; Android/browser Back returns secondary screens directly to Main without remounting the field (US-074)
- [ ] Countdown hook: 1s tick + `visibilitychange` recompute (TDD with fake timers)
- [ ] Showcase `App.tsx` moves to `/dev-kit` route (kept as living style guide)

### 🛑 QA GATE 5
- [ ] `auto` — component/unit suites green incl. offset + countdown hooks (wake from lock simulated via visibilitychange event)
- [ ] `auto` — navigation regression: History/Activity/Settings use one managed history entry; Back returns to Main and Forward restores the last destination (US-074)
- [ ] `auto` — Playwright: US-001/002/003 (unlock, login, switch user <5s) at 375×812
- [ ] `manual` — real phone (installable later, browser now): login on 2 devices, watch clock + connectivity banner on airplane-mode toggle; countdown correct within 1s after wake
- [ ] `evidence` — screen recording of the airplane-mode reconnect
- Gate closed: ____

---

## Phase 6 — Main screen: queue (the hero), field card, quick-add

**Delivers:** the product. Queue with dnd-kit reorder + next-highlight; single field card wired to start/pause/extend/finish; quick-add with search/create; undo toasts.

Tasks:
- [ ] Queue list: dnd-kit wiring on `QueueRow`, optimistic reorder + revert on error; ⋯ menu (Sheet) with move top/bottom/replay/change-captains/remove
- [ ] Quick-add bar: Command search (≤300ms results), captain chips, create-and-add, duplicate hint
- [ ] Field card wiring incl. disabled-with-reason states + inline 409 errors
- [ ] Undo flow end-to-end (toast → `POST /actions/:id/undo` → snapshot)
- [ ] Empty states + session setup dialog (manager)

### 🛑 QA GATE 6 — **the product gate (PRD §18 success criteria measured here)**
- [ ] `auto` — Playwright timed: US-020 existing captain queued **<3s**, US-021 new captain **<5s** (scripted taps, asserted duration)
- [ ] `auto` — Playwright: US-030/031/032 (drag reorder syncs to 2nd context; remove + undo restores position), US-040-044 lifecycle
- [ ] `auto` — zero `Dialog` usages in live-flow components (grep gate)
- [ ] `manual` — **field trial dry-run**: run a fake evening on 2 real phones for 15 minutes — 10 matches, reorders, undos, a captain playing twice. Note every hesitation >3s.
- [ ] `manual` — 50 captains + 30 matches seeded: scroll + drag stays smooth on a mid-range Android
- [ ] `evidence` — timings table (3s/5s runs ×5 each) + dry-run friction notes → become Phase 7/8 fix list
- Gate closed: ____

---

## Phase 7 — Secondary screens: history, summary, activity, staff admin

Tasks:
- [ ] History screen + `SessionSummary` header (US-070/073), searchable by captain
- [ ] Activity feed (US-072, auto-updating)
- [ ] `CaptainSheet` bottom sheet — long-press any captain row: nickname, tags, private note, totals, inline edit (US-023 / F11)
- [ ] Settings + staff admin (manager-only, guard-verified from Phase 2 matrix)
- [ ] Fix list from Gate 6 dry-run

### 🛑 QA GATE 7
- [ ] `auto` — Playwright: US-023/070/071/072/073/080 incl. staff-role gets 403 view on admin; private note edited in CaptainSheet persists and appears on next open
- [ ] `manual` — close a session on the phone → summary matches the evening you just ran; reopen history 
      for a past date
- [ ] `evidence` — summary screenshot vs. hand-tallied numbers
- Gate closed: ____

---

## Phase 8 — PWA + performance + production hardening

Tasks:
- [ ] `vite-plugin-pwa`: manifest (standalone, portrait, Hebrew name, maskable icons), SW app-shell-only precache, update toast
- [ ] Wake Lock while match live (+ settings toggle)
- [ ] 00:00 sound/vibration (with silent-mode + iOS fallbacks)
- [ ] Perf pass to budgets (client-prd §9): bundle ≤250KB gzip, code-split secondary screens
- [ ] Security sweep: helmet/CORS/cookie flags re-verified, `pnpm audit` clean (R-24), rate limits documented per endpoint (R-25)

### 🛑 QA GATE 8
- [ ] `auto` — Lighthouse CI (simulated 4G, moto-class): LCP ≤2.5s, INP ≤200ms, CLS ≤0.1; PWA installable
- [ ] `auto` — `pnpm audit` no high/critical
- [ ] `manual` — install to home screen on iOS Safari + Android Chrome; standalone launch; lock phone 3 min during live match → wake shows correct time ±1s; SW update toast appears on redeploy
- [ ] `manual` — on installed Android PWA, switch History → Activity → Settings; one system Back returns directly to Main in the same field, Forward restores Settings, and Back from Main remains native (US-074)
- [ ] `evidence` — Lighthouse report JSON + install screenshots both platforms
- Gate closed: ____

---

## Phase 9 — E2E hardening, pre-prod review, Railway launch

Tasks:
- [ ] Full E2E regression suite tagged by US-ID; flake policy active (N-19)
- [ ] `/pre-prod-review` (4 audits: security, bugs, data, frontend) — findings triaged, blockers fixed
- [ ] Railway: 3 services, `DATABASE_URL` ref, `drizzle-kit migrate` pre-deploy, health checks, domains + CORS/cookie origin
- [ ] Staging smoke on Railway URL, then production cutover
- [ ] Seed real center + staff PINs (delivered out-of-band, never committed — R-20)

### 🛑 QA GATE 9 — LAUNCH GATE
- [ ] `auto` — full CI (lint, typecheck, unit, integration, E2E) green on the release commit
- [ ] `auto` — staging: `/health` OK; socket handshake from production web origin OK
- [ ] `manual` — pre-prod-review findings: zero unresolved critical/high
- [ ] `manual` — **real evening at the youth center with 2 staff phones** (the only QA that matters). Success = PRD §18: <3s/<5s met live, nobody leaves the main screen, no popup complaints
- [ ] `evidence` — launch-night notes → backlog for post-MVP round
- Gate closed: ____

---

## Status tracker

| Phase | Scope | Status |
|---|---|---|
| W0 | Design system, tokens, 11 shared components, 22 tests, showcase | ✅ done 2026-07-10 (evidence: tests green, build 83KB gzip, phone-size render verified) |
| 0 | git + CI baseline | ✅ done 2026-07-10 (commits c5f0ac7..d411569, CI run 29088702420 green, clean-clone verified) |
| 1 | shared contracts | ✅ done 2026-07-10 (da68cab..40a900c, 27 tests, review clean) |
| 2 | API foundation + auth | ✅ done 2026-07-10 (11478bd..fa75699, 74 api tests, auth cov 98.92%, 2 Criticals caught by review) |
| 5a | web foundations (early start) | ✅ merged 2026-07-10 (581c699..9ee5315, 37 new web tests — api client, clock offset, countdown, socket, auth screens) |
| 3 | API domain | ⬜ |
| 4 | realtime | ⬜ |
| 5 | web shell + auth | ⬜ |
| 6 | main screen (product gate) | ⬜ |
| 7 | secondary screens | ⬜ |
| 8 | PWA + perf | ⬜ |
| 9 | launch | ⬜ |

**Sequencing notes:** Phases are strictly ordered except: Phase 5 can start once Phase 4's snapshot shape is stable (Gate 4 `auto` items green) even if its manual items are pending; Phase 8 icon/manifest work can run parallel to Phase 7. Nothing skips a closed gate.
