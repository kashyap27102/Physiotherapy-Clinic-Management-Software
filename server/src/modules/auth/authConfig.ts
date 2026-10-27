import { env } from '../../config/env.js'

/** Authentication tuning. Values marked Rec come from the PRD recommendations (AUTH-001, AUTH-002, BR-AUTH-1/2). */
export const authConfig = {
  /** BR-AUTH-1 (Rec): five failures in a row lock the account for 15 minutes. */
  maxFailedLogins: 5,
  lockMinutes: 15,

  /** AUTH-002 (Rec): 10 minute code, 5 attempts. Resend spacing and the hourly cap are additions. */
  otpMinutes: 10,
  otpMaxAttempts: 5,
  otpResendSeconds: 30,
  otpMaxPerHour: 5,

  /** AUTH-002 (Rec): a trusted device skips the code for 30 days. */
  deviceTrustDays: 30,

  /** AUTH-004: reset links work once and expire quickly. */
  resetMinutes: 30,
  resetMaxPerHour: 3,

  sessionIdleMinutes: env.SESSION_IDLE_MINUTES,
  sessionMaxHours: env.SESSION_MAX_HOURS,
  /** Writes to last_seen_at are skipped when the last one is newer than this. */
  sessionTouchSeconds: 60,

  sessionCookie: 'sid',
  deviceCookie: 'did',
  cookiePath: '/api/v1',
} as const

export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR
