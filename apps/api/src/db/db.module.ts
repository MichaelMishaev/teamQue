import { Global, Module } from '@nestjs/common'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { loadEnv } from '../config/env'
import * as schema from './schema'

export const DRIZZLE = Symbol('DRIZZLE')

export type Database = NodePgDatabase<typeof schema>

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: (): Database => {
        const env = loadEnv()
        const pool = new Pool({ connectionString: env.DATABASE_URL })
        return drizzle(pool, { schema })
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DbModule {}
