---
name: remote-db
description: Use when inspecting or querying the production Railway Postgres for this project (teamQue) — checking live data, verifying which migrations a deploy actually applied, diagnosing a production-only bug, or comparing prod against the local dev DB. Trigger on "remote db", "prod db", "production database", "railway db", "check prod", or any request to look at live data. Read-only by default; writes require explicit per-statement approval.
---

# Remote (production) database

The Railway Postgres behind `origin` (`github.com/MichaelMishaev/teamQue`). This is
**live production data for a real youth center**. Treat every session here as
read-only until the user says otherwise, in that specific message, for that
specific statement.

## The rules

1. **Read-only by default.** `SELECT`, `\d`, `EXPLAIN`, `information_schema`. Nothing else.
2. **Never `DELETE`, `DROP`, `TRUNCATE`, or `ALTER` without explicit permission** for
   that exact statement. "You have DB access" is not permission. "Fix prod" is not
   permission. The user's standing rule is *never delete data from prod*.
3. **Never echo `RAILWAY_DATABASE_URL`.** It contains a live password. Don't `echo` it,
   don't `env | grep` it, don't paste it into a command the user will read back. Load it
   as shown below so it stays out of the transcript.
4. **Never run schema migrations against prod by hand.** The Dockerfile runs
   `db:migrate` on deploy. Applying `drizzle-kit migrate` manually races that and can
   half-apply. If prod schema is wrong, fix it by deploying, not by reaching in.
5. **Prefer the API over the DB** when an endpoint answers the question. Reading rows
   bypasses every guard and invariant the app maintains.

## Connecting

The credential lives in `.claude/.env.railway` (gitignored via `.gitignore:7`, mode 600).

```bash
set -a && . .claude/.env.railway && set +a
psql "$RAILWAY_DATABASE_URL" -tAc "SELECT count(*) FROM sessions;"
```

`-tAc` gives unaligned, headerless output — best for piping. Drop `-tA` for a
human-readable table. Local client is Homebrew `psql` 17.x; prod is PostgreSQL 18.x,
which is fine (minor client/server skew only affects `pg_dump`).

## Useful queries

Which migrations prod has actually applied — the first thing to check when prod
behaves differently from local:

```bash
psql "$RAILWAY_DATABASE_URL" -c \
  "SELECT hash, to_timestamp(created_at/1000) AS applied FROM drizzle.__drizzle_migrations ORDER BY created_at;"
```

Compare a table's shape against local (schema drift is the usual culprit):

```bash
psql "$RAILWAY_DATABASE_URL" -c "\d activity_log"
```

Live courts (a "court" = one `sessions` row + its child `fields` row at position 0):

```bash
psql "$RAILWAY_DATABASE_URL" -c \
  "SELECT s.slug, f.name, s.status, s.created_at
     FROM sessions s JOIN fields f ON f.session_id = s.id AND f.position = 0
    ORDER BY s.created_at DESC LIMIT 20;"
```

## If a write is genuinely needed

1. Show the user the exact statement and the exact rows it will touch
   (run the `SELECT` form first and show the count).
2. Get explicit approval for that statement.
3. Wrap it: `BEGIN;` → statement → verify → `COMMIT;` (or `ROLLBACK;`).
4. Never use a bare `UPDATE`/`DELETE` without a `WHERE` — no exceptions.

## Notes

- Prod DB name is `railway`, not `qlm`. The local dev DB is `qlm` in the
  `qlm-live-demo` container on port 5460 — don't confuse the two.
- The credential in `.claude/.env.railway` was pasted in plaintext into a chat
  session on 2026-07-17 and should be rotated in Railway.
