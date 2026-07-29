/**
 * StaffSessionGuard requires a valid center JWT plus a valid staff-session
 * JWT for that same center. Missing or inconsistent identity fails closed.
 */
import { Inject, Injectable, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { UnauthorizedError } from '../../common/errors'
import { SESSION_COOKIE_NAME, verifySessionToken } from '../token'
import { CenterGuard } from './center.guard'

@Injectable()
export class StaffSessionGuard extends CenterGuard {
  constructor(@Inject(JwtService) jwtService: JwtService) {
    super(jwtService)
  }

  override canActivate(context: ExecutionContext): boolean {
    super.canActivate(context)

    const request = context.switchToHttp().getRequest<Request>()
    const token = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined
    if (!token) throw new UnauthorizedError()

    try {
      const payload = verifySessionToken(this.jwtService, token)
      if (!payload.staffId || !payload.role || payload.role === 'visitor' || payload.centerId !== request.centerId) {
        throw new UnauthorizedError()
      }
      request.staff = {
        staffId: payload.staffId,
        centerId: payload.centerId,
        role: payload.role,
      }
      return true
    } catch {
      throw new UnauthorizedError()
    }
  }
}
