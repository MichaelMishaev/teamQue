---
name: remote-db
description: Safely inspect or query the teamQue production Railway PostgreSQL database. Use for remote DB, prod DB, production database, Railway DB, live-data checks, deployed-migration verification, production-only bug diagnosis, schema drift, or comparisons between production and local development. Prefer read-only API checks when available; require explicit per-statement user approval for any production write.
---

# Remote production database

Inspect the Railway PostgreSQL database behind `github.com/MichaelMishaev/teamQue`.
Treat it as live youth-center production data and keep every session read-only unless
the user explicitly approves one exact write statement in the current message.

## Safety rules

1. Prefer an authenticated API endpoint when it can answer the question.
2. Allow read-only operations such as `SELECT`, `EXPLAIN` without `ANALYZE`, `\d`,
   and `information_schema` inspection.
3. Never run `INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`,
   `GRANT`, `REVOKE`, or migrations without explicit approval for the exact statement.
4. Never run schema migrations manually. The deployment Dockerfile runs
   `db:migrate`; fix schema drift through a reviewed deployment.
5. Never print, echo, log, or paste `RAILWAY_DATABASE_URL`. Do not use `env`,
   `printenv`, shell tracing, or commands that expose expanded arguments.
6. Keep a 10-second statement timeout and enforce read-only mode at the PostgreSQL
   session and transaction levels.
7. Report the database identity and evidence used, but mask credentials and hostnames.

## Connect safely

The gitignored credential is `.claude/.env.railway`, which must remain mode `600`.
Load it without printing its value, disable shell tracing, and use this pattern:

```bash
set +x
set -a
. .claude/.env.railway
set +a
PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=10000' \
  psql "$RAILWAY_DATABASE_URL" -X -v ON_ERROR_STOP=1 -P pager=off \
  -c "BEGIN TRANSACTION READ ONLY; SELECT current_database(), current_setting('transaction_read_only'); ROLLBACK;"
```

Confirm that `transaction_read_only` is `on` before running the requested query.
Use `ROLLBACK` even for read-only inspection so the session has an explicit end.

## Common checks

Check which migration ledger exists before drawing conclusions:

```sql
SELECT to_regclass('drizzle.__drizzle_migrations') AS drizzle_migrations,
       to_regclass('public.__drizzle_migrations') AS public_migrations;
```

List applied Drizzle migrations:

```sql
SELECT hash, to_timestamp(created_at / 1000) AS applied
FROM drizzle.__drizzle_migrations
ORDER BY created_at;
```

Inspect activity-log schema drift:

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'activity_log'
ORDER BY ordinal_position;
```

Inspect recent courts without exposing unrelated personal data:

```sql
SELECT s.slug, f.name, s.status, s.created_at
FROM sessions AS s
JOIN fields AS f ON f.session_id = s.id AND f.position = 0
ORDER BY s.created_at DESC
LIMIT 20;
```

Production uses database `railway`. Local development uses database `qlm` in the
`qlm-live-demo` container on port `5460`; verify identity before trusting results.

## If a write is explicitly approved

1. Show the exact SQL statement and run a matching read-only `SELECT` first.
2. Report the exact row count and identifiers the statement would affect.
3. Ask for explicit approval for that exact SQL statement.
4. After approval, use `BEGIN`, execute the statement, verify the result, and
   `COMMIT`; otherwise `ROLLBACK`.
5. Never execute a bare `UPDATE` or `DELETE` without a restrictive `WHERE` clause.

The credential was previously pasted into a chat session on 2026-07-17. Treat
rotation in Railway as outstanding security work; never reproduce the credential.
