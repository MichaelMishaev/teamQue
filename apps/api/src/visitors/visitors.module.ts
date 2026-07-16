import { Module } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import { AuthModule } from '../auth/auth.module'
import { VisitorsController } from './visitors.controller'

// ThrottlerGuard is a local provider rather than a ThrottlerModule.forRoot()
// import — AuthModule already registers ThrottlerModule.forRoot() as a
// @Global() module (see fields.module.ts for the fuller explanation), so this
// just needs its own guard instance to `@UseGuards` on POST /visitors.
@Module({
  imports: [AuthModule],
  providers: [ThrottlerGuard],
  controllers: [VisitorsController],
})
export class VisitorsModule {}
