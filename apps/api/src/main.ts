import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { Logger } from 'nestjs-pino'
import { AppModule } from './app.module'
import { loadEnv } from './config/env'

async function bootstrap(): Promise<void> {
  const env = loadEnv()

  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  app.useLogger(app.get(Logger))
  app.use(helmet())
  app.use(cookieParser())
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true })

  await app.listen(env.PORT)
}

void bootstrap()
