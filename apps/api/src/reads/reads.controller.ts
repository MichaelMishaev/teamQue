/**
 * Read endpoints (technical-prd §7): the activity feed and past sessions.
 * GET /activity is its own controller (no sessionId in the path — it's an
 * optional filter); the session-scoped reads live on SessionsReadController
 * (a second @Controller('sessions'), alongside SessionsController's
 * lifecycle routes and LineController's line routes).
 */
import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { sessionIdSchema, type ActivityEntry, type HistoryEntry, type SessionListItem, type SessionSummary } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { ReadsService } from './reads.service'

const activityQuerySchema = z.object({
  sessionId: sessionIdSchema.optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
})

const sessionsListQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
})

@Controller('activity')
@UseGuards(StaffSessionGuard)
export class ActivityController {
  constructor(@Inject(ReadsService) private readonly readsService: ReadsService) {}

  @Get()
  async list(
    @Req() req: StaffAuthenticatedRequest,
    @Query(new ZodValidationPipe(activityQuerySchema)) query: { sessionId?: string; limit?: number },
  ): Promise<ActivityEntry[]> {
    return this.readsService.activity(req.centerId, query.sessionId, query.limit ?? 50)
  }
}

@Controller('sessions')
@UseGuards(StaffSessionGuard)
export class SessionsReadController {
  constructor(@Inject(ReadsService) private readonly readsService: ReadsService) {}

  @Get()
  async list(
    @Req() req: StaffAuthenticatedRequest,
    @Query(new ZodValidationPipe(sessionsListQuerySchema)) query: { from?: string; to?: string },
  ): Promise<SessionListItem[]> {
    return this.readsService.sessionsList(req.centerId, query.from, query.to)
  }

  @Get(':id/history')
  async history(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
  ): Promise<HistoryEntry[]> {
    return this.readsService.history(req.centerId, id)
  }

  @Get(':id/summary')
  async summary(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
  ): Promise<SessionSummary> {
    return this.readsService.summary(req.centerId, id)
  }
}
