/**
 * Captains endpoints (technical-prd §7, features-prd US-020..023). All
 * behind StaffSessionGuard — no manager-only routes here (any staff can
 * search/create/edit captains).
 */
import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import {
  captainIdSchema,
  createCaptainSchema,
  updateCaptainSchema,
  type CaptainSearchResult,
  type CreateCaptainBody,
  type UpdateCaptainBody,
} from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { CaptainsService } from './captains.service'

@Controller('captains')
@UseGuards(StaffSessionGuard)
export class CaptainsController {
  // @Inject explicitly: see the note atop auth/auth.service.ts.
  constructor(@Inject(CaptainsService) private readonly captainsService: CaptainsService) {}

  @Get()
  async search(@Req() req: StaffAuthenticatedRequest, @Query('q') q?: string): Promise<CaptainSearchResult[]> {
    return this.captainsService.search(req.centerId, q ?? '')
  }

  @Post()
  async create(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(createCaptainSchema)) body: CreateCaptainBody,
  ): Promise<CaptainSearchResult> {
    return this.captainsService.create(req.centerId, req.staff.staffId, body)
  }

  @Patch(':id')
  async update(
    @Req() req: StaffAuthenticatedRequest,
    @Param('id', new ZodValidationPipe(captainIdSchema)) id: string,
    @Body(new ZodValidationPipe(updateCaptainSchema)) body: UpdateCaptainBody,
  ): Promise<CaptainSearchResult> {
    return this.captainsService.update(req.centerId, req.staff.staffId, id, body)
  }
}
