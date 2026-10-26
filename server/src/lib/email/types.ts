export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

/** Short label for logs and metrics. Recipients and content are never logged (PRD NFR-010). */
export type EmailKind = 'otp' | 'password-reset' | 'invitation' | 'other'

export interface EmailSender {
  send(message: EmailMessage, kind?: EmailKind): Promise<void>
}
