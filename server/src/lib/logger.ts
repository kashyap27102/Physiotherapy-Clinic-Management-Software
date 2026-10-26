import { pino } from 'pino'
import { env } from '../config/env.js'

// Patient data must never reach the logs (PRD NFR-010). Request bodies and query strings are not
// logged at all (see the request serializer in app.ts); these paths are a second safety net for
// anything logged by hand.
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.passwordHash',
  '*.token',
  '*.code',
  '*.otp',
  '*.phone',
  '*.fullName',
  '*.email',
]

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
})
