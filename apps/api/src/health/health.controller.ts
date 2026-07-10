import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import { DRIZZLE, type Database } from '../db/db.module'

@Controller('health')
export class HealthController {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: true }> {
    try {
      await this.db.execute(sql`SELECT 1`)
    } catch {
      throw new ServiceUnavailableException({ status: 'error', db: false })
    }

    return { status: 'ok', db: true }
  }
}
