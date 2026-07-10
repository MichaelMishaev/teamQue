/**
 * Actions module (undo). Imports AuthModule for StaffSessionGuard and
 * ActivityModule for the same-transaction activity_log writer (N-12).
 */
import { Module } from '@nestjs/common'
import { ActivityModule } from '../activity/activity.module'
import { AuthModule } from '../auth/auth.module'
import { ActionsController } from './actions.controller'
import { UndoService } from './undo.service'

@Module({
  imports: [AuthModule, ActivityModule],
  controllers: [ActionsController],
  providers: [UndoService],
})
export class ActionsModule {}
