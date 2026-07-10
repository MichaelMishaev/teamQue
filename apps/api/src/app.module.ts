import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { ActionsModule } from './actions/actions.module'
import { AuthModule } from './auth/auth.module'
import { CaptainsModule } from './captains/captains.module'
import { HttpExceptionFilter } from './common/http-exception.filter'
import { DbModule } from './db/db.module'
import { HealthController } from './health/health.controller'
import { MatchesModule } from './matches/matches.module'
import { QueueModule } from './queue/queue.module'
import { SessionsModule } from './sessions/sessions.module'
import { StaffModule } from './staff/staff.module'

@Module({
  imports: [
    LoggerModule.forRoot(),
    DbModule,
    AuthModule,
    StaffModule,
    CaptainsModule,
    SessionsModule,
    QueueModule,
    MatchesModule,
    ActionsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
