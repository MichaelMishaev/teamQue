/**
 * StaffSessionGuard (technical-prd §6): implies CenterGuard's checks PLUS a
 * valid qlm_session JWT whose centerId matches the center cookie. Any
 * inconsistency -> 401 (fail closed, R-16). On success attaches req.staff.
 */
import { Inject, Injectable, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { UnauthorizedError } from '../../common/errors'
import { SESSION_COOKIE_NAME, verifySessionToken, type SessionTokenPayload } from '../token'
import { CenterGuard } from './center.guard'

@Injectable()
export class StaffSessionGuard extends CenterGuard {
  // @Inject explicitly: see the note atop auth.service.ts.
  constructor(@Inject(JwtService) jwtService: JwtService) {
    super(jwtService)
  }

  override canActivate(context: ExecutionContext): boolean {
    super.canActivate(context)

    const request = context.switchToHttp().getRequest<Request>()
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined
    if (!token) throw new UnauthorizedError()

    const payload = this.readSessionPayload(token)
    if (!payload.staffId || !payload.role || payload.centerId !== request.centerId) {
      throw new UnauthorizedError()
    }

    request.staff = { staffId: payload.staffId, centerId: payload.centerId, role: payload.role }
    return true
  }

  private readSessionPayload(token: string): SessionTokenPayload {
    try {
      return verifySessionToken(this.jwtService, token)
    } catch {
      throw new UnauthorizedError()
    }
  }
}
