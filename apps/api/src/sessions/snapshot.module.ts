/**
 * SnapshotService in its own module (technical-prd §5) so both SessionsModule
 * (GET /sessions/active) and RealtimeModule (gateway + broadcast) can import
 * it without a cycle — RealtimeModule needs the snapshot builder, and
 * SessionsModule needs RealtimeModule's SessionEventsService to broadcast
 * after open/update/close.
 */
import { Module } from '@nestjs/common'
import { SnapshotService } from './snapshot.service'

@Module({
  providers: [SnapshotService],
  exports: [SnapshotService],
})
export class SnapshotModule {}
