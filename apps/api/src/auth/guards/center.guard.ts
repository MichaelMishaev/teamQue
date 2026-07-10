/**
 * CenterGuard (technical-prd §6): requires a valid qlm_center JWT, else 401
 * UNAUTHORIZED (fail closed, R-16). On success attaches req.centerId.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { UnauthorizedError } from '../../common/errors'
import { CENTER_COOKIE_NAME, verifyCenterToken } from '../token'

@Injectable()
export class CenterGuard implements CanActivate {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(@Inject(JwtService) protected readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const token = request.cookies?.[CENTER_COOKIE_NAME] as string | undefined
    if (!token) throw new UnauthorizedError()

    const payload = this.readCenterPayload(token)
    if (!payload.centerId) throw new UnauthorizedError()

    request.centerId = payload.centerId
    return true
  }

  private readCenterPayload(token: string): { centerId: string } {
    try {
      return verifyCenterToken(this.jwtService, token)
    } catch {
      throw new UnauthorizedError()
    }
  }
}
