/** Server minimum (AUTH-001 validation). The server also rejects common passwords; this is only a hint. */
export const PASSWORD_MIN_LENGTH = 10

export type StrengthScore = 0 | 1 | 2 | 3 | 4

/**
 * A rough 0–4 strength score for the meter. 0 means below the minimum length, so the form will refuse it.
 * Length counts most; mixing letter case, digits and symbols adds a little; repetition caps it at weak.
 */
export function passwordStrength(password: string): StrengthScore {
  if (password.length < PASSWORD_MIN_LENGTH) return 0
  // Few distinct characters or long runs: weak however long (the server refuses fewer than 4 distinct).
  if (new Set(password.toLowerCase()).size < 5 || /(.)\1{3,}/.test(password)) return 1
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length
  let score = 1
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  if (classes >= 3) score += 1
  return Math.min(4, score) as StrengthScore
}
