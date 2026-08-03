/**
 * Auth endpoints (technical-prd §6/§7).
 */
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Throttle, ThrottlerGuard } from '@nestjs/throttler'
import type { Request, Response } from 'express'
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
  TRUSTED_DEVICE_SESSION_COOKIE_MAX_AGE_MS,
  cookieOptions,
  verifyCenterToken,
} from './token'

const CENTER_THROTTLE = { default: { limit: 5, ttl: 15 * 60 * 1000 } }

@Controller('auth')
export class AuthController {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

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

  @Post('device')
  async loginTrustedDevice(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ staffId: string; role: string }> {
    // Open manager entry — no center PIN. Optional center cookie still scopes
    // multi-center fixtures; otherwise the sole center row is used.
    const result = await this.authService.loginTrustedManagerDevice(optionalCenterId(this.jwtService, req))
    const nodeEnv = loadEnv().NODE_ENV
    // Both cookies: StaffSessionGuard extends CenterGuard and requires qlm_center.
    res.cookie(CENTER_COOKIE_NAME, result.centerToken, cookieOptions(CENTER_COOKIE_MAX_AGE_MS, nodeEnv))
    res.cookie(
      SESSION_COOKIE_NAME,
      result.token,
      cookieOptions(TRUSTED_DEVICE_SESSION_COOKIE_MAX_AGE_MS, nodeEnv),
    )
    return { staffId: result.staffId, role: result.role }
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

/** Best-effort center cookie read — invalid/missing cookies fall through to open sole-center auth. */
function optionalCenterId(jwtService: JwtService, req: Request): string | undefined {
  const token = req.cookies?.[CENTER_COOKIE_NAME] as string | undefined
  if (!token) return undefined
  try {
    const payload = verifyCenterToken(jwtService, token)
    return payload.centerId || undefined
  } catch {
    return undefined
  }
}
