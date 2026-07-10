# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Football Match Queue Manager** — mobile-first RTL-Hebrew PWA for youth-center staff running live football queues. Captains (team leaders) only are tracked, never individual players. **The queue is the hero surface — the match timer is a status readout, never the centerpiece.** Single center, single field/court at MVP (schema is multi-center and multi-field ready).

Authoritative specs (read before feature work):
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

## Hard rules (from devRules.md as adapted in technical-prd §12)

- **TDD**: failing test first for all domain logic and new components. A failing test is frozen — fix the implementation, never the test.
- **TypeScript max-strict**: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **i18n**: zero hardcoded user-facing strings — everything through `src/i18n/he.json` + typed `t()`. Missing key = compile error.
- **RTL**: logical properties only (`ms-*/me-*/ps-*/pe-*`, `start/end`); `ml/mr/left/right` are forbidden. Times/numbers LTR-isolated (`<bdi>`/`dir="ltr"`) with `tabular-nums`.
- **Tokens**: components consume semantic Tailwind utilities (`bg-surface`, `text-accent`) and component tokens (`--btn-height-big`) — a hex value in a component file is a bug.
- **UX**: no blocking popups in live flows — undo toasts, disabled-with-reason, inline errors. Touch targets ≥44px; primary actions 60px.
- **No console.log** in production code; typed domain errors, fail-closed guards (when the API exists).

## Component conventions

Shared components live in `apps/web/src/components/` (ui primitives in `ui/`), are presentational (server snapshot is the only state source), state their single responsibility in a JSDoc header, and get behavior unit tests (Testing Library, jsdom) — assert variants/callbacks/derived states, never markup snapshots.
