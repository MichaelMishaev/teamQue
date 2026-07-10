/**
 * The line's entry-scoped endpoints (technical-prd §7, line-manager model):
 * reposition one entry, or remove it. No sessionId in the path — the entry
 * carries its own (LineService.findOwnedEntry resolves it, center-scoped).
 */
import { Controller, Delete, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { queueEntryIdSchema, type QueueEntryView, type RemoveFromLineResult } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { LineService } from './line.service'

@Controller('line')
@UseGuards(StaffSessionGuard)
export class LineEntryController {
  constructor(@Inject(LineService) private readonly lineService: LineService) {}

  @Post(':entryId/move-top')
  async moveTop(
    @Req() req: StaffAuthenticatedRequest,
    @Param('entryId', new ZodValidationPipe(queueEntryIdSchema)) entryId: string,
  ): Promise<QueueEntryView> {
    return this.lineService.moveTop(req.centerId, req.staff.staffId, entryId)
  }

  @Post(':entryId/move-bottom')
  async moveBottom(
    @Req() req: StaffAuthenticatedRequest,
    @Param('entryId', new ZodValidationPipe(queueEntryIdSchema)) entryId: string,
  ): Promise<QueueEntryView> {
    return this.lineService.moveBottom(req.centerId, req.staff.staffId, entryId)
  }

  @Delete(':entryId')
  async remove(
    @Req() req: StaffAuthenticatedRequest,
    @Param('entryId', new ZodValidationPipe(queueEntryIdSchema)) entryId: string,
  ): Promise<RemoveFromLineResult> {
    return this.lineService.removeFromLine(req.centerId, req.staff.staffId, entryId)
  }
}
