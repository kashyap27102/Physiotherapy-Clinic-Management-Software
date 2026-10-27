import { z } from 'zod'

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),

  /** Optional while the API has no database-backed endpoints. Never log this value. */
  DATABASE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'must start with postgresql://')
      .optional(),
  ),

  /** Comma-separated list of browser origins allowed to call the API (the client app). */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  /** Set to "true" behind a reverse proxy such as Render so client IPs and secure cookies work. */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /** Resend API key. Without it the API still boots; sending email answers 503. Never log this value. */
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),

  /** Sender shown on every email, for example "Clinic Software <no-reply@yourdomain.com>". Must be a Resend-verified sender. */
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),

  /** Sessions end after this much inactivity (PRD BR-AUTH-2; the platform can change it). */
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
  /** Hard cap on a session's life, however active the user is. */
  SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(720).default(12),
  /** "none" is for a client served from a different site than the API; it forces Secure cookies. */
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  /** Where the client app lives; used to build password-reset links. Defaults to the first CORS origin. */
  APP_URL: z.preprocess(emptyToUndefined, z.url().optional()),
})

type Parsed = z.infer<typeof schema>
export type Env = Omit<Parsed, 'LOG_LEVEL'> & { LOG_LEVEL: NonNullable<Parsed['LOG_LEVEL']> }

/** Validates configuration once at startup so a bad setting fails fast with a clear message. */
export function loadEnv(source: NodeJS.ProcessEnv): Env {
  const result = schema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`)
  }
  const data = result.data
  const defaultLevel = data.NODE_ENV === 'test' ? 'silent' : data.NODE_ENV === 'production' ? 'info' : 'debug'
  return { ...data, LOG_LEVEL: data.LOG_LEVEL ?? defaultLevel }
}

export const env: Env = loadEnv(process.env)
