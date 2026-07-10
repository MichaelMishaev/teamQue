/**
 * Sessions endpoints (technical-prd §7, features-prd US-010/011/012).
 * Open/update/close are manager-only (@Roles('manager')); active-session
 * read is any authenticated staff.
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
import { Roles } from '../auth/decorators/roles.decorator'
import { RolesGuard } from '../auth/guards/roles.guard'
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

  @UseGuards(RolesGuard)
  @Roles('manager')
  @Post()
  async open(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(openSessionSchema)) body: OpenSessionBody,
  ): Promise<SessionView> {
    return this.sessionsService.open(req.centerId, req.staff.staffId, body)
  }

  @UseGuards(RolesGuard)
  @Roles('manager')
  @Patch(':id')
  async update(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateSessionSchema)) body: UpdateSessionBody,
  ): Promise<SessionView> {
    return this.sessionsService.update(req.centerId, req.staff.staffId, id, body)
  }

  @UseGuards(RolesGuard)
  @Roles('manager')
  @Post(':id/close')
  async close(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
  ): Promise<SessionView> {
    return this.sessionsService.close(req.centerId, req.staff.staffId, id)
  }
}
