/**
 * Single responsibility: persist bounded public-line visit aggregates in the
 * durable activity log. Ownership is resolved from the field slug on the
 * server; the client cannot choose a center/session or attach player data.
 */
import { Inject, Injectable } from '@nestjs/common'
import { and, eq } from 'drizzle-orm'
import type { PublicLineTelemetryEvent } from 'shared'
import { NotFoundError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { activityLog, fields, sessions } from '../db/schema'

const PUBLIC_COURT_NAME = 'כיכר העצמאות, מגרש 1'

@Injectable()
export class PublicLineTelemetryWriter {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async write(centerId: string, slug: string, event: PublicLineTelemetryEvent): Promise<void> {
    const [scope] = await this.db
      .select({ centerId: sessions.centerId, sessionId: sessions.id })
      .from(sessions)
      .innerJoin(fields, eq(fields.sessionId, sessions.id))
      .where(
        and(
          eq(sessions.centerId, centerId),
          eq(sessions.slug, slug),
          eq(sessions.status, 'active'),
          eq(fields.position, 0),
          eq(fields.name, PUBLIC_COURT_NAME),
        ),
      )
      .limit(1)

    if (!scope) throw new NotFoundError('Public line not found')

    await this.db.insert(activityLog).values({
      centerId: scope.centerId,
      sessionId: scope.sessionId,
      staffId: null,
      action: event.type === 'viewed' ? 'public_line.viewed' : 'public_line.visit_ended',
      entityType: 'public_line_visit',
      entityId: event.visitId,
      beforeJson: null,
      afterJson: event,
      createdAt: new Date(),
    })
  }
}
