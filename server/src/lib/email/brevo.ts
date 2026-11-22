import { unavailable } from '../errors.js'
import { logger } from '../logger.js'
import type { EmailKind, EmailMessage, EmailSender } from './types.js'

const ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const TIMEOUT_MS = 10_000

interface BrevoOptions {
  apiKey: string
  /** "name@example.com" or "Clinic Software <name@example.com>". The address must be a verified sender in Brevo. */
  from: string
  /** Injectable for tests. */
  fetchFn?: typeof fetch
}

/** Splits "Clinic Software <no-reply@example.com>" into a name and an address; a bare address has no name. */
export function parseSender(from: string): { email: string; name?: string } {
  const match = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>]+)>\s*$/.exec(from)
  if (!match) return { email: from.trim() }
  const name = match[1]?.trim()
  return name ? { email: match[2]!.trim(), name } : { email: match[2]!.trim() }
}

/**
 * Sends through the Brevo HTTP API (INT-001). Like the Resend adapter, it uses plain fetch and only this file knows
 * about Brevo (NFR-012). Brevo's free plan sends from one verified sender address, so no domain is needed.
 *
 * Failures become a 503 with a generic message. The log line carries the email kind, the provider's status and
 * message id only; never the recipient, subject or body, which can hold codes and links.
 */
export function createBrevoSender({ apiKey, from, fetchFn = fetch }: BrevoOptions): EmailSender {
  const sender = parseSender(from)
  return {
    async send(message: EmailMessage, kind: EmailKind = 'other'): Promise<void> {
      let response: Response
      try {
        response = await fetchFn(ENDPOINT, {
          method: 'POST',
          headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            sender,
            to: [{ email: message.to }],
            subject: message.subject,
            textContent: message.text,
            ...(message.html ? { htmlContent: message.html } : {}),
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

      const body = (await response.json().catch(() => null)) as { messageId?: string } | null
      logger.info({ kind, providerId: body?.messageId }, 'Email sent')
    },
  }
}
