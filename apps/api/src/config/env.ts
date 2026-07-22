/**
 * Env validation (technical-prd §11). Fail closed: missing/invalid env
 * logs a clear error via pino and exits the process rather than booting
 * with an undefined configuration.
 */
import pino from 'pino'
import { z } from 'zod'

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().min(1, 'WEB_ORIGIN is required'),
  // Hostname of the anonymous public QR-code surface (e.g. line.maple-group.info).
  // When set, publicLineHostGuard restricts that host to the read-only /line
  // route; unset in environments with no separate public domain (e.g. local dev).
  PUBLIC_LINE_HOST: z.string().min(1).optional(),
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)

  if (!result.success) {
    pino().error({ issues: result.error.issues }, 'Invalid environment configuration')
    process.exit(1)
  }

  return result.data
}
