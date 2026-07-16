# Open Fields Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the app to an open "go" product: anyone (no login) creates a **field** with a shareable `/f/:slug` URL, fields run concurrently with per-field queues, a public home screen lists active fields, and stale fields auto-expire after 18h of inactivity.

**Architecture:** Spec `docs/superpowers/specs/2026-07-16-open-fields-design.md`, Approach A — each user-facing field IS one backend `sessions` row (plus its single auto-created child `fields` row). The entire per-session engine (queue advisory locks, one-live-match index, computed timers, undo, activity log, snapshot broadcast, socket rooms) is reused untouched.

**Three spec amendments locked in by this plan** (implementation-reality driven, spec updated to match):
1. **Visitors are `staff` rows with `role: 'visitor'`** — not a parallel `visitors` table. The visitor cookie reuses the existing `qlm_session` JWT (`{staffId, centerId, role}`) with a 365-day TTL, so `StaffSessionGuard`, every service signature (`staffId` params), activity attribution, and history name joins work with **zero changes**. Roster endpoints filter visitors out.
2. **No hard 401 on cookieless mutations.** `StaffSessionGuard` already falls back to the seeded manager (auth was opened in a prior change). The nickname sheet is enforced client-side before the first mutation; the guard fallback stays as the server-side behavior. The entire existing integration suite stays valid.
3. **`lastActivityAt` is touched inside `SessionEventsService.broadcast`** — the single post-commit choke point every mutating service already calls — instead of threading a new param through ~12 service methods.

**Tech Stack:** NestJS 11 + Drizzle + Postgres (Testcontainers for integration), Socket.IO, Vite + React 19 + Tailwind v4, zod contracts in `packages/shared`, Vitest + Testing Library.

## Global Constraints

- TDD: failing test first for all domain logic and new components; a failing test is frozen — fix the implementation, never the test.
- TypeScript max-strict: no `any`, no non-null `!`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- i18n: zero hardcoded user-facing strings — everything via `apps/web/src/i18n/he.json` + typed `t()`.
- RTL: logical properties only (`ms-*/me-*/ps-*/pe-*`, `start/end`); times/numbers LTR-isolated (`<bdi>`/`dir="ltr"`) with `tabular-nums`.
- Tokens: semantic Tailwind utilities only; a hex value in a component file is a bug.
- No `console.*` in production code; typed domain errors; guards fail closed.
- Commits: conventional commits, explicit paths (never `git add .`), footer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` per user's global CLAUDE.md.
- Build order: `shared` → `web`/`api`. After editing `packages/shared`, run `pnpm --filter shared build` before api/web typechecks.
- Integration tests need Docker running (Testcontainers). `pnpm --filter api vitest run src` = unit only; `pnpm --filter api vitest run` = unit + integration.
- E2E (Playwright) infra does not exist yet (lands in MVP Phase 9) — this plan ships unit + integration + component tests plus a manual verification task.

---

### Task 1: Shared contracts — visitor role, field schemas, slug in snapshot

**Files:**
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/requests.ts`
- Modify: `packages/shared/src/reads.ts`
- Modify: `packages/shared/src/snapshot.ts`
- Test: `packages/shared/src/contracts.test.ts` (append)

**Interfaces:**
- Consumes: nothing new.
- Produces (used by every later task): `staffRoleSchema` includes `'visitor'`; `errorCodeSchema` includes `'FIELD_CLOSED'`; `createFieldSchema`/`CreateFieldBody = { name: string; matchDurationSec: number }`; `visitorHelloSchema`/`VisitorHelloBody = { nickname: string }`; `fieldListItemSchema`/`FieldListItem = { slug; name; createdAt; queueLength; hasLiveMatch }`; `sessionSnapshotSchema.session` gains `slug: string`.

- [ ] **Step 1: Write the failing tests** — append to `packages/shared/src/contracts.test.ts`:

```ts
describe('open-fields contracts', () => {
  it('staff role accepts visitor', () => {
    expect(staffRoleSchema.parse('visitor')).toBe('visitor')
  })

  it('error codes accept FIELD_CLOSED', () => {
    expect(errorCodeSchema.parse('FIELD_CLOSED')).toBe('FIELD_CLOSED')
  })

  it('createFieldSchema: valid body parses, bad duration rejected', () => {
    expect(createFieldSchema.parse({ name: 'מגרש בית ספר', matchDurationSec: 360 })).toEqual({
      name: 'מגרש בית ספר',
      matchDurationSec: 360,
    })
    expect(createFieldSchema.safeParse({ name: '', matchDurationSec: 360 }).success).toBe(false)
    expect(createFieldSchema.safeParse({ name: 'x', matchDurationSec: 30 }).success).toBe(false)
  })

  it('visitorHelloSchema: 1..30 chars', () => {
    expect(visitorHelloSchema.parse({ nickname: 'אורח 42' })).toEqual({ nickname: 'אורח 42' })
    expect(visitorHelloSchema.safeParse({ nickname: '' }).success).toBe(false)
    expect(visitorHelloSchema.safeParse({ nickname: 'x'.repeat(31) }).success).toBe(false)
  })

  it('fieldListItemSchema parses a list row', () => {
    expect(
      fieldListItemSchema.parse({
        slug: 'abc234',
        name: 'מגרש',
        createdAt: '2026-07-16T10:00:00.000Z',
        queueLength: 3,
        hasLiveMatch: true,
      }).slug,
    ).toBe('abc234')
  })

  it('snapshot session requires slug', () => {
    const base = validSnapshotFixture() // reuse/adapt the file's existing valid-snapshot helper; add slug: 'abc234' to it
    expect(sessionSnapshotSchema.parse(base).session.slug).toBe('abc234')
    const { slug: _omitted, ...withoutSlug } = base.session
    expect(sessionSnapshotSchema.safeParse({ ...base, session: withoutSlug }).success).toBe(false)
  })
})
```

Add the new names to the test file's existing `import ... from './index.js'` (or per-file) imports. If the file has no `validSnapshotFixture` helper, adapt the test to clone whatever valid-snapshot literal the file already uses and add `slug: 'abc234'` to its `session`.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter shared vitest run src/contracts.test.ts`
Expected: FAIL — `createFieldSchema` etc. not exported; snapshot slug test fails.

- [ ] **Step 3: Implement.**

`packages/shared/src/enums.ts` — change one line:

```ts
export const staffRoleSchema = z.enum(['manager', 'staff', 'visitor'])
```

`packages/shared/src/errors.ts` — add `'FIELD_CLOSED',` to the `errorCodeSchema` list (after `'SESSION_HAS_LIVE_MATCH',`).

`packages/shared/src/requests.ts` — append:

```ts
/** Open-fields pivot: anyone creates a field (backed 1:1 by a session). */
export const createFieldSchema = z.object({
  name: z.string().min(1).max(40),
  matchDurationSec: z.number().int().min(60).max(3600),
})
export type CreateFieldBody = z.infer<typeof createFieldSchema>

/** First-mutation identity: a visitor picks a nickname, gets a cookie. */
export const visitorHelloSchema = z.object({
  nickname: z.string().min(1).max(30),
})
export type VisitorHelloBody = z.infer<typeof visitorHelloSchema>
```

`packages/shared/src/reads.ts` — append:

```ts
/** GET /fields row shape — one active public field. */
export const fieldListItemSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(40),
  createdAt: z.iso.datetime(),
  queueLength: z.number().int().min(0),
  hasLiveMatch: z.boolean(),
})
export type FieldListItem = z.infer<typeof fieldListItemSchema>
```

`packages/shared/src/snapshot.ts` — add `slug: z.string().min(1),` inside the `session: z.object({...})` block (after `id`).

Check `packages/shared/src/index.ts`: these files are barrel-exported with `export *`, so new exports flow automatically; if any file is missing from the barrel, add it.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter shared vitest run && pnpm --filter shared build`
Expected: PASS, build green. Note: `apps/api` will now FAIL typecheck (snapshot builder missing `slug`) — expected; Task 2/4 fix it. Do not "fix" by reverting.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/enums.ts packages/shared/src/errors.ts packages/shared/src/requests.ts packages/shared/src/reads.ts packages/shared/src/snapshot.ts packages/shared/src/contracts.test.ts
git commit -m "feat(shared): open-fields contracts — visitor role, field create/list schemas, snapshot slug"
```

---

### Task 2: DB schema + migration — slug, lastActivityAt, many concurrent fields

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/0002_*.sql` (via `db:generate`, then hand-edit)
- Modify: `apps/api/src/sessions/sessions.service.ts` (temporary slug for legacy route; see Step 3)
- Test: `apps/api/test/*.test.ts` — the integration test asserting a second open → 409

**Interfaces:**
- Consumes: `staffRoleSchema` now containing `'visitor'` (Task 1) — the pgEnum picks it up automatically.
- Produces: `sessions.slug` (`text`, NOT NULL, unique index `sessions_slug_unique`), `sessions.lastActivityAt` (`timestamptz`, NOT NULL, default now), **no** `one_active_session` index. Column types other tasks rely on: `sessions.$inferSelect` gains `slug: string; lastActivityAt: Date`.

- [ ] **Step 1: Write the failing integration test** — append to the integration file that covers session open (find it: `grep -rln "SESSION_ALREADY_ACTIVE" apps/api/test/`):

```ts
it('allows two active sessions concurrently (open-fields pivot)', async () => {
  const first = await openSession() // reuse the file's existing open-session helper/request
  const second = await openSession()
  expect(first.status).toBe(201)
  expect(second.status).toBe(201) // was 409 SESSION_ALREADY_ACTIVE before the pivot
})
```

In the SAME file, the old expectation `second open → 409 SESSION_ALREADY_ACTIVE` is now obsolete **behavior removed on purpose by the approved spec** — delete that single test case (this is a deliberate product change, not a frozen-test violation; cite the spec in the commit message).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api vitest run test` (Docker must be running)
Expected: new test FAILS (second open → 409).

- [ ] **Step 3: Edit `apps/api/src/db/schema.ts`** — in the `sessions` table:

```ts
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    centerId: uuid('center_id')
      .notNull()
      .references(() => centers.id),
    date: date('date').notNull(),
    location: text('location'),
    // Open-fields pivot: a session row IS the backing store for a public
    // "field" (docs/superpowers/specs/2026-07-16-open-fields-design.md).
    // `slug` is its share-URL code; `lastActivityAt` drives auto-expiry.
    slug: text('slug').notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    matchDurationSec: integer('match_duration_sec').notNull(),
    status: sessionStatusEnum('status').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => staff.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('sessions_slug_unique').on(table.slug)],
)
```

(The `one_active_session` index entry is deleted.)

Then make the legacy open route satisfy NOT NULL slug — in `apps/api/src/sessions/sessions.service.ts`:
- Remove the now-dead `SessionAlreadyActiveError` catch: delete the `try/catch` wrapper in `open()` (keep its body), the `ONE_ACTIVE_SESSION_CONSTRAINT` const, the `isUniqueViolation`/`hasCause` helpers, and the unused import of `SessionAlreadyActiveError`.
- In `open()`'s insert values, add `slug: generateSlug(),` importing `{ generateSlug }` from `'../fields/slug'` — **Task 3 creates that module; implement Tasks 2 and 3 in one working session and run the gate below after both** (Task 3 has no dependency on this task, so do Task 3's TDD cycle first if you prefer green-at-every-commit).

- [ ] **Step 4: Generate + hand-edit the migration**

Run: `pnpm --filter api db:generate`
Expected: new file `apps/api/drizzle/0002_<name>.sql` containing `ALTER TYPE "staff_role" ADD VALUE 'visitor';`, `ALTER TABLE "sessions" ADD COLUMN "slug" text NOT NULL;`, `ADD COLUMN "last_activity_at" ...`, `DROP INDEX "one_active_session";`, `CREATE UNIQUE INDEX "sessions_slug_unique" ...`.

Hand-edit the generated SQL so the slug column lands on non-empty tables (NOT NULL with no default fails otherwise). Replace the single `ADD COLUMN "slug" text NOT NULL;` statement with:

```sql
ALTER TABLE "sessions" ADD COLUMN "slug" text;
UPDATE "sessions" SET "slug" = substr(md5(random()::text || id::text), 1, 6) WHERE "slug" IS NULL;
ALTER TABLE "sessions" ALTER COLUMN "slug" SET NOT NULL;
```

Keep every other generated statement as-is.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter api vitest run test`
Expected: PASS including the new two-active-sessions test (integration setup applies committed `drizzle/*.sql`, so the edited migration is exercised on a fresh DB).

- [ ] **Step 6: Commit** (after Task 3's commit if you did Task 3 first)

```bash
git add apps/api/src/db/schema.ts apps/api/drizzle apps/api/src/sessions/sessions.service.ts apps/api/test
git commit -m "feat(api): sessions gain slug + last_activity_at; allow concurrent active sessions (open-fields spec)"
```

---

### Task 3: Slug generator (pure, TDD)

**Files:**
- Create: `apps/api/src/fields/slug.ts`
- Test: `apps/api/src/fields/slug.test.ts`

**Interfaces:**
- Produces: `generateSlug(): string` — 6 chars from an unambiguous lowercase alphabet; `SLUG_PATTERN: RegExp` (`/^[a-z2-9]{6}$/` effective shape) used by route param validation (Task 4) and the web router (Task 9).

- [ ] **Step 1: Write the failing test** — `apps/api/src/fields/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { generateSlug, SLUG_PATTERN } from './slug'

describe('generateSlug', () => {
  it('returns 6 chars from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i += 1) {
      const slug = generateSlug()
      expect(slug).toMatch(SLUG_PATTERN)
      expect(slug).not.toMatch(/[01loi]/)
    }
  })

  it('is collision-unlikely across a small batch', () => {
    const batch = new Set(Array.from({ length: 1000 }, () => generateSlug()))
    expect(batch.size).toBeGreaterThan(990)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api vitest run src/fields/slug.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `apps/api/src/fields/slug.ts`:

```ts
/**
 * Share-URL slug for a public field (open-fields spec §3.1): 6 chars from an
 * unambiguous alphabet (no 0/1/o/l/i), crypto-random. Uniqueness is enforced
 * by the `sessions_slug_unique` index — callers retry on collision
 * (fields.service.ts), this function is just the candidate generator.
 */
import { randomInt } from 'node:crypto'

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const SLUG_LENGTH = 6

export const SLUG_PATTERN = new RegExp(`^[${ALPHABET}]{${SLUG_LENGTH}}$`)

export function generateSlug(): string {
  let slug = ''
  for (let i = 0; i < SLUG_LENGTH; i += 1) {
    slug += ALPHABET[randomInt(ALPHABET.length)] as string
  }
  return slug
}
```

(The `as string` cast absorbs `noUncheckedIndexedAccess` on a provably in-range index; if the project style forbids casts, use `ALPHABET.charAt(randomInt(ALPHABET.length))` which returns `string`.)
Prefer `charAt` — no cast, same behavior.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api vitest run src/fields/slug.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/fields/slug.ts apps/api/src/fields/slug.test.ts
git commit -m "feat(api): unambiguous 6-char slug generator for public field URLs"
```

---

### Task 4: Visitor identity — POST /visitors, GET /visitors/me, roster filter

**Files:**
- Modify: `apps/api/src/auth/token.ts`
- Create: `apps/api/src/visitors/visitors.controller.ts`
- Create: `apps/api/src/visitors/visitors.module.ts`
- Modify: `apps/api/src/staff/staff.controller.ts`
- Modify: `apps/api/src/app.module.ts` (import module + ServeStatic exclude)
- Test: `apps/api/test/visitors.int.test.ts`

**Interfaces:**
- Consumes: `visitorHelloSchema` (Task 1); `signSessionToken`-style JWT helpers; `StaffSessionGuard` fallback behavior (unchanged).
- Produces: `POST /visitors` `{ nickname }` → `201 { visitorId: string; nickname: string }` + sets `qlm_session` cookie (365d, role `'visitor'`); `GET /visitors/me` → `200 { visitorId; nickname }` when the caller's resolved identity is a visitor, `404 NOT_FOUND` otherwise. A visitor IS a `staff` row: `{ role: 'visitor', active: true, pinHash: VISITOR_PIN_SENTINEL }`.

- [ ] **Step 1: Write the failing integration test** — `apps/api/test/visitors.int.test.ts`, modeled on the setup/teardown pattern of the existing files in `apps/api/test/` (same Testcontainers bootstrap; copy the beforeAll/afterAll shape from the auth integration test):

```ts
it('POST /visitors creates a visitor identity and sets the session cookie', async () => {
  const res = await request(app.getHttpServer()).post('/visitors').send({ nickname: 'אורח 42' })
  expect(res.status).toBe(201)
  expect(res.body.nickname).toBe('אורח 42')
  expect(res.body.visitorId).toMatch(/^[0-9a-f-]{36}$/)
  const cookies = res.get('Set-Cookie') ?? []
  expect(cookies.some((c) => c.startsWith('qlm_session='))).toBe(true)
})

it('GET /visitors/me round-trips the cookie; 404 without one', async () => {
  const agent = request.agent(app.getHttpServer())
  await agent.post('/visitors').send({ nickname: 'דנה' }).expect(201)
  const me = await agent.get('/visitors/me').expect(200)
  expect(me.body.nickname).toBe('דנה')
  await request(app.getHttpServer()).get('/visitors/me').expect(404)
})

it('GET /staff excludes visitors', async () => {
  await request(app.getHttpServer()).post('/visitors').send({ nickname: 'זמני' }).expect(201)
  const res = await request(app.getHttpServer()).get('/staff').expect(200)
  expect(res.body.every((row: { role: string }) => row.role !== 'visitor')).toBe(true)
})

it('a visitor cookie attributes mutations (activity staffId = visitorId)', async () => {
  const agent = request.agent(app.getHttpServer())
  const hello = await agent.post('/visitors').send({ nickname: 'מאמן' }).expect(201)
  const open = await agent.post('/sessions').send({ matchDurationSec: 360 }).expect(201)
  const activity = await agent.get(`/activity?sessionId=${open.body.id}`).expect(200)
  expect(activity.body[0].staffId).toBe(hello.body.visitorId)
})
```

Note the fourth test also proves the guard accepts the visitor token on an existing route with zero guard changes. (`POST /sessions` is manager-only via RolesGuard — see Step 3 for the one-line RolesGuard note.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api vitest run test/visitors.int.test.ts`
Expected: FAIL — 404 on /visitors.

- [ ] **Step 3: Implement.**

`apps/api/src/auth/token.ts` — append:

```ts
const VISITOR_TOKEN_TTL = '365d'
export const VISITOR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/** Open-fields: visitors are long-lived identities in the SAME cookie/payload
 * shape as staff logins, so every existing guard verifies them unchanged. */
export function signVisitorToken(jwtService: JwtService, payload: SessionTokenPayload): string {
  return jwtService.sign(payload, { expiresIn: VISITOR_TOKEN_TTL })
}
```

`apps/api/src/visitors/visitors.controller.ts`:

```ts
/**
 * Open-fields visitor identity (spec §3.2). A visitor is a `staff` row with
 * role 'visitor' — reusing the staff FKs means attribution (activity log,
 * history startedBy/endedBy names) works with zero schema or service churn.
 * The cookie is the standard qlm_session JWT, just signed with a 365d TTL.
 */
import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Response } from 'express'
import { visitorHelloSchema, type VisitorHelloBody } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { SESSION_COOKIE_NAME, VISITOR_COOKIE_MAX_AGE_MS, cookieOptions, signVisitorToken } from '../auth/token'
import { NotFoundError } from '../common/errors'
import { ZodValidationPipe } from '../common/zod.pipe'
import { DRIZZLE, type Database } from '../db/db.module'
import { loadEnv } from '../config/env'
import { staff } from '../db/schema'

/** Never a valid argon2 hash, so this row can never pass PIN login. */
const VISITOR_PIN_SENTINEL = 'visitor-no-pin'

@Controller('visitors')
@UseGuards(StaffSessionGuard)
export class VisitorsController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  @Post()
  async hello(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(visitorHelloSchema)) body: VisitorHelloBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ visitorId: string; nickname: string }> {
    const [row] = await this.db
      .insert(staff)
      .values({
        centerId: req.centerId,
        name: body.nickname,
        role: 'visitor',
        pinHash: VISITOR_PIN_SENTINEL,
      })
      .returning({ id: staff.id, name: staff.name })
    if (!row) throw new Error('visitor insert returned no row')

    const token = signVisitorToken(this.jwtService, {
      staffId: row.id,
      centerId: req.centerId,
      role: 'visitor',
    })
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(VISITOR_COOKIE_MAX_AGE_MS, loadEnv().NODE_ENV))
    return { visitorId: row.id, nickname: row.name }
  }

  @Get('me')
  async me(@Req() req: StaffAuthenticatedRequest): Promise<{ visitorId: string; nickname: string }> {
    if (req.staff.role !== 'visitor') throw new NotFoundError('No visitor identity')
    const [row] = await this.db
      .select({ id: staff.id, name: staff.name })
      .from(staff)
      .where(eq(staff.id, req.staff.staffId))
      .limit(1)
    if (!row) throw new NotFoundError('No visitor identity')
    return { visitorId: row.id, nickname: row.name }
  }
}
```

(Add `import { eq } from 'drizzle-orm'`. Check `loadEnv()`'s exact NODE_ENV field name against `apps/api/src/config/env.ts` and mirror how `auth.controller.ts` builds `cookieOptions` — copy its exact call shape.)

`apps/api/src/visitors/visitors.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VisitorsController } from './visitors.controller'

@Module({
  imports: [AuthModule],
  controllers: [VisitorsController],
})
export class VisitorsModule {}
```

`apps/api/src/staff/staff.controller.ts` — exclude visitors from the roster: add `ne` to the drizzle import and extend the where clause:

```ts
.where(and(eq(staff.centerId, req.centerId), eq(staff.active, true), ne(staff.role, 'visitor')))
```

`apps/api/src/app.module.ts` — add `VisitorsModule` to imports and `'/visitors/{*path}'` to the ServeStatic `exclude` list.

**RolesGuard note for the 4th test:** `POST /sessions` requires `@Roles('manager')`. Open-fields makes creation public, so change `apps/api/src/sessions/sessions.controller.ts`: remove `@UseGuards(RolesGuard)` + `@Roles('manager')` from `open`, `update`, and `close` (the whole app is open per spec; the decorators' imports become unused — remove them). The permission-matrix test that asserts 403s for staff on these routes must be updated: those three routes are now open to any resolved identity — update the matrix rows' expected status to the success/409 path (deliberate spec change; cite the spec in the commit).

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api vitest run test/visitors.int.test.ts && pnpm --filter api vitest run`
Expected: new file PASS; full api suite green except any test asserting manager-only 403 on sessions routes — update those per the note above, then green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/token.ts apps/api/src/visitors apps/api/src/staff/staff.controller.ts apps/api/src/sessions/sessions.controller.ts apps/api/src/app.module.ts apps/api/test
git commit -m "feat(api): visitor identity — nickname cookie, visitors-as-staff-rows, open session routes"
```

---

### Task 5: Fields API — create / list / resolve / force-close by slug

**Files:**
- Create: `apps/api/src/fields/errors.ts`
- Create: `apps/api/src/fields/fields.service.ts`
- Create: `apps/api/src/fields/fields.controller.ts`
- Create: `apps/api/src/fields/fields.module.ts`
- Modify: `apps/api/src/sessions/snapshot.service.ts` (slug into snapshot)
- Modify: `apps/api/src/app.module.ts` (module + exclude `'/fields/{*path}'`)
- Test: `apps/api/test/fields.int.test.ts`

**Interfaces:**
- Consumes: `generateSlug`/`SLUG_PATTERN` (Task 3), `createFieldSchema`/`fieldListItemSchema` (Task 1), `SnapshotService.buildSnapshotBySessionId(sessionId)`, `SessionEventsService.broadcast(sessionId)`, `ActivityWriter.write(tx, entry)`, `lockSessionLine(tx, sessionId)`.
- Produces: `POST /fields` → `201 { slug, snapshot }`; `GET /fields` → `FieldListItem[]`; `GET /fields/:slug` → `SessionSnapshot` (404 unknown slug; closed fields still return their snapshot — the client renders the closed screen from `session.status`); `POST /fields/:slug/close` → `200 { slug, status: 'closed' }`, idempotent, force-cancels live/paused matches. Service methods other tasks use: `FieldsService.forceClose(sessionId, actorStaffId)` (Task 6 reuses it).

- [ ] **Step 1: Write the failing integration test** — `apps/api/test/fields.int.test.ts` (same bootstrap pattern as the other `test/` files):

```ts
it('POST /fields creates a field: snapshot has the slug, the named field, empty queue', async () => {
  const res = await request(app.getHttpServer()).post('/fields').send({ name: 'מגרש בית ספר', matchDurationSec: 360 }).expect(201)
  expect(res.body.slug).toMatch(/^[a-z2-9]{6}$/)
  expect(res.body.snapshot.session.slug).toBe(res.body.slug)
  expect(res.body.snapshot.fields[0].name).toBe('מגרש בית ספר')
  expect(res.body.snapshot.queue).toEqual([])
})

it('GET /fields lists active fields newest-first with queue length + live flag', async () => {
  const a = await request(app.getHttpServer()).post('/fields').send({ name: 'א', matchDurationSec: 300 }).expect(201)
  const b = await request(app.getHttpServer()).post('/fields').send({ name: 'ב', matchDurationSec: 300 }).expect(201)
  const list = await request(app.getHttpServer()).get('/fields').expect(200)
  const slugs = list.body.map((row: { slug: string }) => row.slug)
  expect(slugs.indexOf(b.body.slug)).toBeLessThan(slugs.indexOf(a.body.slug))
  expect(list.body[0]).toMatchObject({ queueLength: 0, hasLiveMatch: false })
})

it('GET /fields/:slug resolves; unknown slug 404s', async () => {
  const created = await request(app.getHttpServer()).post('/fields').send({ name: 'ג', matchDurationSec: 300 }).expect(201)
  const snap = await request(app.getHttpServer()).get(`/fields/${created.body.slug}`).expect(200)
  expect(snap.body.session.id).toBe(created.body.snapshot.session.id)
  await request(app.getHttpServer()).get('/fields/zzzzzz').expect(404)
})

it('POST /fields/:slug/close force-closes even with a live match, idempotently, and drops it from the list', async () => {
  const created = await request(app.getHttpServer()).post('/fields').send({ name: 'ד', matchDurationSec: 300 }).expect(201)
  const sessionId = created.body.snapshot.session.id
  // build a live match through the existing line + start routes
  await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).send({ team: { newName: 'קבוצה 1' } }).expect(201)
  await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).send({ team: { newName: 'קבוצה 2' } }).expect(201)
  await request(app.getHttpServer()).post(`/sessions/${sessionId}/start`).send({}).expect(201)
  await request(app.getHttpServer()).post(`/fields/${created.body.slug}/close`).expect(200)
  await request(app.getHttpServer()).post(`/fields/${created.body.slug}/close`).expect(200) // idempotent
  const list = await request(app.getHttpServer()).get('/fields').expect(200)
  expect(list.body.map((row: { slug: string }) => row.slug)).not.toContain(created.body.slug)
  const snap = await request(app.getHttpServer()).get(`/fields/${created.body.slug}`).expect(200)
  expect(snap.body.session.status).toBe('closed')
})
```

(Verify the exact line/start route paths + expected status codes against `line.controller.ts` / `start.controller.ts` before finalizing the test — the paths above follow `POST /sessions/:id/line` and `POST /sessions/:id/start` from the codebase.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api vitest run test/fields.int.test.ts`
Expected: FAIL — 404 on /fields.

- [ ] **Step 3: Implement.**

`apps/api/src/fields/errors.ts`:

```ts
/** Open-fields domain errors (spec §6). */
import { DomainError } from '../common/domain-error'

/** Mutation on a closed field. */
export class FieldClosedError extends DomainError {
  readonly code = 'FIELD_CLOSED' as const
  readonly httpStatus = 409

  constructor(message = 'Field is closed') {
    super(message)
  }
}
```

`apps/api/src/fields/fields.service.ts`:

```ts
/**
 * Open-fields service (spec §3/§4): a public "field" is one sessions row +
 * its single child fields row. create() retries slug collisions against the
 * sessions_slug_unique index; forceClose() is close-regardless — it cancels
 * live/paused matches first (public fields have no owner to wait for), then
 * reuses the same clear-line + close shape as SessionsService.close.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import type { CreateFieldBody, FieldListItem, SessionSnapshot } from 'shared'
import { ActivityWriter } from '../activity/activity.writer'
import { NotFoundError } from '../common/errors'
import { lockSessionLine } from '../common/session-lock'
import { DRIZZLE, type Database } from '../db/db.module'
import { fields, matches, queueEntries, sessions } from '../db/schema'
import { SessionEventsService } from '../realtime/session-events.service'
import { SnapshotService } from '../sessions/snapshot.service'
import { todayInJerusalem } from '../sessions/date'
import { generateSlug } from './slug'

const SLUG_UNIQUE_CONSTRAINT = 'sessions_slug_unique'
const CREATE_RETRIES = 3

@Injectable()
export class FieldsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(ActivityWriter) private readonly activity: ActivityWriter,
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
    @Inject(SessionEventsService) private readonly sessionEvents: SessionEventsService,
  ) {}

  async create(centerId: string, staffId: string, body: CreateFieldBody): Promise<{ slug: string; snapshot: SessionSnapshot }> {
    let lastError: unknown = null
    for (let attempt = 0; attempt < CREATE_RETRIES; attempt += 1) {
      const slug = generateSlug()
      try {
        const session = await this.db.transaction(async (tx) => {
          const [row] = await tx
            .insert(sessions)
            .values({
              centerId,
              date: todayInJerusalem(),
              location: null,
              slug,
              matchDurationSec: body.matchDurationSec,
              status: 'active',
              createdBy: staffId,
            })
            .returning()
          if (!row) throw new Error('session insert returned no row')

          await tx.insert(fields).values({ sessionId: row.id, centerId, name: body.name, position: 0 })

          await this.activity.write(tx, {
            centerId,
            sessionId: row.id,
            staffId,
            action: 'field.created',
            entityType: 'session',
            entityId: row.id,
            afterJson: row,
          })
          return row
        })

        await this.sessionEvents.broadcast(session.id)
        return { slug, snapshot: await this.snapshotService.buildSnapshotBySessionId(session.id) }
      } catch (error) {
        if (!isSlugCollision(error)) throw error
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('slug generation exhausted retries')
  }

  async list(centerId: string): Promise<FieldListItem[]> {
    const rows = await this.db
      .select({
        slug: sessions.slug,
        createdAt: sessions.createdAt,
        name: fields.name,
        queueLength: sql<number>`(SELECT count(*) FROM ${queueEntries} WHERE ${queueEntries.sessionId} = ${sessions.id})::int`,
        hasLiveMatch: sql<boolean>`EXISTS (SELECT 1 FROM ${matches} WHERE ${matches.sessionId} = ${sessions.id} AND ${matches.status} IN ('live','paused'))`,
      })
      .from(sessions)
      .innerJoin(fields, eq(fields.sessionId, sessions.id))
      .where(and(eq(sessions.centerId, centerId), eq(sessions.status, 'active'), eq(fields.position, 0)))
      .orderBy(desc(sessions.createdAt))

    return rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      queueLength: Number(row.queueLength),
      hasLiveMatch: row.hasLiveMatch,
    }))
  }

  async resolve(slug: string): Promise<SessionSnapshot> {
    const sessionId = await this.sessionIdBySlug(slug)
    return this.snapshotService.buildSnapshotBySessionId(sessionId)
  }

  async closeBySlug(slug: string, staffId: string): Promise<{ slug: string; status: 'closed' }> {
    const sessionId = await this.sessionIdBySlug(slug)
    await this.forceClose(sessionId, staffId)
    return { slug, status: 'closed' }
  }

  /** Close regardless of live matches. Idempotent: already-closed → no-op.
   * Also the expiry sweep's workhorse (expiry.service.ts). */
  async forceClose(sessionId: string, staffId: string): Promise<void> {
    const didClose = await this.db.transaction(async (tx) => {
      await lockSessionLine(tx, sessionId)

      const [session] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1)
      if (!session || session.status === 'closed') return false

      const stopped = await tx
        .update(matches)
        .set({ status: 'cancelled', endReason: 'cancelled', endedAt: new Date(), endedBy: staffId })
        .where(and(eq(matches.sessionId, sessionId), inArray(matches.status, ['live', 'paused', 'queued'])))
        .returning({ id: matches.id })

      for (const match of stopped) {
        await this.activity.write(tx, {
          centerId: session.centerId,
          sessionId,
          staffId,
          action: 'match.cancelled',
          entityType: 'match',
          entityId: match.id,
        })
      }

      const cleared = await tx.delete(queueEntries).where(eq(queueEntries.sessionId, sessionId)).returning({ id: queueEntries.id })
      if (cleared.length > 0) {
        await this.activity.write(tx, {
          centerId: session.centerId,
          sessionId,
          staffId,
          action: 'line.cleared',
          entityType: 'session',
          entityId: sessionId,
          beforeJson: { queueEntryIds: cleared.map((entry) => entry.id) },
        })
      }

      await tx.update(sessions).set({ status: 'closed' }).where(eq(sessions.id, sessionId))
      await this.activity.write(tx, {
        centerId: session.centerId,
        sessionId,
        staffId,
        action: 'field.closed',
        entityType: 'session',
        entityId: sessionId,
      })
      return true
    })

    if (didClose) await this.sessionEvents.broadcast(sessionId)
  }

  private async sessionIdBySlug(slug: string): Promise<string> {
    const [row] = await this.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.slug, slug)).limit(1)
    if (!row) throw new NotFoundError('Field not found')
    return row.id
  }
}

function isSlugCollision(error: unknown): boolean {
  const candidates = [error, typeof error === 'object' && error !== null && 'cause' in error ? (error as { cause: unknown }).cause : undefined]
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { code?: unknown }).code === '23505' &&
      (candidate as { constraint?: unknown }).constraint === SLUG_UNIQUE_CONSTRAINT,
  )
}
```

`apps/api/src/fields/fields.controller.ts`:

```ts
/**
 * Public fields surface (spec §4). POST /fields is the abuse edge of an
 * open app — it gets the strict throttler bucket (5/hour/IP), mirroring
 * AuthController's center-unlock pattern.
 */
import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { createFieldSchema, type CreateFieldBody, type FieldListItem, type SessionSnapshot } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { FieldsService } from './fields.service'
import { SLUG_PATTERN } from './slug'

const slugParamSchema = z.string().regex(SLUG_PATTERN)

@Controller('fields')
@UseGuards(StaffSessionGuard)
export class FieldsController {
  constructor(@Inject(FieldsService) private readonly fieldsService: FieldsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 5 } })
  @Post()
  async create(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(createFieldSchema)) body: CreateFieldBody,
  ): Promise<{ slug: string; snapshot: SessionSnapshot }> {
    return this.fieldsService.create(req.centerId, req.staff.staffId, body)
  }

  @Get()
  async list(@Req() req: StaffAuthenticatedRequest): Promise<FieldListItem[]> {
    return this.fieldsService.list(req.centerId)
  }

  @Get(':slug')
  async resolve(@Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string): Promise<SessionSnapshot> {
    return this.fieldsService.resolve(slug)
  }

  @Post(':slug/close')
  async close(
    @Req() req: StaffAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
  ): Promise<{ slug: string; status: 'closed' }> {
    return this.fieldsService.closeBySlug(slug, req.staff.staffId)
  }
}
```

(Note: an invalid slug shape → ZodValidationPipe → 422/`VALIDATION_FAILED`, an unknown valid-shaped slug → 404. The test uses `zzzzzz` which matches the alphabet, so it 404s. Check the throttler version's `@Throttle` signature against `auth.controller.ts` usage and mirror it.)

`apps/api/src/fields/fields.module.ts`:

```ts
import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { SnapshotModule } from '../sessions/snapshot.module'
import { FieldsController } from './fields.controller'
import { FieldsService } from './fields.service'

@Module({
  imports: [
    AuthModule,
    ActivityModule,
    SnapshotModule,
    RealtimeModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60 * 60 * 1000, limit: 5 }]),
  ],
  providers: [FieldsService],
  controllers: [FieldsController],
  exports: [FieldsService],
})
export class FieldsModule {}
```

(Before finalizing, check how `SessionsModule` imports Activity/Realtime/Snapshot — `sessions/sessions.module.ts` — and mirror its exact import set; SessionEventsService may be provided by RealtimeModule's exports.)

`apps/api/src/sessions/snapshot.service.ts` — in `buildForSession`, add `slug: session.slug,` to the returned `session` object (right after `id`).

`apps/api/src/app.module.ts` — add `FieldsModule` to imports and `'/fields/{*path}'` to ServeStatic excludes.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api vitest run && pnpm typecheck`
Expected: all green (snapshot slug fixes the Task-1-induced typecheck break). Any existing test constructing a snapshot fixture must add `slug` — update fixtures, not schemas.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/fields apps/api/src/sessions/snapshot.service.ts apps/api/src/app.module.ts apps/api/test/fields.int.test.ts
git commit -m "feat(api): public fields surface — create/list/resolve/force-close by slug, throttled creation"
```

---

### Task 6: Expiry sweep + lastActivityAt heartbeat

**Files:**
- Create: `apps/api/src/fields/expiry.service.ts`
- Modify: `apps/api/src/fields/fields.module.ts` (provide it)
- Modify: `apps/api/src/realtime/session-events.service.ts` (heartbeat touch)
- Test: `apps/api/test/expiry.int.test.ts`

**Interfaces:**
- Consumes: `FieldsService.forceClose(sessionId, actorStaffId)` (Task 5); `ScheduleModule` (already `forRoot` in app.module).
- Produces: `ExpiryService.expireStale(): Promise<number>` (count closed — called by the `@Interval` tick and directly by tests); `SessionEventsService.broadcast` now also runs `UPDATE sessions SET last_activity_at = now() WHERE id = $1` before emitting. Expiry actor: the field's own `createdBy` staff id (a real row, satisfies the FK; the activity row reads "closed by system on behalf of creator" — action name `field.expired` disambiguates).

- [ ] **Step 1: Write the failing integration test** — `apps/api/test/expiry.int.test.ts`:

```ts
it('expireStale closes fields idle >18h and leaves fresh ones alone', async () => {
  const stale = await request(app.getHttpServer()).post('/fields').send({ name: 'ישן', matchDurationSec: 300 }).expect(201)
  const fresh = await request(app.getHttpServer()).post('/fields').send({ name: 'חדש', matchDurationSec: 300 }).expect(201)
  const staleId = stale.body.snapshot.session.id

  // backdate the stale field's heartbeat 19h
  await db.execute(sql`UPDATE sessions SET last_activity_at = now() - interval '19 hours' WHERE id = ${staleId}`)

  const closed = await app.get(ExpiryService).expireStale()
  expect(closed).toBe(1)

  const list = await request(app.getHttpServer()).get('/fields').expect(200)
  const slugs = list.body.map((row: { slug: string }) => row.slug)
  expect(slugs).not.toContain(stale.body.slug)
  expect(slugs).toContain(fresh.body.slug)
})

it('mutations refresh last_activity_at (heartbeat via broadcast)', async () => {
  const created = await request(app.getHttpServer()).post('/fields').send({ name: 'פעיל', matchDurationSec: 300 }).expect(201)
  const sessionId = created.body.snapshot.session.id
  await db.execute(sql`UPDATE sessions SET last_activity_at = now() - interval '19 hours' WHERE id = ${sessionId}`)

  await request(app.getHttpServer()).post(`/sessions/${sessionId}/line`).send({ team: { newName: 'קבוצה' } }).expect(201)

  const closed = await app.get(ExpiryService).expireStale()
  expect(closed).toBe(0) // the line mutation touched the heartbeat
})
```

(`db` = the test bootstrap's Drizzle handle; the existing integration files expose one — mirror their access pattern.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api vitest run test/expiry.int.test.ts`
Expected: FAIL — ExpiryService not found.

- [ ] **Step 3: Implement.**

`apps/api/src/realtime/session-events.service.ts` — make `broadcast` the heartbeat choke point. Add imports `{ sql }` from `'drizzle-orm'`, `{ DRIZZLE, type Database }` from `'../db/db.module'`, inject `@Inject(DRIZZLE) private readonly db: Database` in the constructor, and change `broadcast`:

```ts
  /** Every mutating service calls this post-commit, which makes it the one
   * choke point for the open-fields inactivity heartbeat: touch
   * last_activity_at, THEN snapshot + emit. Touching a closed session is
   * harmless — the expiry sweep only looks at active rows. */
  async broadcast(sessionId: string): Promise<void> {
    await this.db.execute(sql`UPDATE sessions SET last_activity_at = now() WHERE id = ${sessionId}`)
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(sessionId)
    this.emitTo(sessionId, snapshot)
  }
```

(Check RealtimeModule provides DRIZZLE via DbModule import; DbModule is global-ish — mirror how other modules inject it.)

`apps/api/src/fields/expiry.service.ts`:

```ts
/**
 * Auto-expiry sweep (spec §3.3): every 15 minutes, force-close active fields
 * whose last_activity_at is older than 18h. The actor recorded on the close
 * is the field's own creator (a real staff/visitor row — satisfies FKs);
 * the 'field.expired' action name marks it as system-initiated.
 */
import { Inject, Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { and, eq, lt, sql } from 'drizzle-orm'
import { DRIZZLE, type Database } from '../db/db.module'
import { sessions } from '../db/schema'
import { FieldsService } from './fields.service'

const SWEEP_INTERVAL_MS = 15 * 60 * 1000
export const IDLE_EXPIRY_HOURS = 18

@Injectable()
export class ExpiryService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(FieldsService) private readonly fieldsService: FieldsService,
  ) {}

  @Interval(SWEEP_INTERVAL_MS)
  async tick(): Promise<void> {
    await this.expireStale()
  }

  async expireStale(): Promise<number> {
    const stale = await this.db
      .select({ id: sessions.id, createdBy: sessions.createdBy })
      .from(sessions)
      .where(and(eq(sessions.status, 'active'), lt(sessions.lastActivityAt, sql`now() - make_interval(hours => ${IDLE_EXPIRY_HOURS})`)))

    for (const row of stale) {
      await this.fieldsService.forceClose(row.id, row.createdBy)
    }
    return stale.length
  }
}
```

Note: `forceClose` writes action `field.closed`; for expiry distinguishability, add an optional third param instead: `forceClose(sessionId, staffId, action: 'field.closed' | 'field.expired' = 'field.closed')` in Task 5's service and pass `'field.expired'` here (update the final activity.write's `action` to use it).

Add `ExpiryService` to `FieldsModule`'s `providers`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/fields/expiry.service.ts apps/api/src/fields/fields.service.ts apps/api/src/fields/fields.module.ts apps/api/src/realtime/session-events.service.ts apps/api/test/expiry.int.test.ts
git commit -m "feat(api): 18h idle auto-expiry sweep + broadcast-driven activity heartbeat"
```

---

### Task 7: Gateway joins by slug

**Files:**
- Modify: `apps/api/src/realtime/session.gateway.ts`
- Test: `apps/api/test/` — the existing gateway/realtime integration test file (find: `grep -rln "session:hello" apps/api/test/`), append cases

**Interfaces:**
- Consumes: `sessions.slug` column; existing room/emit machinery.
- Produces: a socket connecting with `io(url + '/session', { query: { slug } })` joins that field's room and receives its snapshot — even when other fields are active. No slug → legacy behavior (first active session), kept for test back-compat.

- [ ] **Step 1: Write the failing test** — append to the realtime integration file, following its existing socket-client pattern:

```ts
it('a client with a slug query joins THAT field room, not the first active session', async () => {
  const a = await request(app.getHttpServer()).post('/fields').send({ name: 'א', matchDurationSec: 300 }).expect(201)
  const b = await request(app.getHttpServer()).post('/fields').send({ name: 'ב', matchDurationSec: 300 }).expect(201)

  const socket = ioClient(`${baseUrl}/session`, { query: { slug: b.body.slug }, ...existingClientOpts })
  const snapshot = await waitForEvent(socket, 'session:snapshot') // reuse the file's wait helper
  expect(snapshot.session.id).toBe(b.body.snapshot.session.id)
  expect(snapshot.session.id).not.toBe(a.body.snapshot.session.id)
  socket.disconnect()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter api vitest run test/<that-file>`
Expected: FAIL — snapshot is field א's (first active) not ב's.

- [ ] **Step 3: Implement** — in `session.gateway.ts`'s `handleConnection`, replace the `findActiveSessionId` block:

```ts
    const requestedSlug = firstQueryValue(client.handshake.query['slug'])
    const sessionId = requestedSlug
      ? await this.findSessionIdBySlug(requestedSlug)
      : await this.findActiveSessionId(centerId)
    if (!sessionId) return

    await client.join(sessionRoom(sessionId))
    const snapshot = await this.snapshotService.buildSnapshotBySessionId(sessionId)
    client.emit(SOCKET_EVENTS.snapshot, snapshot)
```

and add:

```ts
  private async findSessionIdBySlug(slug: string): Promise<string | null> {
    const [row] = await this.db.select({ id: sessions.id }).from(sessions).where(eq(sessions.slug, slug)).limit(1)
    return row?.id ?? null
  }
```

plus a small helper at file bottom:

```ts
function firstQueryValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}
```

(A slug-joined client of a CLOSED field still gets the closed snapshot — correct: the closed screen renders live if someone closes the field while you watch.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter api vitest run`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/realtime/session.gateway.ts apps/api/test
git commit -m "feat(api): socket clients join a field room by slug handshake query"
```

---

### Task 8: Web — visitor identity context + nickname sheet + gated actions

**Files:**
- Create: `apps/web/src/state/VisitorContext.tsx`
- Create: `apps/web/src/components/VisitorNicknameSheet.tsx`
- Modify: `apps/web/src/state/real/RealProviders.tsx` (wrap mutating actions)
- Modify: `apps/web/src/i18n/he.json`
- Test: `apps/web/src/state/VisitorContext.test.tsx`

**Interfaces:**
- Consumes: `apiGet`/`apiPost` + `ApiRequestError` from `@/lib/api`; `Dialog` from `@/components/ui/dialog` (`{ open, onClose, title }` props); `SessionActions` interface (all 17 methods, `state/SessionActions.ts`).
- Produces: `VisitorProvider` (mounted above RealProviders by Task 9's Root); `useVisitor(): { nickname: string | null; ensureVisitor(): Promise<boolean> }` — resolves `true` immediately when an identity exists, otherwise opens the sheet and resolves `true` on successful `POST /visitors`, `false` on dismiss; `gateActions(actions, ensureVisitor): SessionActions` exported from `VisitorContext.tsx`.

- [ ] **Step 1: Write the failing tests** — `apps/web/src/state/VisitorContext.test.tsx` (jsdom + Testing Library, matching the project's component-test style; mock `@/lib/api` with `vi.mock`):

```tsx
it('resolves ensureVisitor immediately when GET /visitors/me succeeds', async () => {
  mockApiGet.mockResolvedValueOnce({ visitorId: 'v1', nickname: 'דנה' })
  const { result } = renderVisitorHook() // helper: renderHook(useVisitor, { wrapper: VisitorProvider })
  await waitFor(() => expect(result.current.nickname).toBe('דנה'))
  await expect(result.current.ensureVisitor()).resolves.toBe(true)
})

it('opens the sheet when no identity; submitting a nickname POSTs and resolves true', async () => {
  mockApiGet.mockRejectedValueOnce(new ApiRequestError('NOT_FOUND', 'none'))
  mockApiPost.mockResolvedValueOnce({ visitorId: 'v2', nickname: 'אורח 7' })
  const { result } = renderVisitorHook()
  let resolved: boolean | null = null
  act(() => void result.current.ensureVisitor().then((ok) => (resolved = ok)))
  const input = await screen.findByRole('textbox')
  await userEvent.type(input, 'אורח 7')
  await userEvent.click(screen.getByRole('button', { name: t('visitor.sheet.confirm') }))
  await waitFor(() => expect(resolved).toBe(true))
  expect(mockApiPost).toHaveBeenCalledWith('/visitors', { nickname: 'אורח 7' })
})

it('gateActions calls ensureVisitor before a mutation and skips it for searchTeams', async () => {
  const ensure = vi.fn().mockResolvedValue(true)
  const inner = fakeSessionActions() // helper: object with every SessionActions method as vi.fn()
  const gated = gateActions(inner, ensure)
  await gated.addToLine({ newName: 'קבוצה' })
  expect(ensure).toHaveBeenCalledTimes(1)
  expect(inner.addToLine).toHaveBeenCalled()
  await gated.searchTeams('ק')
  expect(ensure).toHaveBeenCalledTimes(1) // reads are never gated
})

it('gateActions rejects without calling the API when the sheet is dismissed', async () => {
  const ensure = vi.fn().mockResolvedValue(false)
  const inner = fakeSessionActions()
  const gated = gateActions(inner, ensure)
  await expect(gated.startMatch()).rejects.toThrow()
  expect(inner.startMatch).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web vitest run src/state/VisitorContext.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.**

`apps/web/src/components/VisitorNicknameSheet.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { t } from '@/i18n'

/**
 * Single responsibility: first-mutation identity prompt (open-fields spec
 * §5) — one text input seeded with a suggested nickname + confirm. Opened
 * by VisitorProvider the first time a gated action runs without identity;
 * spectators never see it.
 */
export interface VisitorNicknameSheetProps {
  open: boolean
  suggestion: string
  onSubmit(nickname: string): Promise<void>
  onClose(): void
}

export function VisitorNicknameSheet({ open, suggestion, onSubmit, onClose }: VisitorNicknameSheetProps) {
  const [nickname, setNickname] = useState(suggestion)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm(): Promise<void> {
    const trimmed = nickname.trim()
    if (trimmed.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch {
      setError(t('visitor.sheet.error'))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('visitor.sheet.title')}>
      <div className="flex flex-col gap-4">
        <p className="text-[14px] text-muted">{t('visitor.sheet.hint')}</p>
        <input
          type="text"
          value={nickname}
          maxLength={30}
          onChange={(event) => setNickname(event.target.value)}
          placeholder={t('visitor.sheet.placeholder')}
          className="min-h-[var(--touch-target-min)] rounded-lg border border-line bg-surface px-3 text-[16px]"
        />
        {error && (
          <p role="alert" className="text-[13.5px] font-semibold text-danger">
            {error}
          </p>
        )}
        <Button variant="primary" size="big" onClick={() => void handleConfirm()} disabled={submitting || nickname.trim().length === 0}>
          {t('visitor.sheet.confirm')}
        </Button>
      </div>
    </Dialog>
  )
}
```

`apps/web/src/state/VisitorContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { VisitorNicknameSheet } from '@/components/VisitorNicknameSheet'
import { apiGet, apiPost } from '@/lib/api'
import type { SessionActions } from '@/state/SessionActions'

/**
 * Single responsibility: anonymous visitor identity (open-fields spec §3.2).
 * Resolves GET /visitors/me once on mount; `ensureVisitor()` is the gate
 * every mutation passes through — instant true when identified, otherwise
 * it opens the nickname sheet and settles with the outcome. Reads are
 * never gated (spectators are never interrupted).
 */
type VisitorState = { nickname: string | null; ensureVisitor(): Promise<boolean> }

const VisitorContext = createContext<VisitorState | undefined>(undefined)

export function useVisitor(): VisitorState {
  const value = useContext(VisitorContext)
  if (value === undefined) throw new Error('useVisitor must be used within VisitorProvider')
  return value
}

function suggestedNickname(): string {
  return `אורח ${Math.floor(Math.random() * 90) + 10}`
}

export function VisitorProvider({ children }: { children: ReactNode }) {
  const [nickname, setNickname] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [suggestion] = useState(suggestedNickname)
  const pendingResolvers = useRef<Array<(ok: boolean) => void>>([])
  const nicknameRef = useRef<string | null>(null)
  nicknameRef.current = nickname

  useEffect(() => {
    let cancelled = false
    apiGet<{ visitorId: string; nickname: string }>('/visitors/me')
      .then((me) => {
        if (!cancelled) setNickname(me.nickname)
      })
      .catch(() => {
        // No identity yet — the sheet appears on the first gated action.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const ensureVisitor = useCallback((): Promise<boolean> => {
    if (nicknameRef.current !== null) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      pendingResolvers.current.push(resolve)
      setSheetOpen(true)
    })
  }, [])

  function settle(ok: boolean): void {
    for (const resolve of pendingResolvers.current) resolve(ok)
    pendingResolvers.current = []
    setSheetOpen(false)
  }

  async function handleSubmit(name: string): Promise<void> {
    const me = await apiPost<{ visitorId: string; nickname: string }>('/visitors', { nickname: name })
    setNickname(me.nickname)
    settle(true)
  }

  return (
    <VisitorContext.Provider value={{ nickname, ensureVisitor }}>
      {children}
      <VisitorNicknameSheet open={sheetOpen} suggestion={suggestion} onSubmit={handleSubmit} onClose={() => settle(false)} />
    </VisitorContext.Provider>
  )
}

/** Identity dismissed mid-gate — surfaces as the generic action error. */
export class VisitorRequiredError extends Error {
  constructor() {
    super('visitor identity required')
    this.name = 'VisitorRequiredError'
  }
}

/** Wraps every MUTATING SessionActions method with the identity gate;
 * searchTeams (the only read) passes through. Explicit per-method so the
 * compiler catches any future SessionActions addition. */
export function gateActions(actions: SessionActions, ensureVisitor: () => Promise<boolean>): SessionActions {
  async function gate(): Promise<void> {
    const ok = await ensureVisitor()
    if (!ok) throw new VisitorRequiredError()
  }
  return {
    addToLine: async (team) => {
      await gate()
      return actions.addToLine(team)
    },
    searchTeams: (q) => actions.searchTeams(q),
    reorderLine: async (entryIds) => {
      await gate()
      return actions.reorderLine(entryIds)
    },
    moveTop: async (entryId) => {
      await gate()
      return actions.moveTop(entryId)
    },
    moveBottom: async (entryId) => {
      await gate()
      return actions.moveBottom(entryId)
    },
    removeFromLine: async (entryId) => {
      await gate()
      return actions.removeFromLine(entryId)
    },
    startMatch: async (entryIds) => {
      await gate()
      return entryIds === undefined ? actions.startMatch() : actions.startMatch(entryIds)
    },
    pause: async (matchId) => {
      await gate()
      return actions.pause(matchId)
    },
    resume: async (matchId) => {
      await gate()
      return actions.resume(matchId)
    },
    finish: async (matchId) => {
      await gate()
      return actions.finish(matchId)
    },
    extend: async (matchId) => {
      await gate()
      return actions.extend(matchId)
    },
    replay: async (matchId) => {
      await gate()
      return actions.replay(matchId)
    },
    undo: async (activityId) => {
      await gate()
      return actions.undo(activityId)
    },
    openSession: async (cfg) => {
      await gate()
      return actions.openSession(cfg)
    },
    closeSession: async () => {
      await gate()
      return actions.closeSession()
    },
    updateDuration: async (matchDurationSec) => {
      await gate()
      return actions.updateDuration(matchDurationSec)
    },
    updateTeam: async (id, patch) => {
      await gate()
      return actions.updateTeam(id, patch)
    },
  }
}
```

`apps/web/src/state/real/RealProviders.tsx` — gate the actions: add imports `{ gateActions, useVisitor }` from `'@/state/VisitorContext'` and change the actions memo:

```ts
  const { ensureVisitor } = useVisitor()
  const actions = useMemo(
    () => gateActions(createRealSessionActions(sessionIdHandle), ensureVisitor),
    [sessionIdHandle, ensureVisitor],
  )
```

`apps/web/src/i18n/he.json` — add:

```json
  "visitor.sheet.title": "איך קוראים לך?",
  "visitor.sheet.hint": "השם יופיע ביומן הפעולות של המגרש",
  "visitor.sheet.placeholder": "כינוי",
  "visitor.sheet.confirm": "המשך",
  "visitor.sheet.error": "השמירה נכשלה — נסו שוב"
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web vitest run`
Expected: new tests PASS. Existing RealProviders-dependent tests may now need a `VisitorProvider` wrapper (they'll throw `useVisitor must be used within VisitorProvider`) — wrap their render trees, don't weaken the hook.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/VisitorContext.tsx apps/web/src/components/VisitorNicknameSheet.tsx apps/web/src/state/real/RealProviders.tsx apps/web/src/i18n/he.json apps/web/src/state/VisitorContext.test.tsx
git commit -m "feat(web): visitor nickname identity — sheet on first mutation, gated session actions"
```

---

### Task 9: Web — URL routing + Home screen (create + public list)

**Files:**
- Create: `apps/web/src/lib/route.ts`
- Create: `apps/web/src/screens/HomeScreen.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/i18n/he.json`
- Test: `apps/web/src/lib/route.test.ts`, `apps/web/src/screens/HomeScreen.test.tsx`

**Interfaces:**
- Consumes: `FieldListItem`, `CreateFieldBody` (shared); `apiGet`/`apiPost`; `Button`, `EmptyState`, `Dialog`; visitor gating NOT needed here (creation is the entry action; the server accepts it via guard fallback — nickname is prompted on the field screen).
- Produces: `parseRoute(pathname: string): { kind: 'home' } | { kind: 'field'; slug: string }`; `HomeScreen` navigates with `window.location.assign('/f/' + slug)` (full page load — the field screen boots its own providers). Root mounting (main.tsx): `home` → `<HomeScreen />` bare; `field` → existing AppGate/provider stack (Task 10 threads the slug).

- [ ] **Step 1: Write the failing tests.**

`apps/web/src/lib/route.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseRoute } from './route'

describe('parseRoute', () => {
  it('/ is home', () => {
    expect(parseRoute('/')).toEqual({ kind: 'home' })
  })
  it('/f/<slug> is a field', () => {
    expect(parseRoute('/f/abc234')).toEqual({ kind: 'field', slug: 'abc234' })
  })
  it('junk falls back to home', () => {
    expect(parseRoute('/f/UPPER!')).toEqual({ kind: 'home' })
    expect(parseRoute('/f/')).toEqual({ kind: 'home' })
    expect(parseRoute('/anything/else')).toEqual({ kind: 'home' })
  })
})
```

`apps/web/src/screens/HomeScreen.test.tsx` (mock `@/lib/api`):

```tsx
it('lists active fields with queue count and live badge', async () => {
  mockApiGet.mockResolvedValueOnce([
    { slug: 'abc234', name: 'מגרש בית ספר', createdAt: '2026-07-16T10:00:00.000Z', queueLength: 3, hasLiveMatch: true },
  ])
  render(<HomeScreen />)
  expect(await screen.findByText('מגרש בית ספר')).toBeInTheDocument()
  expect(screen.getByText(t('home.list.live'))).toBeInTheDocument()
})

it('empty list shows the empty state', async () => {
  mockApiGet.mockResolvedValueOnce([])
  render(<HomeScreen />)
  expect(await screen.findByText(t('home.list.empty'))).toBeInTheDocument()
})

it('create flow POSTs name+duration and navigates to the new slug', async () => {
  mockApiGet.mockResolvedValueOnce([])
  mockApiPost.mockResolvedValueOnce({ slug: 'xyz789', snapshot: {} })
  const assignSpy = vi.fn()
  vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, assign: assignSpy })
  render(<HomeScreen />)
  await userEvent.click(await screen.findByRole('button', { name: t('home.create.cta') }))
  await userEvent.type(screen.getByRole('textbox'), 'המגרש שלי')
  await userEvent.click(screen.getByRole('button', { name: t('home.create.open') }))
  await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith('/fields', { name: 'המגרש שלי', matchDurationSec: 360 }))
  await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/f/xyz789'))
})
```

(If spying on `window.location` fights jsdom, extract a `navigateToField(slug: string)` helper into `lib/route.ts` and mock THAT — cleaner; adjust the test accordingly.)
Prefer the helper: add `navigateToField` to `route.ts` and mock it in the test.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web vitest run src/lib/route.test.ts src/screens/HomeScreen.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement.**

`apps/web/src/lib/route.ts`:

```ts
/**
 * Open-fields URL space: '/' = public home (list + create), '/f/<slug>' =
 * one field. Navigation is full-page (location.assign) — the field screen
 * boots its own provider stack, so SPA-internal routing buys nothing here.
 */
const FIELD_PATH = /^\/f\/([a-z2-9]{6})$/

export type Route = { kind: 'home' } | { kind: 'field'; slug: string }

export function parseRoute(pathname: string): Route {
  const match = FIELD_PATH.exec(pathname)
  if (match?.[1]) return { kind: 'field', slug: match[1] }
  return { kind: 'home' }
}

export function fieldUrl(slug: string): string {
  return `/f/${slug}`
}

export function navigateToField(slug: string): void {
  window.location.assign(fieldUrl(slug))
}
```

`apps/web/src/screens/HomeScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { t } from '@/i18n'
import { apiGet, apiPost } from '@/lib/api'
import { navigateToField } from '@/lib/route'
import type { FieldListItem, SessionSnapshot } from 'shared'

/**
 * Single responsibility: the public home (open-fields spec §5.1) — hero
 * "open a field" CTA above the live list of active fields. Creating asks
 * only name + duration, then navigates to the new field's URL. The list
 * refreshes on a 15s interval (no socket here — the field rooms are
 * per-session; polling a public list is the simple correct tool).
 */
const LIST_REFRESH_MS = 15_000
const MIN_MINUTES = 1
const MAX_MINUTES = 60
const DEFAULT_MINUTES = 6

export function HomeScreen() {
  const [fields, setFields] = useState<FieldListItem[] | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function refresh(): Promise<void> {
      try {
        const list = await apiGet<FieldListItem[]>('/fields')
        if (!cancelled) setFields(list)
      } catch {
        if (!cancelled) setFields((prev) => prev ?? [])
      }
    }
    void refresh()
    const id = setInterval(() => void refresh(), LIST_REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim()
    if (trimmed.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const created = await apiPost<{ slug: string; snapshot: SessionSnapshot }>('/fields', {
        name: trimmed,
        matchDurationSec: minutes * 60,
      })
      navigateToField(created.slug)
    } catch {
      setError(t('home.create.error'))
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <header className="flex flex-col gap-1 pt-6 text-center">
        <h1 className="text-[24px] font-bold">{t('home.title')}</h1>
        <p className="text-[14px] text-muted">{t('home.subtitle')}</p>
      </header>

      <Button variant="primary" size="big" onClick={() => setCreateOpen(true)}>
        {t('home.create.cta')}
      </Button>

      <section className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">{t('home.list.header')}</h2>
        {fields === null ? (
          <p role="status" className="text-[14px] text-muted">
            {t('app.loading')}
          </p>
        ) : fields.length === 0 ? (
          <EmptyState icon="⚽" title={t('home.list.empty')} />
        ) : (
          <ul className="flex flex-col gap-2">
            {fields.map((field) => (
              <li key={field.slug}>
                <button
                  type="button"
                  onClick={() => navigateToField(field.slug)}
                  className="flex min-h-[var(--touch-target-min)] w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3 text-start"
                >
                  <span className="font-semibold">{field.name}</span>
                  <span className="flex items-center gap-2 text-[13px] text-muted">
                    {field.hasLiveMatch && <span className="font-semibold text-accent">{t('home.list.live')}</span>}
                    <span>{t('home.list.queueCount', { count: field.queueLength })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title={t('home.create.title')}>
        <div className="flex flex-col gap-4">
          <input
            type="text"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder={t('home.create.namePlaceholder')}
            className="min-h-[var(--touch-target-min)] rounded-lg border border-line bg-surface px-3 text-[16px]"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] text-muted">{t('session.setup.duration')}</span>
            <div className="flex items-center gap-3">
              <Button onClick={() => setMinutes((m) => Math.max(MIN_MINUTES, m - 1))} aria-label={t('session.setup.decrease')}>
                −
              </Button>
              <span className="tabular w-14 text-center text-[19px] font-bold" dir="ltr">
                {minutes}:00
              </span>
              <Button onClick={() => setMinutes((m) => Math.min(MAX_MINUTES, m + 1))} aria-label={t('session.setup.increase')}>
                +
              </Button>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-[13.5px] font-semibold text-danger">
              {error}
            </p>
          )}
          <Button variant="primary" size="big" onClick={() => void handleCreate()} disabled={submitting || name.trim().length === 0}>
            {t('home.create.open')}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}
```

`apps/web/src/main.tsx` — route at the top of `Root()`:

```tsx
import { parseRoute } from '@/lib/route'
import { HomeScreen } from '@/screens/HomeScreen'

const route = parseRoute(window.location.pathname)

function Root() {
  if (isDemo) {
    return (
      <DemoProviders>
        <App />
      </DemoProviders>
    )
  }
  if (route.kind === 'home') return <HomeScreen />
  return (
    <AppGate>
      <VisitorProvider>
        <RealProviders slug={route.slug}>
          <App slug={route.slug} />
        </RealProviders>
      </VisitorProvider>
    </AppGate>
  )
}
```

(`VisitorProvider` import from `@/state/VisitorContext`; the `slug` props land in Task 10 — implement Tasks 9 and 10 in the same working session, or stub `slug` props as accepted-but-unused to keep this commit green.)

`apps/web/src/i18n/he.json` — add:

```json
  "home.title": "תור למגרש",
  "home.subtitle": "פותחים מגרש, משתפים קישור, משחקים",
  "home.create.cta": "פתח מגרש חדש",
  "home.create.title": "מגרש חדש",
  "home.create.namePlaceholder": "שם המגרש",
  "home.create.open": "פתח מגרש",
  "home.create.error": "פתיחת המגרש נכשלה — נסו שוב",
  "home.list.header": "מגרשים פעילים",
  "home.list.empty": "אין מגרשים פעילים כרגע",
  "home.list.live": "משחק פעיל",
  "home.list.queueCount": "{count} בתור"
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web vitest run && pnpm --filter web build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/route.ts apps/web/src/lib/route.test.ts apps/web/src/screens/HomeScreen.tsx apps/web/src/screens/HomeScreen.test.tsx apps/web/src/main.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): public home — create a field, browse the active-fields list, /f/:slug routing"
```

---

### Task 10: Web — field screen by slug: seed, socket, share, closed state

**Files:**
- Modify: `apps/web/src/state/real/RealProviders.tsx` (slug prop: seed from `/fields/:slug`, socket slug query)
- Modify: `apps/web/src/lib/socket.ts` (optional slug option)
- Modify: `apps/web/src/App.tsx` (share button; closed-state takeover)
- Create: `apps/web/src/screens/ClosedFieldScreen.tsx`
- Modify: `apps/web/src/screens/MainScreen.tsx` (no-snapshot state: loading/not-found instead of open-session CTA)
- Modify: `apps/web/src/i18n/he.json`
- Test: `apps/web/src/screens/ClosedFieldScreen.test.tsx`, plus updated RealProviders/MainScreen tests

**Interfaces:**
- Consumes: `GET /fields/:slug` → `SessionSnapshot`; socket slug handshake (Task 7); `HistoryContext` (already fed per-session); `fieldUrl(slug)`; `showStatusToast` from `@/components/UndoToast`.
- Produces: `RealProviders({ slug, children })`; `createSessionSocket` accepts optional `slug?: string`; `App({ slug })` renders the share button when `slug` is non-empty and swaps the whole tab area for `ClosedFieldScreen` when `snapshot.session.status === 'closed'`.

- [ ] **Step 1: Write the failing tests.**

`apps/web/src/screens/ClosedFieldScreen.test.tsx`:

```tsx
it('shows the closed title and a create-new CTA that navigates home', async () => {
  render(<ClosedFieldScreen />)
  expect(screen.getByText(t('field.closed.title'))).toBeInTheDocument()
  const cta = screen.getByRole('button', { name: t('field.closed.cta') })
  await userEvent.click(cta)
  expect(mockNavigateHome).toHaveBeenCalled() // mock lib/route's navigateHome
})
```

Update the existing socket unit test (`apps/web/src/lib/socket.test.ts` or wherever `createSessionSocket` is covered — find with `grep -rln createSessionSocket apps/web/src`): assert that passing `slug: 'abc234'` forwards `{ query: { slug: 'abc234' } }` to `io()` (the test file already mocks `socket.io-client`; extend the mock assertion).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter web vitest run`
Expected: new assertions FAIL.

- [ ] **Step 3: Implement.**

`apps/web/src/lib/socket.ts` — add `slug?: string` to `CreateSessionSocketOptions` and build the socket as:

```ts
  const socket: Socket = io(`${opts.url}/session`, {
    withCredentials: true,
    ...(opts.slug !== undefined ? { query: { slug: opts.slug } } : {}),
  })
```

`apps/web/src/lib/route.ts` — add:

```ts
export function navigateHome(): void {
  window.location.assign('/')
}
```

`apps/web/src/screens/ClosedFieldScreen.tsx`:

```tsx
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { t } from '@/i18n'
import { navigateHome } from '@/lib/route'

/**
 * Single responsibility: terminal state of a field link (open-fields spec
 * §5.3) — the field is closed/expired; offer the way back to creating or
 * finding another. Final history stays reachable via the history tab
 * (App.tsx keeps tabs mounted; this replaces only the main tab).
 */
export function ClosedFieldScreen() {
  return (
    <div className="p-4">
      <EmptyState
        icon="🏁"
        title={t('field.closed.title')}
        hint={t('field.closed.hint')}
        action={
          <Button variant="primary" className="min-w-44" onClick={() => navigateHome()}>
            {t('field.closed.cta')}
          </Button>
        }
      />
    </div>
  )
}
```

`apps/web/src/state/real/RealProviders.tsx`:
- Signature: `export function RealProviders({ slug, children }: { slug: string; children: ReactNode })`.
- Seed effect: replace `apiGet<SessionSnapshot>('/sessions/active')` with `` apiGet<SessionSnapshot>(`/fields/${slug}`) `` — the `NOT_FOUND` branch behavior (snapshot stays null) is unchanged and now means "bad link"; keep it.
- Socket effect: pass `slug` into `createSessionSocket({ url: socketUrl(), slug, ... })`.
- Both effects add `slug` to their dependency arrays.
- Point the close action at the FORCE-close route (the legacy `POST /sessions/:id/close` 409s on a live match; a public field must close regardless — spec §4). After the `gateActions` wrap, override:

```ts
  const actions = useMemo(() => {
    const gated = gateActions(createRealSessionActions(sessionIdHandle), ensureVisitor)
    return {
      ...gated,
      closeSession: async () => {
        const ok = await ensureVisitor()
        if (!ok) throw new VisitorRequiredError()
        await apiPost(`/fields/${slug}/close`, {})
        sessionIdHandle.set(null)
      },
    }
  }, [sessionIdHandle, ensureVisitor, slug])
```

(`VisitorRequiredError` is exported by `@/state/VisitorContext`; mirror whatever the existing `realSessionActions.closeSession` does after success — if it calls `sessionIdHandle.set(null)`, keep that; check the file.) The SettingsScreen close button already confirms before calling `closeSession` — verify it does; if it commits directly, wrap it in the existing confirm-dialog pattern (`PairSwitchConfirmDialog` precedent) as part of this task.

`apps/web/src/screens/MainScreen.tsx` — the `!snapshot` branch no longer offers "open a session" (creation lives on Home). Replace that whole `if (!snapshot)` block with:

```tsx
  if (!snapshot) {
    return (
      <div className="p-4">
        <EmptyState icon="⚽" title={t('field.notFound.title')} hint={t('field.notFound.hint')} />
      </div>
    )
  }
```

Remove the now-unused `SessionSetupDialog` import, `setupOpen` state, and `useCurrentStaff` usage if nothing else in the file needs it. (`SessionSetupDialog` itself stays — SettingsScreen still opens it for duration changes; if only MainScreen used it for opening, leave the component file untouched anyway — surgical changes only.)

`apps/web/src/App.tsx`:
- Props: `export default function App({ slug = '' }: { slug?: string })`.
- Closed takeover — after the `useSnapshot()` destructure add `const { snapshot } = useSnapshot()` merge (it already destructures; add `snapshot`) and inside `<main>` replace the tab switch with:

```tsx
        {snapshot?.session.status === 'closed' && tab === 'main' ? (
          <ClosedFieldScreen />
        ) : (
          <>
            {tab === 'main' && <MainScreen />}
            {tab === 'history' && <HistoryScreen />}
            {tab === 'activity' && <ActivityFeed />}
            {tab === 'settings' && <SettingsScreen />}
          </>
        )}
```

- Share button — next to `<InstallAppButton />` add:

```tsx
            {slug !== '' && (
              <button
                type="button"
                aria-label={t('field.share')}
                onClick={() => void handleShare()}
                className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center rounded-lg text-muted"
              >
                ↗
              </button>
            )}
```

with, above the return:

```tsx
  async function handleShare(): Promise<void> {
    const url = window.location.origin + fieldUrl(slug)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ url })
        return
      }
      await navigator.clipboard.writeText(url)
      showStatusToast('field.share.copied')
    } catch {
      // user dismissed the share sheet — nothing to report
    }
  }
```

(Imports: `fieldUrl` from `@/lib/route`, `ClosedFieldScreen` from `@/screens/ClosedFieldScreen`, `showStatusToast` from `@/components/UndoToast`. Check `showStatusToast`'s parameter type — it takes a `MessageKey`; `'field.share.copied'` must be added to he.json for the key to typecheck. If the share glyph `↗` clashes with design tokens, use the existing icon approach InstallAppButton uses.)

`apps/web/src/i18n/he.json` — add:

```json
  "field.share": "שיתוף קישור למגרש",
  "field.share.copied": "הקישור הועתק",
  "field.closed.title": "המגרש נסגר",
  "field.closed.hint": "אפשר לראות את ההיסטוריה בלשונית ההיסטוריה, או לפתוח מגרש חדש",
  "field.closed.cta": "פתח מגרש חדש",
  "field.notFound.title": "המגרש לא נמצא",
  "field.notFound.hint": "בדקו את הקישור או פתחו מגרש חדש מהעמוד הראשי"
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter web vitest run && pnpm typecheck && pnpm --filter web build`
Expected: green. MainScreen tests asserting the old open-session empty state must be updated to the new not-found copy (deliberate spec change).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/state/real/RealProviders.tsx apps/web/src/lib/socket.ts apps/web/src/lib/route.ts apps/web/src/App.tsx apps/web/src/screens/ClosedFieldScreen.tsx apps/web/src/screens/ClosedFieldScreen.test.tsx apps/web/src/screens/MainScreen.tsx apps/web/src/i18n/he.json
git commit -m "feat(web): field screen boots by slug — snapshot seed, socket room, share button, closed state"
```

---

### Task 11: Full verification + manual pass

**Files:** none created — verification only.

- [ ] **Step 1: Full workspace gates**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: all green (Docker running for integration).

- [ ] **Step 2: Manual two-device flow** (dev servers: `pnpm --filter api dev` + `pnpm dev`, seeded DB via `pnpm --filter api seed`)

1. Open `http://localhost:5173/` → home shows title + create CTA + empty list.
2. Create field "מגרש בדיקה", 6 min → lands on `/f/<slug>`, empty queue, field card free.
3. Second browser (incognito) → home lists the field with `0 בתור` → tap → same field.
4. Incognito: quick-add a team → nickname sheet appears → confirm → team appears in BOTH browsers (realtime).
5. First browser: add a second team, start match → timer runs in both.
6. Share button → link copied/share sheet with `/f/<slug>`.
7. Close the field (settings tab close action) → both browsers flip to the closed screen; home list no longer shows it.
8. Activity tab shows the visitor nicknames on their actions.

- [ ] **Step 3: Record results** — note timings/friction in the phase-close note; screenshot the home screen + closed screen.

- [ ] **Step 4: Commit any test-fixture stragglers and finish**

Use superpowers:finishing-a-development-branch to decide merge/PR.

---

## Deliberately out of scope (spec §8)

- Accounts, ownership, admin links, moderation tooling; per-field settings beyond name + duration; renaming the `sessions` table; deleting staff/PIN code (kept, unrouted for login UI but PIN endpoints still exist — harmless); multi-center; Playwright E2E (Phase 9 infra).
