/**
 * Testcontainers helper: boots a throwaway Postgres, applies the committed
 * Drizzle migrations, and hands back a ready-to-query drizzle client.
 */
import path from 'node:path'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import * as schema from '../../src/db/schema'

export type TestPg = {
  container: StartedPostgreSqlContainer
  pool: Pool
  db: NodePgDatabase<typeof schema>
  stop: () => Promise<void>
}

export async function startTestPg(): Promise<TestPg> {
  const container = await new PostgreSqlContainer('postgres:17-alpine').start()
  const pool = new Pool({ connectionString: container.getConnectionUri() })
  const db = drizzle(pool, { schema })

  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') })

  return {
    container,
    pool,
    db,
    stop: async () => {
      await pool.end()
      await container.stop()
    },
  }
}
