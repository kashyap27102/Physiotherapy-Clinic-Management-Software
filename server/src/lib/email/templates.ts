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

export function registrationCodeEmail(to: string, code: string, minutesValid: number): EmailMessage {
  return {
    to,
    subject: 'Confirm your clinic registration',
    text: [
      `Your verification code is ${code}.`,
      `Enter it to finish creating your clinic account. It expires in ${minutesValid} minutes.`,
      'If you did not try to register a clinic, ignore this email.',
    ].join('\n\n'),
  }
}

/** Sent instead of a code when someone registers with an email that already has an account. */
export function accountExistsEmail(to: string, signInLink: string, resetLink: string): EmailMessage {
  return {
    to,
    subject: 'You already have an account',
    text: [
      'Someone, probably you, tried to register a new clinic with this email address, but it already has an account.',
      `Sign in here: ${signInLink}`,
      `Forgot your password? Reset it here: ${resetLink}`,
      'If this was not you, you can ignore this email.',
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
