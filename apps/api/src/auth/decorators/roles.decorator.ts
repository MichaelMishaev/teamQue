/**
 * @Roles(...) metadata consumed by RolesGuard (technical-prd §6).
 */
import { SetMetadata } from '@nestjs/common'
import type { StaffRole } from 'shared'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: StaffRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles)
