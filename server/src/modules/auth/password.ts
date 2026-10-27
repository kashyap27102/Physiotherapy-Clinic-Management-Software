import { argon2, randomBytes, timingSafeEqual } from 'node:crypto'
import { commonPasswords } from './commonPasswords.js'

/** Argon2id with the OWASP minimum profile (19 MiB, 2 passes, 1 lane), via Node's built-in crypto (PRD SEC-002). */
const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 } as const

function derive(password: string, salt: Buffer, params: typeof PARAMS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2('argon2id', { message: password, nonce: salt, ...params }, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

/** Standard PHC string: `$argon2id$v=19$m=...,t=...,p=...$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, PARAMS)
  const { memory, passes, parallelism } = PARAMS
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  // ['', 'argon2id', 'v=19', 'm=..,t=..,p=..', salt, hash]
  if (parts.length !== 6 || parts[1] !== 'argon2id') return false
  const match = /^m=(\d+),t=(\d+),p=(\d+)$/.exec(parts[3] ?? '')
  if (!match || !parts[4] || !parts[5]) return false
  const expected = Buffer.from(parts[5], 'base64url')
  const params = {
    memory: Number(match[1]),
    passes: Number(match[2]),
    parallelism: Number(match[3]),
    tagLength: expected.length,
  }
  const actual = await derive(password, Buffer.from(parts[4], 'base64url'), params as typeof PARAMS)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

let decoy: Promise<string> | undefined

/**
 * Spends the same time as a real check when the email is unknown, so response time does not reveal which emails
 * have accounts (PRD AUTH-001: the error must not reveal whether the email exists).
 */
export async function burnPasswordCheck(password: string): Promise<void> {
  decoy ??= hashPassword('decoy-password-never-used')
  await verifyPassword(password, await decoy)
}

export const PASSWORD_MIN_LENGTH = 10
export const PASSWORD_MAX_LENGTH = 128

/** Returns the reason a new password is refused, or null when it is acceptable (PRD AUTH-001 validation). */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters.`
  const lowered = password.toLowerCase()
  if (commonPasswords.has(lowered)) return 'This password is too common. Choose something less guessable.'
  if (email && lowered === email.toLowerCase()) return 'The password cannot be your email address.'
  if (new Set(lowered).size < 4) return 'This password is too repetitive. Choose something less guessable.'
  return null
}
