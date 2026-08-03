/**
 * Public fields surface (spec §4). POST /fields is the abuse edge of an
 * open app — it gets the strict throttler bucket (5/hour/IP), mirroring
 * AuthController's center-unlock pattern.
 */
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Response } from 'express'
import { z } from 'zod'
import { createFieldSchema, type CreateFieldBody, type FieldListItem, type SessionSnapshot } from 'shared'
import { StaffSessionGuard } from '../auth/guards/staff-session.guard'
import { PublicLineReadGuard } from '../auth/guards/public-line-read.guard'
import { FIELD_ACCESS_COOKIE_MAX_AGE_MS, cookieOptions, fieldAccessCookieName, signFieldAccessToken, verifyFieldAccessToken } from '../auth/token'
import type { CenterAuthenticatedRequest, StaffAuthenticatedRequest } from '../auth/request.types'
import { ForbiddenError } from '../common/errors'
import { ZodValidationPipe } from '../common/zod.pipe'
import { loadEnv } from '../config/env'
import { FieldAccessGuard } from './field-access.guard'
import { FieldsService } from './fields.service'
import { SLUG_PATTERN } from './slug'

const slugParamSchema = z.string().regex(SLUG_PATTERN)
const fieldPasswordSchema = z.object({ password: z.string().regex(/^\d{4}$/) })

@Controller('fields')
export class FieldsController {
  constructor(
    @Inject(FieldsService) private readonly fieldsService: FieldsService,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  @UseGuards(ThrottlerGuard)
  @UseGuards(StaffSessionGuard)
  @Throttle({ default: { ttl: 60 * 60 * 1000, limit: 5 } })
  @Post()
  async create(
    @Req() req: StaffAuthenticatedRequest,
    @Body(new ZodValidationPipe(createFieldSchema)) body: CreateFieldBody,
  ): Promise<{ slug: string; snapshot: SessionSnapshot }> {
    return this.fieldsService.create(req.centerId, req.staff.staffId, body)
  }

  @Get()
  @UseGuards(PublicLineReadGuard)
  async list(@Req() req: CenterAuthenticatedRequest): Promise<FieldListItem[]> {
    return this.fieldsService.list(req.centerId)
  }

  @Get(':slug/access')
  @UseGuards(StaffSessionGuard)
  async accessStatus(
    @Req() req: StaffAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
  ): Promise<{ passwordRequired: boolean; granted: boolean }> {
    const passwordRequired = await this.fieldsService.isPasswordProtected(slug, req.centerId)
    return { passwordRequired, granted: !passwordRequired || this.hasAccess(slug, req.centerId, req) }
  }

  @Get(':slug')
  @UseGuards(PublicLineReadGuard, FieldAccessGuard)
  async resolve(
    @Req() req: CenterAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
  ): Promise<SessionSnapshot> {
    return this.fieldsService.resolve(slug, req.centerId)
  }

  @Post(':slug/access')
  @UseGuards(ThrottlerGuard, StaffSessionGuard)
  @Throttle({ default: { ttl: 15 * 60 * 1000, limit: 5 } })
  async unlock(
    @Req() req: StaffAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
    @Body(new ZodValidationPipe(fieldPasswordSchema)) body: { password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    if (!(await this.fieldsService.verifyPassword(slug, req.centerId, body.password))) throw new ForbiddenError('Field password required')
    this.grantAccess(res, slug, req.centerId)
    return { ok: true }
  }

  @HttpCode(200)
  @Post(':slug/close')
  @UseGuards(StaffSessionGuard, FieldAccessGuard)
  async close(
    @Req() req: StaffAuthenticatedRequest,
    @Param('slug', new ZodValidationPipe(slugParamSchema)) slug: string,
  ): Promise<{ slug: string; status: 'closed' }> {
    return this.fieldsService.closeBySlug(slug, req.centerId, req.staff.staffId)
  }

  private hasAccess(slug: string, centerId: string, req: StaffAuthenticatedRequest): boolean {
    const token = req.cookies?.[fieldAccessCookieName(slug)] as string | undefined
    if (!token) return false
    try {
      const payload = verifyFieldAccessToken(this.jwtService, token)
      return payload.scope === 'field-access' && payload.slug === slug && payload.centerId === centerId
    } catch {
      return false
    }
  }

  private grantAccess(res: Response, slug: string, centerId: string): void {
    const nodeEnv = loadEnv().NODE_ENV
    res.cookie(
      fieldAccessCookieName(slug),
      signFieldAccessToken(this.jwtService, { centerId, slug, scope: 'field-access' }),
      cookieOptions(FIELD_ACCESS_COOKIE_MAX_AGE_MS, nodeEnv),
    )
  }
}
