/**
 * Sessions endpoints (technical-prd §7, features-prd US-010/011/012).
 * Open-fields pivot (docs/superpowers/specs/2026-07-16-open-fields-design.md):
 * the whole app is open, so open/update/close no longer require the
 * manager role — any resolved identity (including a visitor) may call them.
 */
import { Body, Controller, Get, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import {
  openSessionSchema,
  sessionIdSchema,
  updateSessionSchema,
  type OpenSessionBody,
  type SessionSnapshot,
  type UpdateSessionBody,
} from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { SessionsService, type SessionView } from './sessions.service'
import { SnapshotService } from './snapshot.service'

@Controller('sessions')
@UseGuards(StaffSessionGuard)
export class SessionsController {
  constructor(
    // @Inject explicitly: see the note atop auth/auth.service.ts.
    @Inject(SessionsService) private readonly sessionsService: SessionsService,
    @Inject(SnapshotService) private readonly snapshotService: SnapshotService,
  ) {}

  @Get('active')
  async active(@Req() req: StaffAuthenticatedRequest): Promise<SessionSnapshot> {
    return this.snapshotService.buildActiveSnapshot(req.centerId)
  }

  @Post()
  async open(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(openSessionSchema)) body: OpenSessionBody,
  ): Promise<SessionView> {
    return this.sessionsService.open(req.centerId, req.staff.staffId, body)
  }

  @Patch(':id')
  async update(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateSessionSchema)) body: UpdateSessionBody,
  ): Promise<SessionView> {
    return this.sessionsService.update(req.centerId, req.staff.staffId, id, body)
  }

  @Post(':id/close')
  async close(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
  ): Promise<SessionView> {
    return this.sessionsService.close(req.centerId, req.staff.staffId, id)
  }
}
