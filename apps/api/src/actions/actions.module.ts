/**
 * Actions module (undo). Imports AuthModule for StaffSessionGuard,
 * ActivityModule for the same-transaction activity_log writer (N-12), and
 * RealtimeModule so a successful undo broadcasts the restored session.
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { ActionsController } from './actions.controller'
import { UndoService } from './undo.service'

@Module({
  imports: [AuthModule, ActivityModule, RealtimeModule],
  controllers: [ActionsController],
  providers: [UndoService],
})
export class ActionsModule {}
