import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { VisitorsController } from './visitors.controller'

@Module({
  imports: [AuthModule],
  controllers: [VisitorsController],
})
export class VisitorsModule {}
