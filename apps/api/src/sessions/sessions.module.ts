/**
 * Sessions module (technical-prd §7). Imports AuthModule for
 * StaffSessionGuard/RolesGuard and ActivityModule for the same-transaction
 * activity_log writer (N-12).
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { SessionsController } from './sessions.controller'
import { SessionsService } from './sessions.service'
import { SnapshotService } from './snapshot.service'

@Module({
  imports: [AuthModule, ActivityModule],
  controllers: [SessionsController],
  providers: [SessionsService, SnapshotService],
})
export class SessionsModule {}
