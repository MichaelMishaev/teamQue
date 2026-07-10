import { Module } from '@nestjs/common'
import { APP_FILTER } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { AuthModule } from './auth/auth.module'
import { HttpExceptionFilter } from './common/http-exception.filter'
import { DbModule } from './db/db.module'
import { HealthController } from './health/health.controller'
import { StaffModule } from './staff/staff.module'

@Module({
  imports: [LoggerModule.forRoot(), DbModule, AuthModule, StaffModule],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class AppModule {}
