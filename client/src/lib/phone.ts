/**
 * Phone numbers as the clinic uses them. This mirrors the server's rule (PRD PAT-001) so a mistake is caught while
 * typing; the server still checks again and stores the same normalised form.
 *  - Indian mobiles: ten digits starting 6 to 9, typed with or without +91, spaces or a leading 0.
 *  - Other countries: written with their own "+" code.
 */
export function normalisePhone(raw: string): string | null {
  const cleaned = raw.trim().replace(/[\s().-]/g, '')
  if (cleaned.startsWith('+') && !cleaned.startsWith('+91')) {
    const digits = cleaned.slice(1)
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null
  }
  const digits = cleaned.replace(/^\+/, '').replace(/\D/g, '')
  const national = digits.startsWith('0091')
    ? digits.slice(4)
    : digits.length === 12 && digits.startsWith('91')
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith('0')
        ? digits.slice(1)
        : digits
  return /^[6-9]\d{9}$/.test(national) ? national : null
}

/** "9876543210" becomes "98765 43210"; numbers from other countries are shown as stored. */
export function formatPhone(stored: string): string {
  return /^\d{10}$/.test(stored) ? `${stored.slice(0, 5)} ${stored.slice(5)}` : stored
}
