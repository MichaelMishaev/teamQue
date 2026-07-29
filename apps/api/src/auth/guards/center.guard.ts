/**
 * CenterGuard: a valid qlm_center JWT is required and its centerId is attached
 * to the request. Missing, malformed, or incomplete tokens fail closed.
 */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { UnauthorizedError } from '../../common/errors'
import { CENTER_COOKIE_NAME, verifyCenterToken } from '../token'

@Injectable()
export class CenterGuard implements CanActivate {
  constructor(@Inject(JwtService) protected readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const token = request.cookies?.[CENTER_COOKIE_NAME] as string | undefined
    if (!token) throw new UnauthorizedError()

    try {
      const payload = verifyCenterToken(this.jwtService, token)
      if (!payload.centerId) throw new UnauthorizedError()
      request.centerId = payload.centerId
      return true
    } catch {
      throw new UnauthorizedError()
    }
  }
}
