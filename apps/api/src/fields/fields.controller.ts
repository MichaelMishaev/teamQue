/**
 * Public fields surface (spec §4). POST /fields is the abuse edge of an
 * open app — it gets the strict throttler bucket (5/hour/IP), mirroring
 * AuthController's center-unlock pattern.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import { z } from 'zod'
import { createFieldSchema, type CreateFieldBody, type FieldListItem, type SessionSnapshot } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import type { StaffAuthenticatedRequest } from '../auth/request.types'
import { ZodValidationPipe } from '../common/zod.pipe'
import { FieldsService } from './fields.service'
import { SLUG_PATTERN } from './slug'

const slugParamSchema = z.string().regex(SLUG_PATTERN)

@Controller('fields')
@UseGuards(StaffSessionGuard)
export class FieldsController {
  constructor(@Inject(FieldsService) private readonly fieldsService: FieldsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 5 } })
  @Post()
  async create(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(createFieldSchema)) body: CreateFieldBody,
  ): Promise<{ slug: string; snapshot: SessionSnapshot }> {
    return this.fieldsService.create(req.centerId, req.staff.staffId, body)
  }

  @Get()
  async list(@Req() req: StaffAuthenticatedRequest): Promise<FieldListItem[]> {
    return this.fieldsService.list(req.centerId)
  }

  @Get(':slug')
  async resolve(
    @Req() req: StaffAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
  ): Promise<SessionSnapshot> {
    return this.fieldsService.resolve(slug, req.centerId)
  }

  @HttpCode(200)
  @Post(':slug/close')
  async close(
    @Req() req: StaffAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
  ): Promise<{ slug: string; status: 'closed' }> {
    return this.fieldsService.closeBySlug(slug, req.centerId, req.staff.staffId)
  }
}
