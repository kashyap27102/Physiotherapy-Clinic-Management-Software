import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Secrets that leave the server (session cookie, device cookie, reset link) are 256 random bits and only their
 * SHA-256 hash is stored (ER DD-8), so a leaked database cannot be used to sign in. High-entropy tokens do not
 * need a slow hash.
 */
export const newToken = (): string => randomBytes(32).toString('base64url')

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** Six digits, uniformly random, with leading zeros kept. */
export const newOtpCode = (): string => randomInt(0, 1_000_000).toString().padStart(6, '0')

/**
 * Six digits are guessable offline, so a stored hash only slows a database thief down. The real controls are the
 * 10 minute expiry and the five-attempt limit. The challenge id is mixed in so equal codes hash differently.
 */
export const hashOtp = (challengeId: string, code: string): string =>
  createHash('sha256').update(`${challengeId}:${code}`).digest('hex')

/** Constant-time comparison of two hex digests. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
