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
      await this.fieldsService.forceClose(row.id, row.createdBy, 'field.expired')
    }
    return stale.length
  }
}
