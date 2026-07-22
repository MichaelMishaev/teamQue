/**
 * Wraps ActivityWriter so captains/sessions (and later, matches) can inject
 * it without redeclaring a provider. Task 3c adds the read endpoint here.
 */
import { Module } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { AuthModule } from '../auth/auth.module'
import { ActivityWriter } from './activity.writer'
import { PublicLineTelemetryController } from './public-line-telemetry.controller'
import { PublicLineTelemetryWriter } from './public-line-telemetry.writer'

@Module({
  imports: [AuthModule],
  controllers: [PublicLineTelemetryController],
  providers: [ActivityWriter, PublicLineTelemetryWriter, ThrottlerGuard],
  exports: [ActivityWriter],
})
export class ActivityModule {}
