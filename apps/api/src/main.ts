import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { loadEnv } from './config/env'
import { publicLineHostGuard } from './public-line-host.middleware'

async function bootstrap(): Promise<void> {
  const env = loadEnv()

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  // Railway sits in front of this app as a single reverse proxy — without
  // this, Express's req.ip (and ThrottlerGuard, which keys on it) sees the
  // proxy's address for every request, collapsing all per-IP throttle
  // buckets (POST /fields, POST /visitors) into one shared app-wide bucket.
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cookieParser())
  app.use(publicLineHostGuard(env.PUBLIC_LINE_HOST))
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })
  app.enableShutdownHooks()

  await app.listen(env.PORT)
}

void bootstrap()
