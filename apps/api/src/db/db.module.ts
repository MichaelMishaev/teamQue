import { Global, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { loadEnv } from '../config/env'
import * as schema from './schema'

export const DRIZZLE = Symbol('DRIZZLE')

export type Database = NodePgDatabase<typeof schema>

/** The `tx` callback parameter type of `Database['transaction']` — used by
 * anything that writes inside a transaction (e.g. ActivityWriter, N-12). */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

@Injectable()
export class DbLifecycle implements OnApplicationShutdown {
  private pool: Pool | null = null

  setPool(pool: Pool): void {
    this.pool = pool
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.pool) {
      await this.pool.end()
    }
  }
}

@Global()
@Module({
  providers: [
    DbLifecycle,
    {
      provide: DRIZZLE,
      useFactory: (lifecycle: DbLifecycle): Database => {
        const env = loadEnv()
        const pool = new Pool({ connectionString: env.DATABASE_URL })
        lifecycle.setPool(pool)
        return drizzle(pool, { schema })
      },
      inject: [DbLifecycle],
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
