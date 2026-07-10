/**
 * Express Request augmentation for guard-attached auth context
 * (technical-prd §6: CenterGuard attaches req.centerId, StaffSessionGuard
 * additionally attaches req.staff).
 */
import type { Request } from 'express'
import type { StaffRole } from 'shared'

export type StaffAuthContext = { staffId: string; centerId: string; role: StaffRole }

declare global {
  namespace Express {
    interface Request {
      centerId?: string
      staff?: StaffAuthContext
    }
  }
}

/** `@Req()` parameter type for routes guarded by CenterGuard (or stronger). */
export type CenterAuthenticatedRequest = Request & { centerId: string }

/** `@Req()` parameter type for routes guarded by StaffSessionGuard. */
export type StaffAuthenticatedRequest = Request & { staff: StaffAuthContext; centerId: string }
