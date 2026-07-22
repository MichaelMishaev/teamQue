# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

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
pnpm install          # workspace root
pnpm dev              # component showcase at apps/web (Vite dev server)
pnpm test             # vitest run (unit + component tests)
pnpm typecheck        # strict tsc
pnpm build            # tsc -b && vite build
# single test file:
pnpm --filter web vitest run src/lib/time.test.ts
```

## Architecture

pnpm monorepo: `apps/web` (Vite + React 19 + Tailwind v4, shadcn-style components) exists; `apps/api` (NestJS + Socket.IO + Drizzle + Railway Postgres) and `packages/shared` (zod contracts) are planned per the technical PRD. Realtime = full-session snapshot broadcast after every mutation; clients are dumb renderers. Timers are **computed, never ticked** — server stores `started_at`/`planned_duration_sec`/`accumulated_pause_sec`; remaining time is a pure function (`apps/web/src/lib/time.ts`).

## Critical paths (devRules tier classification)

A diff touching **any** of these globs makes the **whole change critical** — Codex authors the failing test (the implementer does not), the test is frozen, and the adversarial verdict is the merge gate, not green CI. Unsure → critical.

```
apps/api/src/queue/**        # races — position renumbering under the per-session advisory lock
apps/api/src/matches/**      # races — kickoff pairs two queue_entries into one match, exactly-one-wins
apps/api/src/actions/**      # irreversible — undo/replay state transitions
apps/api/src/auth/**         # auth — guards, manager-only routes, staff PIN
apps/api/src/db/schema.ts    # irreversible — schema
apps/api/drizzle/**          # irreversible — migrations
```

Everything else is **standard** (the fast path): `apps/web/**`, `packages/shared/**`, and the remaining api modules (`staff`, `captains`, `sessions`, `activity`, `reads`, `realtime`).

Not critical here, deliberately: **money** (no billing surface exists) and **data isolation** (single center / single field at MVP). Both flip to critical the day they gain a real surface.

## Hard rules (baseline `~/Desktop/devRules.md`; project additions in technical-prd §12)

- **Tests**: a failing test is frozen — fix the implementation, never the test. Every bug gets a regression test before it's closed. Standard paths: test what's worth testing, no test-first mandate, no coverage gates. Critical paths (above): failing test first, authored by Codex, plus N-parallel concurrent-attempt tests on any line mutation.
- **TypeScript max-strict**: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **i18n**: zero hardcoded user-facing strings — everything through `src/i18n/he.json` + typed `t()`. Missing key = compile error.
- **RTL**: logical properties only (`ms-*/me-*/ps-*/pe-*`, `start/end`); `ml/mr/left/right` are forbidden. Times/numbers LTR-isolated (`<bdi>`/`dir="ltr"`) with `tabular-nums`.
- **Tokens**: components consume semantic Tailwind utilities (`bg-surface`, `text-accent`) and component tokens (`--btn-height-big`) — a hex value in a component file is a bug.
- **UX**: no blocking popups in live flows — undo toasts, disabled-with-reason, inline errors. Touch targets ≥44px; primary actions 60px.
- **No console.log** in production code; typed domain errors, fail-closed guards (when the API exists).

## Component conventions

Shared components live in `apps/web/src/components/` (ui primitives in `ui/`), are presentational (server snapshot is the only state source), state their single responsibility in a JSDoc header, and get behavior unit tests (Testing Library, jsdom) — assert variants/callbacks/derived states, never markup snapshots.
