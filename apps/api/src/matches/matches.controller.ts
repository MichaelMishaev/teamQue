/**
 * Match lifecycle endpoints (technical-prd §7): pause/resume/extend/finish/
 * replay a single match, addressed by its own id.
 */
import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { extendMatchSchema, matchIdSchema, type ExtendMatchBody, type FinishMatchResult, type MatchView, type QueueEntryView } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { MatchesService } from './matches.service'

@Controller('matches')
@UseGuards(StaffSessionGuard)
export class MatchesController {
  constructor(@Inject(MatchesService) private readonly matchesService: MatchesService) {}

  @Post(':id/pause')
  async pause(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(matchIdSchema)) id: string,
  ): Promise<MatchView> {
    return this.matchesService.pause(req.centerId, req.staff.staffId, id)
  }

  @Post(':id/resume')
  async resume(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(matchIdSchema)) id: string,
  ): Promise<MatchView> {
    return this.matchesService.resume(req.centerId, req.staff.staffId, id)
  }

  @Post(':id/extend')
  async extend(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(matchIdSchema)) id: string,
    @Body(new ZodValidationPipe(extendMatchSchema)) body: ExtendMatchBody,
  ): Promise<MatchView> {
    return this.matchesService.extend(req.centerId, req.staff.staffId, id, body)
  }

  @Post(':id/finish')
  async finish(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(matchIdSchema)) id: string,
  ): Promise<FinishMatchResult> {
    return this.matchesService.finish(req.centerId, req.staff.staffId, id)
  }

  @Post(':id/replay')
  async replay(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(matchIdSchema)) id: string,
  ): Promise<QueueEntryView[]> {
    return this.matchesService.replay(req.centerId, req.staff.staffId, id)
  }
}
