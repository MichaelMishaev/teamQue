/**
 * The line module (technical-prd §7, line-manager model). Imports AuthModule
 * for StaffSessionGuard, ActivityModule for the same-transaction
 * activity_log writer (N-12), and RealtimeModule so every line mutation can
 * broadcast after committing. LineService is exported so MatchesModule
 * (kickoff consumes two entries) and ActionsModule (undo restores one) can
 * reuse line.repo.ts's helpers alongside it.
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { LineEntryController } from './line-entry.controller'
import { LineController } from './line.controller'
import { LineService } from './line.service'

@Module({
  imports: [AuthModule, ActivityModule, RealtimeModule],
  controllers: [LineController, LineEntryController],
  providers: [LineService],
  exports: [LineService],
})
export class QueueModule {}
