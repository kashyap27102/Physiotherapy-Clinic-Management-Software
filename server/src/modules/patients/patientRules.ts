/**
 * Pure rules for patient data: phone numbers, age and date of birth, and name matching. Kept free of the
 * database so they can be tested on their own.
 */

/**
 * PRD PAT-001: a 10-digit Indian mobile number (with or without +91 or a leading 0), or another valid number written
 * with its own "+" country code. Returns the stored form, or null when the number is not valid:
 *  - Indian numbers are stored as the ten digits.
 *  - Other countries are stored as "+" and the digits (8 to 15 of them).
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

/** Today's date in India (the clinic's calendar), as year, month (1 to 12) and day. */
export function indiaToday(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number)
  return { year: parts[0]!, month: parts[1]!, day: parts[2]! }
}

/** A calendar date as a UTC midnight Date, which is how Prisma reads and writes `@db.Date` columns. */
export const dateOnly = (year: number, month: number, day: number): Date => new Date(Date.UTC(year, month - 1, day))

/** Whole years between two calendar dates. */
export function yearsBetween(from: Date, to: Date): number {
  let years = to.getUTCFullYear() - from.getUTCFullYear()
  const beforeBirthday =
    to.getUTCMonth() < from.getUTCMonth() ||
    (to.getUTCMonth() === from.getUTCMonth() && to.getUTCDate() < from.getUTCDate())
  if (beforeBirthday) years -= 1
  return years
}

/**
 * The patient's age today (BR-PAT-3): from the date of birth when known, otherwise the age that was entered plus the
 * whole years since it was recorded, so a stored "34" does not stay 34 forever.
 */
export function currentAge(
  patient: { dateOfBirth: Date | null; ageYears: number; ageRecordedOn: Date },
  now: Date = new Date(),
): number {
  const today = indiaToday(now)
  const todayDate = dateOnly(today.year, today.month, today.day)
  if (patient.dateOfBirth) return Math.max(0, yearsBetween(patient.dateOfBirth, todayDate))
  return patient.ageYears + Math.max(0, yearsBetween(patient.ageRecordedOn, todayDate))
}

/** Lower case, accents and punctuation removed, spaces collapsed: "  Dr. Amit  KUMAR " becomes "dr amit kumar". */
export function normaliseName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function bigrams(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  const padded = ` ${text} `
  for (let i = 0; i < padded.length - 1; i += 1) {
    const pair = padded.slice(i, i + 2)
    counts.set(pair, (counts.get(pair) ?? 0) + 1)
  }
  return counts
}

/** 0 to 1 name similarity (Dice coefficient on letter pairs). Tolerates a typo or a swapped spelling. */
export function nameSimilarity(a: string, b: string): number {
  const left = normaliseName(a)
  const right = normaliseName(b)
  if (!left || !right) return 0
  if (left === right) return 1
  const x = bigrams(left)
  const y = bigrams(right)
  let overlap = 0
  for (const [pair, count] of x) overlap += Math.min(count, y.get(pair) ?? 0)
  const total = [...x.values()].reduce((sum, n) => sum + n, 0) + [...y.values()].reduce((sum, n) => sum + n, 0)
  return total === 0 ? 0 : (2 * overlap) / total
}

/** Names this alike count as a possible duplicate, which the user can still override (BR-PAT-2). */
export const SIMILAR_NAME = 0.8

/** What a search box text means: digits and "+" are a phone fragment, anything else is part of a name. */
export function classifyQuery(
  q: string,
): { kind: 'phone'; digits: string } | { kind: 'name'; text: string } | { kind: 'short' } | { kind: 'none' } {
  const text = q.trim()
  if (!text) return { kind: 'none' }
  if (/^[\d\s+().-]+$/.test(text)) {
    // Stored numbers carry no country code, so "+91 98765" must search for "98765".
    const digits = text.replace(/^(\+\s*91|0091)[\s-]*/, '').replace(/\D/g, '')
    // US-09.1: a phone fragment needs four digits to be useful.
    return digits.length >= 4 ? { kind: 'phone', digits } : { kind: 'short' }
  }
  return { kind: 'name', text: text.replace(/\s+/g, ' ') }
}
