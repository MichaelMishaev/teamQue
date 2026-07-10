/**
 * Auth business logic (technical-prd §6): center-PIN unlock, staff-PIN
 * login with progressive lockout, and the /auth/me lookup. Covered by
 * integration tests (test/auth.int.test.ts) against a real Postgres —
 * the interesting behavior here is inseparable from DB state (lockout
 * counters, active/center-membership checks).
 *
 * Every constructor param is @Inject()'d explicitly: `tsx` (pnpm dev) and
 * plain Vite/esbuild don't reliably emit `design:paramtypes` for classes in
 * OUR source files (regardless of whether the injected type is ours or a
 * library's) — that's what implicit type-based DI relies on. An explicit
 * token sidesteps it entirely. Precompiled library classes' OWN internal
 * constructors (e.g. ThrottlerGuard's) are unaffected — only classes we
 * write and that get re-transpiled need this.
 */
import { Inject, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { verify } from '@node-rs/argon2'
import { and, eq, sql } from 'drizzle-orm'
import type { StaffRole } from 'shared'
import { UnauthorizedError } from '../common/errors'
import { DRIZZLE, type Database } from '../db/db.module'
import { centers, staff } from '../db/schema'
import { PinLockedError } from './errors'
import { lockoutDurationSec } from './lockout'
import { signCenterToken, signSessionToken } from './token'

export type UnlockCenterResult = { centerId: string; name: string; token: string }
export type LoginResult = { staffId: string; name: string; role: StaffRole; token: string }
export type MeResult = {
  staff: { id: string; name: string; role: StaffRole }
  center: { id: string; name: string }
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(JwtService) private readonly jwtService: JwtService,
  ) {}

  /** MVP: exactly one center row exists — take it. No row -> 401 (404-safe). */
  async unlockCenter(pin: string): Promise<UnlockCenterResult> {
    const [center] = await this.db.select().from(centers).limit(1)
    if (!center || !(await verify(center.pinHash, pin))) {
      throw new UnauthorizedError()
    }

    const token = signCenterToken(this.jwtService, { centerId: center.id })
    return { centerId: center.id, name: center.name, token }
  }

  async login(centerId: string, staffId: string, pin: string): Promise<LoginResult> {
    const [member] = await this.db
      .select()
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.centerId, centerId), eq(staff.active, true)))
      .limit(1)

    // Fail closed without revealing which check failed (unknown id, wrong
    // center, or inactive staff all look identical to the caller).
    if (!member) throw new UnauthorizedError()

    const now = new Date()
    if (member.lockedUntil && member.lockedUntil.getTime() > now.getTime()) {
      const retryAfterSec = Math.ceil((member.lockedUntil.getTime() - now.getTime()) / 1000)
      throw new PinLockedError(retryAfterSec)
    }

    if (!(await verify(member.pinHash, pin))) {
      await this.recordFailedAttempt(member.id, now)
      throw new UnauthorizedError()
    }

    await this.db.update(staff).set({ failedAttempts: 0, lockedUntil: null }).where(eq(staff.id, member.id))

    // pgEnum values are widened to `string` by drizzle (see schema.ts comment);
    // the column only ever holds values from staffRoleSchema.
    const role = member.role as StaffRole
    const token = signSessionToken(this.jwtService, { staffId: member.id, centerId, role })
    return { staffId: member.id, name: member.name, role, token }
  }

  async me(staffId: string, centerId: string): Promise<MeResult> {
    const [member] = await this.db
      .select({ id: staff.id, name: staff.name, role: staff.role })
      .from(staff)
      .where(and(eq(staff.id, staffId), eq(staff.centerId, centerId)))
      .limit(1)
    if (!member) throw new UnauthorizedError()

    const [center] = await this.db
      .select({ id: centers.id, name: centers.name })
      .from(centers)
      .where(eq(centers.id, centerId))
      .limit(1)
    if (!center) throw new UnauthorizedError()

    return { staff: { ...member, role: member.role as StaffRole }, center }
  }

  /**
   * Atomic increment (`failed_attempts = failed_attempts + 1 RETURNING`) —
   * Postgres row-level locking serializes concurrent callers, so N
   * concurrent wrong-PIN requests each get a distinct, correct count
   * instead of collapsing into +1 (see test/auth.int.test.ts's race test).
   * The lockout write is a second, separately-guarded UPDATE: it only
   * applies `WHERE failed_attempts` still equals the value just returned,
   * so a slower request computing an earlier (shorter) lockout can never
   * clobber a longer one already set by a request that reached a higher count.
   */
  private async recordFailedAttempt(memberId: string, now: Date): Promise<void> {
    const [updated] = await this.db
      .update(staff)
      .set({ failedAttempts: sql`${staff.failedAttempts} + 1` })
      .where(eq(staff.id, memberId))
      .returning({ failedAttempts: staff.failedAttempts })
    if (!updated) return

    const lockSec = lockoutDurationSec(updated.failedAttempts)
    if (lockSec <= 0) return

    await this.db
      .update(staff)
      .set({ lockedUntil: new Date(now.getTime() + lockSec * 1000) })
      .where(and(eq(staff.id, memberId), eq(staff.failedAttempts, updated.failedAttempts)))
  }
}
