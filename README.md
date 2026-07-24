# teamQue

Queue-first football match management for youth centers.

teamQue is a mobile-first, Hebrew RTL PWA for staff who run a live football court. It tracks captains—not individual players—keeps the queue synchronized across devices, and gives players a separate read-only view they can open from a QR code.

[Open the live app](https://gate.netanya.club/) · [Open the read-only player line](https://gate.netanya.club/line)

## Highlights

- **Queue-first workflow** — add captains quickly, pair the next teams, reorder the line, and see estimated waiting time.
- **Live match control** — start, pause, resume, extend, finish, replay, and recover supported actions safely.
- **Realtime synchronization** — every mutation broadcasts a fresh session snapshot over Socket.IO.
- **Resilient timers** — match time is computed from server timestamps instead of relying on a browser interval.
- **Read-only player PWA** — `/line` shows the active match, upcoming pairs, games until play, and estimated time without exposing staff controls.
- **History and operations** — session history, summaries, staff-attributed activity, safe exception records, and correlation IDs.
- **Mobile and RTL by design** — Hebrew copy, logical RTL layout, accessible touch targets, and installable PWA assets.

## App surfaces

| Route | Audience | Purpose |
|---|---|---|
| `/` | Staff | Browse active courts and create a court |
| `/f/:slug` | Staff | Operate a court, its live match, and its queue |
| `/line` | Players and families | Anonymous, read-only view for the Independence Square court |
| `/health` | Operations | API and database health check |

The player surface is intentionally isolated: it mounts without the staff provider stack and contains no path back to management actions.

## Architecture

```mermaid
flowchart LR
    Staff["Staff PWA<br/>React 19"] -->|REST + Socket.IO| API["NestJS 11 API"]
    Players["Read-only /line PWA"] -->|GET + live snapshots| API
    API -->|Drizzle ORM| DB[(PostgreSQL)]
```

The production Docker image builds the shared contracts, web app, and API. NestJS serves the compiled SPA and Socket.IO from the same Railway service; Railway Postgres stores operational state.

```text
apps/
  api/       NestJS API, Socket.IO, Drizzle, migrations
  web/       React, Vite, Tailwind CSS, installable PWA
packages/
  shared/    Zod contracts and shared TypeScript types
docs/
  plans/     Phased delivery and QA gates
  prds/      Product, client, and technical requirements
```

## Tech stack

- TypeScript with strict compiler settings
- React 19, Vite 7, Tailwind CSS 4
- NestJS 11, Socket.IO
- PostgreSQL and Drizzle ORM
- Zod shared contracts
- Vitest, Testing Library, Supertest, and Testcontainers
- pnpm workspaces
- Railway and Docker

## Local development

### Prerequisites

- Node.js 22+
- pnpm 10.33.2 through Corepack
- PostgreSQL
- Docker when running the API integration suite

### Install

```bash
corepack enable
pnpm install
```

### Run the UI with demo data

```bash
VITE_DEMO=1 pnpm dev
```

The web app starts on [http://localhost:5179](http://localhost:5179).

### Run the full stack

Set the API environment in one terminal:

```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/teamque"
export SESSION_SECRET="replace-with-at-least-32-characters"
export WEB_ORIGIN="http://localhost:5179"

pnpm --filter api db:migrate
pnpm --filter api dev
```

Then start the web app in another terminal:

```bash
pnpm dev
```

The web client uses `http://localhost:3001` as its default local API URL. Override it with `VITE_API_URL` when needed.

### Environment variables

| Variable | Required | Description |
|---|---:|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Session signing secret, at least 32 characters |
| `WEB_ORIGIN` | Yes | Allowed credentialed web origin |
| `PORT` | No | API port; defaults to `3001` |
| `NODE_ENV` | No | `development`, `test`, or `production` |
| `PUBLIC_LINE_HOST` | No | Restricts a dedicated public hostname to the read-only `/line` surface |
| `VITE_API_URL` | No | Web client API base URL; defaults locally to `http://localhost:3001` |
| `VITE_DEMO` | No | Set to `1` to run the UI with in-memory demo providers |

Do not commit local environment files or production credentials.

## Quality gates

```bash
pnpm test
pnpm typecheck
pnpm build
```

Run one focused web test:

```bash
pnpm --filter web exec vitest run src/lib/time.test.ts
```

Database-backed API tests use Testcontainers and therefore require Docker.

## Product rules

- Captains are tracked; individual players and rosters are not.
- The queue is the primary operational surface; the timer is a status readout.
- The server snapshot is the source of truth for clients.
- Timers are computed, never stored as ticking counters.
- User-facing copy lives in the typed Hebrew locale.
- Queue mutations and irreversible actions follow the repository’s critical-path test rules.

## Documentation

- [MVP development plan](docs/plans/2026-07-10-mvp-development-plan.md)
- [Feature requirements](docs/prds/features-prd.md)
- [Client requirements](docs/prds/client-prd.md)
- [Technical architecture](docs/prds/technical-prd.md)
- [Design system](design.md)

## Deployment

Railway builds the checked-in [`Dockerfile`](Dockerfile), runs Drizzle migrations before deployment, and starts the NestJS service. The API serves the web build and exposes `/health` for production verification.

This repository does not currently declare an open-source license.
