/**
 * The line's session-scoped endpoints (technical-prd §7, line-manager model):
 * add a team to the bottom, reorder the whole line.
 */
import { Body, Controller, Inject, Param, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { addToLineSchema, reorderLineSchema, sessionIdSchema, type AddToLineBody, type QueueEntryView, type ReorderLineBody, type ReorderLineResult } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { LineService } from './line.service'

@Controller('sessions')
@UseGuards(StaffSessionGuard)
export class LineController {
  constructor(@Inject(LineService) private readonly lineService: LineService) {}

  @Post(':id/line')
  async addToLine(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
    @Body(new ZodValidationPipe(addToLineSchema)) body: AddToLineBody,
  ): Promise<QueueEntryView> {
    return this.lineService.addToLine(req.centerId, req.staff.staffId, id, body)
  }

  @Patch(':id/line')
  async reorderLine(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(sessionIdSchema)) id: string,
    @Body(new ZodValidationPipe(reorderLineSchema)) body: ReorderLineBody,
  ): Promise<ReorderLineResult> {
    return this.lineService.reorderLine(req.centerId, req.staff.staffId, id, body)
  }
}
