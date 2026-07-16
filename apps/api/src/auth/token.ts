/**
 * JWT payload shapes, cookie names/options, and sign/verify helpers for the
 * two auth cookies (technical-prd §6): `qlm_center` (90d, device unlock) and
 * `qlm_session` (12h, staff login). Both are httpOnly, sameSite=Lax, secure
 * in production, path '/'. Centralised here so the controller (signs) and
 * the guards (verify) can't drift on cookie name, payload shape, or TTL.
 */
import type { JwtService } from '@nestjs/jwt'
import type { CookieOptions } from 'express'
import type { StaffRole } from 'shared'

export const CENTER_COOKIE_NAME = 'qlm_center'
export const SESSION_COOKIE_NAME = 'qlm_session'

const CENTER_TOKEN_TTL = '90d'
const SESSION_TOKEN_TTL = '12h'

export const CENTER_COOKIE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
export const SESSION_COOKIE_MAX_AGE_MS = 12 * 60 * 60 * 1000

export type CenterTokenPayload = { centerId: string }
export type SessionTokenPayload = { staffId: string; centerId: string; role: StaffRole }

export function signCenterToken(jwtService: JwtService, payload: CenterTokenPayload): string {
  return jwtService.sign(payload, { expiresIn: CENTER_TOKEN_TTL })
}

export function signSessionToken(jwtService: JwtService, payload: SessionTokenPayload): string {
  return jwtService.sign(payload, { expiresIn: SESSION_TOKEN_TTL })
}

export function verifyCenterToken(jwtService: JwtService, token: string): CenterTokenPayload {
  return jwtService.verify<CenterTokenPayload>(token)
}

export function verifySessionToken(jwtService: JwtService, token: string): SessionTokenPayload {
  return jwtService.verify<SessionTokenPayload>(token)
}

const VISITOR_TOKEN_TTL = '365d'
export const VISITOR_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

/** Open-fields: visitors are long-lived identities in the SAME cookie/payload
 * shape as staff logins, so every existing guard verifies them unchanged. */
export function signVisitorToken(jwtService: JwtService, payload: SessionTokenPayload): string {
  return jwtService.sign(payload, { expiresIn: VISITOR_TOKEN_TTL })
}

export function cookieOptions(maxAgeMs: number, nodeEnv: string): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: nodeEnv === 'production',
    path: '/',
    maxAge: maxAgeMs,
  }
}
