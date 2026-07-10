/**
 * Captains module (technical-prd §7). Imports AuthModule for StaffSessionGuard
 * and ActivityModule for the same-transaction activity_log writer (N-12).
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { CaptainsController } from './captains.controller'
import { CaptainsService } from './captains.service'

@Module({
  imports: [AuthModule, ActivityModule],
  controllers: [CaptainsController],
  providers: [CaptainsService],
})
export class CaptainsModule {}
