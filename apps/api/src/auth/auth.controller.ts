/**
 * Auth endpoints (technical-prd §6/§7).
 */
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Response } from 'express'
import { centerUnlockSchema, loginSchema, type CenterUnlockBody, type LoginBody } from 'shared'
import { ZodValidationPipe } from '../common/zod.pipe'
import { loadEnv } from '../config/env'
import { AuthService, type MeResult } from './auth.service'
import { CenterGuard } from './guards/center.guard'
import { StaffSessionGuard } from './guards/staff-session.guard'
import type { CenterAuthenticatedRequest, StaffAuthenticatedRequest } from './request.types'
import {
  CENTER_COOKIE_MAX_AGE_MS,
  CENTER_COOKIE_NAME,
  SESSION_COOKIE_MAX_AGE_MS,
  SESSION_COOKIE_NAME,
  cookieOptions,
} from './token'

const CENTER_THROTTLE = { default: { limit: 5, ttl: 15 * 60 * 1000 } }

@Controller('auth')
export class AuthController {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle(CENTER_THROTTLE)
  @Post('center')
  async unlockCenter(
    @Body(new ZodValidationPipe(centerUnlockSchema)) body: CenterUnlockBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ centerId: string; name: string }> {
    const result = await this.authService.unlockCenter(body.pin)
    const nodeEnv = loadEnv().NODE_ENV
    res.cookie(CENTER_COOKIE_NAME, result.token, cookieOptions(CENTER_COOKIE_MAX_AGE_MS, nodeEnv))
    return { centerId: result.centerId, name: result.name }
  }

  @UseGuards(CenterGuard)
  @Post('login')
  async login(
    @Req() req: CenterAuthenticatedRequest,
    @Body(new ZodValidationPipe(loginSchema)) body: LoginBody,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ staffId: string; name: string; role: string }> {
    const result = await this.authService.login(req.centerId, body.staffId, body.pin)
    const nodeEnv = loadEnv().NODE_ENV
    res.cookie(SESSION_COOKIE_NAME, result.token, cookieOptions(SESSION_COOKIE_MAX_AGE_MS, nodeEnv))
    return { staffId: result.staffId, name: result.name, role: result.role }
  }

  @UseGuards(StaffSessionGuard)
  @HttpCode(204)
  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' })
  }

  @UseGuards(StaffSessionGuard)
  @Get('me')
  async me(@Req() req: StaffAuthenticatedRequest): Promise<MeResult> {
    return this.authService.me(req.staff.staffId, req.staff.centerId)
  }
}
