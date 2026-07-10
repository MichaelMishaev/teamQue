/**
 * Sessions module (technical-prd §7). Imports AuthModule for
 * StaffSessionGuard/RolesGuard, ActivityModule for the same-transaction
 * activity_log writer (N-12), SnapshotModule for GET /sessions/active, and
 * RealtimeModule so open/update/close can broadcast after committing.
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { SessionsController } from './sessions.controller'
import { SessionsService } from './sessions.service'
import { SnapshotModule } from './snapshot.module'

@Module({
  imports: [AuthModule, ActivityModule, SnapshotModule, RealtimeModule],
  controllers: [SessionsController],
  providers: [SessionsService],
})
export class SessionsModule {}
