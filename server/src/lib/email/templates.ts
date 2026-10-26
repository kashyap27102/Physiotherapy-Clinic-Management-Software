import type { EmailMessage } from './types.js'

/**
 * Plain-text emails for the flows in the PRD (AUTH-002, AUTH-004, TEN-001). Kept in one file so the
 * wording can be translated later (NFR-003). Each builder returns the message and never sends it.
 */

export function otpEmail(to: string, code: string, minutesValid: number): EmailMessage {
  return {
    to,
    subject: 'Your sign-in code',
    text: [
      `Your sign-in code is ${code}.`,
      `It expires in ${minutesValid} minutes. If you did not try to sign in, ignore this email and change your password.`,
    ].join('\n\n'),
  }
}

export function passwordResetEmail(to: string, link: string, minutesValid: number): EmailMessage {
  return {
    to,
    subject: 'Reset your password',
    text: [
      `Use this link to choose a new password: ${link}`,
      `It works once and expires in ${minutesValid} minutes. If you did not ask for this, ignore this email.`,
    ].join('\n\n'),
  }
}

export function invitationEmail(to: string, clinicName: string, link: string, daysValid: number): EmailMessage {
  return {
    to,
    subject: `You have been invited to ${clinicName}`,
    text: [
      `${clinicName} has added you to their clinic software.`,
      `Set your password here: ${link}`,
      `The link expires in ${daysValid} days.`,
    ].join('\n\n'),
  }
}
