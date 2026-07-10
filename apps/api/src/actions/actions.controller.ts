/**
 * Undo endpoint (technical-prd §7).
 */
import { Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { activityIdSchema, type UndoResult } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { UndoService } from './undo.service'

@Controller('actions')
@UseGuards(StaffSessionGuard)
export class ActionsController {
  constructor(@Inject(UndoService) private readonly undoService: UndoService) {}

  @Post(':activityId/undo')
  async undo(
    @Req() req: StaffAuthenticatedRequest,
    @Param('activityId', new ZodValidationPipe(activityIdSchema)) activityId: string,
  ): Promise<UndoResult> {
    return this.undoService.undo(req.centerId, req.staff.staffId, activityId)
  }
}
