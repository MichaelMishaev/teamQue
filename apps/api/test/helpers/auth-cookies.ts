/**
 * Test helper: mints qlm_center/qlm_session cookie values directly via a
 * throwaway JwtService using the SAME signing helpers as production code
 * (src/auth/token.ts) — so a cookie-name/payload/TTL change in source
 * can't silently drift from what tests send.
 *
 * Deliberately bypasses POST /auth/center for setup: that route is
 * IP-throttled (5/15min), and using it to build cookie jars for unrelated
 * tests would make those tests' pass/fail depend on unrelated call counts.
 * Only test/auth.int.test.ts's own center-unlock tests call it for real.
 */
import { JwtService } from '@nestjs/jwt'
import type { StaffRole } from 'shared'
import { CENTER_COOKIE_NAME, SESSION_COOKIE_NAME, signCenterToken, signSessionToken } from '../../src/auth/token'

export function makeTestJwtService(secret: string): JwtService {
  return new JwtService({ secret })
}

export function centerCookieHeader(jwtService: JwtService, centerId: string): string {
  const token = signCenterToken(jwtService, { centerId })
  return `${CENTER_COOKIE_NAME}=${token}`
}

export function sessionCookieHeader(
  jwtService: JwtService,
  payload: { staffId: string; centerId: string; role: StaffRole },
): string {
  const token = signSessionToken(jwtService, payload)
  return `${SESSION_COOKIE_NAME}=${token}`
}
