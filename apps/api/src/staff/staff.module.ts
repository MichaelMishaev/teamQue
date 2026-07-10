/**
 * Staff module (technical-prd §7). Imports AuthModule to reuse CenterGuard
 * (and its JwtModule) without redeclaring JWT config.
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { StaffController } from './staff.controller'

@Module({
  imports: [AuthModule],
  controllers: [StaffController],
})
export class StaffModule {}
