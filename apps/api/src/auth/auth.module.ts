/**
 * Auth module (technical-prd §6). JwtModule's secret is loaded lazily via a
 * factory (mirrors DbModule's lazy loadEnv() call) so importing this module
 * doesn't require env vars to already be set. ThrottlerModule config is
 * only used by the center-unlock route (5 requests / 15 min / IP) — it is
 * NOT bound globally, so other routes are unaffected (see AuthController).
 * CenterGuard/StaffSessionGuard/RolesGuard are exported so StaffModule (and
 * later Phase 3 modules) can reuse them without redeclaring JwtModule.
 */
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { loadEnv } from '../config/env'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { CenterGuard } from './guards/center.guard'
import { PUBLIC_LINE_HOST_TOKEN, PublicLineReadGuard } from './guards/public-line-read.guard'
import { RolesGuard } from './guards/roles.guard'
import { StaffSessionGuard } from './guards/staff-session.guard'

@Module({
  imports: [
    JwtModule.registerAsync({ useFactory: () => ({ secret: loadEnv().SESSION_SECRET }) }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 15 * 60 * 1000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    CenterGuard,
    StaffSessionGuard,
    PublicLineReadGuard,
    RolesGuard,
    ThrottlerGuard,
    { provide: PUBLIC_LINE_HOST_TOKEN, useFactory: () => process.env.PUBLIC_LINE_HOST },
  ],
  exports: [JwtModule, CenterGuard, StaffSessionGuard, PublicLineReadGuard, RolesGuard],
})
export class AuthModule {}
