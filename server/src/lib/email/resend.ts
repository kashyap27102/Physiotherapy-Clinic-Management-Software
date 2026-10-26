import { unavailable } from '../errors.js'
import { logger } from '../logger.js'
import type { EmailKind, EmailMessage, EmailSender } from './types.js'

const ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000

interface ResendOptions {
  apiKey: string
  from: string
  /** Injectable for tests. */
  fetchFn?: typeof fetch
}

/**
 * Sends through the Resend HTTP API (INT-001). Plain fetch keeps the dependency list short and the
 * vendor easy to replace (NFR-012): only this file knows about Resend.
 *
 * Failures become a 503 with a generic message. The log line carries the email kind, the provider's
 * status and message id only; never the recipient, subject or body, which can hold codes and links.
 */
export function createResendSender({ apiKey, from, fetchFn = fetch }: ResendOptions): EmailSender {
  return {
    async send(message: EmailMessage, kind: EmailKind = 'other'): Promise<void> {
      let response: Response
      try {
        response = await fetchFn(ENDPOINT, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        logger.error({ kind, reason: error instanceof Error ? error.name : 'unknown' }, 'Email provider unreachable')
        throw unavailable('Email could not be sent right now. Please try again.')
      }

      if (!response.ok) {
        logger.error({ kind, status: response.status }, 'Email provider rejected the message')
        throw unavailable('Email could not be sent right now. Please try again.')
      }

      const body = (await response.json().catch(() => null)) as { id?: string } | null
      logger.info({ kind, providerId: body?.id }, 'Email sent')
    },
  }
}
