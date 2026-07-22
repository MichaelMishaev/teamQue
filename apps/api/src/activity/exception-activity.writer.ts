/**
 * Single responsibility: append a safe rejected/failed-request record after
 * the domain transaction has rolled back. Raw exception messages, stacks,
 * request bodies, cookies, and query values are deliberately never stored.
 */
import { Inject, Injectable } from '@nestjs/common'
import type { ActivityOutcome, ErrorCode } from 'shared'
import { DRIZZLE, type Database } from '../db/db.module'
import { activityLog } from '../db/schema'

export interface ExceptionActivityInput {
  centerId: string
  sessionId?: string
  staffId?: string
  outcome: Exclude<ActivityOutcome, 'success'>
  action: string
  statusCode: number
  errorCode: ErrorCode
  requestMethod: string
  requestPath: string
  correlationId: string
}

@Injectable()
export class ExceptionActivityWriter {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async write(entry: ExceptionActivityInput): Promise<void> {
    await this.db.insert(activityLog).values({
      centerId: entry.centerId,
      sessionId: entry.sessionId ?? null,
      staffId: entry.staffId ?? null,
      eventKind: 'exception',
      outcome: entry.outcome,
      action: entry.action,
      entityType: 'request',
      entityId: entry.correlationId,
      statusCode: entry.statusCode,
      errorCode: entry.errorCode,
      requestMethod: entry.requestMethod,
      requestPath: entry.requestPath,
      correlationId: entry.correlationId,
      beforeJson: null,
      afterJson: null,
      createdAt: new Date(),
    })
  }
}
