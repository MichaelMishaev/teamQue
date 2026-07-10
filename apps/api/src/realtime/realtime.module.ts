/**
 * Realtime module (technical-prd §4/§5): the Socket.IO gateway, the single
 * broadcast choke point (SessionEventsService), and the auto-finish
 * scheduler. Imports AuthModule for JwtModule (gateway auth reuses
 * verifySessionToken, no duplicated secret handling), SnapshotModule for
 * the snapshot builder, and ActivityModule for the auto-finish activity
 * row. SessionEventsService is exported so every mutating module
 * (sessions/queue/matches/actions) can inject it and broadcast after its
 * own transaction commits.
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { SnapshotModule } from '../sessions/snapshot.module'
import { AutoFinishService } from './auto-finish.service'
import { SessionEventsService } from './session-events.service'
import { SessionGateway } from './session.gateway'

@Module({
  imports: [AuthModule, SnapshotModule, ActivityModule],
  providers: [SessionEventsService, SessionGateway, AutoFinishService],
  exports: [SessionEventsService],
})
export class RealtimeModule {}
