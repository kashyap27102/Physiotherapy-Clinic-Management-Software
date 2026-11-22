import { env } from '../../config/env.js'
import { unavailable } from '../errors.js'
import { createBrevoSender } from './brevo.js'
import { createResendSender } from './resend.js'
import type { EmailSender } from './types.js'

export type { EmailKind, EmailMessage, EmailSender } from './types.js'

/** Used when email is not configured: the API keeps running, and anything that needs email answers 503. */
const unconfigured: EmailSender = {
  send() {
    return Promise.reject(unavailable('Email is not configured.'))
  },
}

/** Local development: delivers every message to one inbox, noting who it was meant for in the body. */
function redirectTo(inbox: string, inner: EmailSender): EmailSender {
  return {
    send(message, kind) {
      return inner.send(
        { ...message, to: inbox, text: `[Development redirect] Originally for: ${message.to}\n\n${message.text}` },
        kind,
      )
    },
  }
}

let sender: EmailSender | undefined

/** Lazy singleton, like the database client. Tests replace it with `setEmailSender`. */
export function getEmailSender(): EmailSender {
  if (!sender) {
    // Brevo is preferred (no domain needed); Resend is used when only its key is set.
    const provider =
      env.EMAIL_FROM && env.BREVO_API_KEY
        ? createBrevoSender({ apiKey: env.BREVO_API_KEY, from: env.EMAIL_FROM })
        : env.EMAIL_FROM && env.RESEND_API_KEY
          ? createResendSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM })
          : undefined
    if (provider) {
      sender =
        env.NODE_ENV === 'development' && env.EMAIL_DEV_REDIRECT_TO
          ? redirectTo(env.EMAIL_DEV_REDIRECT_TO, provider)
          : provider
    } else {
      sender = unconfigured
    }
  }
  return sender
}

export function setEmailSender(next: EmailSender | undefined): void {
  sender = next
}
