/**
 * Kickoff endpoint (technical-prd §7, line-manager model): pairs two teams
 * from the line onto the session's field, directly as a live match.
 */
import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { sessionIdSchema, startMatchSchema, type MatchView, type StartMatchBody } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { MatchesService } from './matches.service'

@Controller('sessions')
@UseGuards(StaffSessionGuard)
export class StartController {
  constructor(@Inject(MatchesService) private readonly matchesService: MatchesService) {}

  @Post(':id/start')
  async start(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
    @Body(new ZodValidationPipe(startMatchSchema)) body: StartMatchBody,
  ): Promise<MatchView> {
    return this.matchesService.start(req.centerId, req.staff.staffId, id, body)
  }
}
