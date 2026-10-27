import { z } from 'zod'
import { PASSWORD_MAX_LENGTH } from '../auth/password.js'

/** Indian mobile number: 10 digits starting 6 to 9, with an optional +91 or 0 in front. Stored as 10 digits. */
const mobile = z
  .string()
  .transform((value) => value.replace(/[\s()-]/g, '').replace(/^(\+91|0091|91(?=\d{10}$)|0)/, ''))
  .pipe(z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number.'))

export const registerBody = z.object({
  clinicName: z.string().trim().min(2, 'Enter the clinic name.').max(120),
  fullName: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  phone: mobile,
  // Strength is checked in the service so the reason comes back as a field error.
  password: z.string().max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
  acceptTerms: z.literal(true, { error: 'Please accept the terms to continue.' }),
})

export const registrationVerifyBody = z.object({
  registrationId: z.uuid({ error: 'Invalid id.' }),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  trustDevice: z.boolean().default(false),
})

export const registrationResendBody = z.object({ registrationId: z.uuid({ error: 'Invalid id.' }) })
