import { join } from 'node:path'
import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { ServeStaticModule } from '@nestjs/serve-static'
import { LoggerModule } from 'nestjs-pino'
import { ActionsModule } from './actions/actions.module'
import { AuthModule } from './auth/auth.module'
import { CaptainsModule } from './captains/captains.module'
import { HttpExceptionFilter } from './common/http-exception.filter'
import { DbModule } from './db/db.module'
import { HealthController } from './health/health.controller'
import { MatchesModule } from './matches/matches.module'
import { QueueModule } from './queue/queue.module'
import { ReadsModule } from './reads/reads.module'
import { RealtimeModule } from './realtime/realtime.module'
import { SessionsModule } from './sessions/sessions.module'
import { StaffModule } from './staff/staff.module'

@Module({
  imports: [
    LoggerModule.forRoot(),
    ScheduleModule.forRoot(),
    // Single-service deploy: serve the built web SPA at '/' (same-origin as the
    // API + socket, so SameSite=Lax cookies work with no CORS). API routes stay
    // at root and are excluded here so they reach their controllers; everything
    // else falls through to index.html. WEB_DIST_PATH overrides the location.
    ServeStaticModule.forRoot({
      rootPath: process.env.WEB_DIST_PATH ?? join(__dirname, '..', '..', 'web', 'dist'),
      exclude: [
        '/auth/{*path}',
        '/staff/{*path}',
        '/captains/{*path}',
        '/sessions/{*path}',
        '/matches/{*path}',
        '/line/{*path}',
        '/actions/{*path}',
        '/activity/{*path}',
        '/health',
        '/socket.io/{*path}',
      ],
    }),
    DbModule,
    AuthModule,
    StaffModule,
    CaptainsModule,
    SessionsModule,
    QueueModule,
    MatchesModule,
    ActionsModule,
    ReadsModule,
    RealtimeModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
