/** Daily 05:00 Jerusalem reset scheduler. The destructive transition itself
 * lives in FieldsService under the session advisory lock; this service only
 * finds sessions old enough for today's boundary and requests the transition. */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { and, eq, lt } from 'drizzle-orm'
import { currentJerusalemDailyResetAt } from 'shared'
import { DRIZZLE, type Database } from '../db/db.module'
import { sessions } from '../db/schema'
import { FieldsService } from './fields.service'

const RESET_SWEEP_INTERVAL_MS = 5_000

@Injectable()
export class DailyResetService {
  private readonly logger = new Logger(DailyResetService.name)

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(FieldsService) private readonly fieldsService: FieldsService,
  ) {}

  @Interval(RESET_SWEEP_INTERVAL_MS)
  async tick(): Promise<void> {
    await this.resetDueFields(new Date())
  }

  /** Reset fields created before today's 05:00 boundary. Before 05:00 there
   * is deliberately no catch-up for yesterday, so a warning is never
   * pre-empted by an almost-day-old missed run. */
  async resetDueFields(now: Date): Promise<number> {
    const resetAt = currentJerusalemDailyResetAt(now)
    if (now.getTime() < resetAt.getTime()) return 0

    const due = await this.db
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.status, 'active'), lt(sessions.createdAt, resetAt)))

    let resetCount = 0
    for (const row of due) {
      try {
        if (await this.fieldsService.dailyReset(row.id, resetAt)) resetCount += 1
      } catch (error) {
        this.logger.error(`Failed daily reset for session ${row.id}`, error instanceof Error ? error.stack : String(error))
      }
    }
    return resetCount
  }
}
