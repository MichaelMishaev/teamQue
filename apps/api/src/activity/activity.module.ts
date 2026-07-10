/**
 * Wraps ActivityWriter so captains/sessions (and later, matches) can inject
 * it without redeclaring a provider. Task 3c adds the read endpoint here.
 */
import { Module } from '@nestjs/common'
import { ActivityWriter } from './activity.writer'

@Module({
  providers: [ActivityWriter],
  exports: [ActivityWriter],
})
export class ActivityModule {}
