import { Module } from '@nestjs/common'
import { LoggerModule } from 'nestjs-pino'
import { DbModule } from './db/db.module'
import { HealthController } from './health/health.controller'

@Module({
  imports: [LoggerModule.forRoot(), DbModule],
  controllers: [HealthController],
})
export class AppModule {}
