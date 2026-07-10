/**
 * Matches module (technical-prd §7, line-manager model). Imports AuthModule
 * for StaffSessionGuard, ActivityModule for the same-transaction
 * activity_log writer (N-12), and RealtimeModule so every match mutation
 * can broadcast after committing. MatchesService talks to queue_entries
 * directly (kickoff consumes two entries, replay adds two) rather than
 * depending on QueueModule — keeps the two domains decoupled.
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { MatchesController } from './matches.controller'
import { MatchesService } from './matches.service'
import { StartController } from './start.controller'

@Module({
  imports: [AuthModule, ActivityModule, RealtimeModule],
  controllers: [StartController, MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
