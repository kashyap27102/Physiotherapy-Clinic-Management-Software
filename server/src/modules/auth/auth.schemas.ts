import { z } from 'zod'
import { PASSWORD_MAX_LENGTH } from './password.js'

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email({ error: 'Enter a valid email address.' }))

/** Login accepts any non-empty password; the strength rules only apply when a password is being set. */
const existingPassword = z.string().min(1, 'Enter your password.').max(PASSWORD_MAX_LENGTH)

/** Strength is checked in the service with `passwordProblem`, so the reason can be returned as a field error. */
const newPassword = z.string().max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`)

const uuid = z.uuid({ error: 'Invalid id.' })

export const loginBody = z.object({ email, password: existingPassword })

export const otpVerifyBody = z.object({
  challengeId: uuid,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  trustDevice: z.boolean().default(false),
})

export const otpResendBody = z.object({ challengeId: uuid })

export const forgotBody = z.object({ email })

export const resetBody = z.object({
  token: z.string().min(20).max(200),
  newPassword,
})

export const changeBody = z.object({
  currentPassword: existingPassword,
  newPassword,
})

export const deviceParams = z.object({ id: uuid })
export const userDeviceParams = z.object({ userId: uuid, id: uuid })
export const userParams = z.object({ userId: uuid })
