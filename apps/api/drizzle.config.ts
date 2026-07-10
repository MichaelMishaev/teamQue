import { defineConfig } from 'drizzle-kit'

// Migrations only need DATABASE_URL — do NOT pull in the full app env (loadEnv),
// which also requires SESSION_SECRET/WEB_ORIGIN and would fail a bare `drizzle-kit
// migrate` in CI or the container's startup migrate step.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for drizzle-kit')
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
