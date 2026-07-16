/**
 * Fields module: mirrors sessions.module.ts's import set (AuthModule for
 * StaffSessionGuard, ActivityModule for the same-tx activity_log writer,
 * SnapshotModule for buildSnapshotBySessionId, RealtimeModule for
 * broadcast). ThrottlerGuard is declared as a local provider rather than
 * importing ThrottlerModule.forRoot again — AuthModule already registers
 * ThrottlerModule.forRoot as a `@Global()` module, so its ThrottlerStorage
 * and options are already available app-wide; a second forRoot() call here
 * would just re-register a conflicting 'default' throttler name. This just
 * needs its own ThrottlerGuard instance to `@UseGuards` on POST /fields,
 * same as AuthModule does for POST /auth/center.
 */
import { Module } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { RealtimeModule } from '../realtime/realtime.module'
import { SnapshotModule } from '../sessions/snapshot.module'
import { ExpiryService } from './expiry.service'
import { FieldsController } from './fields.controller'
import { FieldsService } from './fields.service'

@Module({
  imports: [AuthModule, ActivityModule, SnapshotModule, RealtimeModule],
  providers: [FieldsService, ExpiryService, ThrottlerGuard],
  controllers: [FieldsController],
  exports: [FieldsService],
})
export class FieldsModule {}
