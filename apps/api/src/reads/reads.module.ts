/**
 * Reads module (technical-prd §7): activity feed, session history, past
 * sessions, session summary. Read-only — imports AuthModule for
 * StaffSessionGuard only (no ActivityModule; nothing here writes).
 */
import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { ActivityController, SessionsReadController } from './reads.controller'
import { ReadsService } from './reads.service'

@Module({
  imports: [AuthModule],
  controllers: [ActivityController, SessionsReadController],
  providers: [ReadsService],
})
export class ReadsModule {}
