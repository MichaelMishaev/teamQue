/** Enforces the optional per-field access code for the staff console. */
import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import { fieldAccessCookieName, verifyFieldAccessToken } from '../auth/token'
import { ForbiddenError } from '../common/errors'
import { FieldsService } from './fields.service'

@Injectable()
export class FieldAccessGuard implements CanActivate {
  constructor(
    @Inject(FieldsService) private readonly fieldsService: FieldsService,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { centerId?: string }>()
    // The player-facing host stays read-only and public by product design.
    if (request.hostname === process.env.PUBLIC_LINE_HOST) return true

    const slug = request.params.slug
    const centerId = request.centerId
    if (typeof slug !== 'string' || centerId === undefined || !(await this.fieldsService.isPasswordProtected(slug, centerId))) return true

    const token = request.cookies?.[fieldAccessCookieName(slug)] as string | undefined
    if (!token) throw new ForbiddenError('Field password required')
    try {
      const payload = verifyFieldAccessToken(this.jwtService, token)
      if (payload.scope !== 'field-access' || payload.slug !== slug || payload.centerId !== centerId) throw new ForbiddenError('Field password required')
      return true
    } catch {
      throw new ForbiddenError('Field password required')
    }
  }
}
