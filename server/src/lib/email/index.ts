import { env } from '../../config/env.js'
import { unavailable } from '../errors.js'
import { createResendSender } from './resend.js'
import type { EmailSender } from './types.js'

export type { EmailKind, EmailMessage, EmailSender } from './types.js'

/** Used when email is not configured: the API keeps running, and anything that needs email answers 503. */
const unconfigured: EmailSender = {
  send() {
    return Promise.reject(unavailable('Email is not configured.'))
  },
}

let sender: EmailSender | undefined

/** Lazy singleton, like the database client. Tests replace it with `setEmailSender`. */
export function getEmailSender(): EmailSender {
  sender ??=
    env.RESEND_API_KEY && env.EMAIL_FROM
      ? createResendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
      : unconfigured
  return sender
}

export function setEmailSender(next: EmailSender | undefined): void {
  sender = next
}
