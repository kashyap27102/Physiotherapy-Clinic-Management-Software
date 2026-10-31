// Calendar days as plain "YYYY-MM-DD" strings, so no time zone can shift a day. India time is decided elsewhere
// (`lib/date.ts` `dayKey`); these helpers only count days.

export interface Month {
  year: number
  /** 1 to 12 */
  month: number
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export const isoDay = (year: number, month: number, day: number) => `${year}-${pad2(month)}-${pad2(day)}`

export function parseDay(iso: string): { year: number; month: number; day: number } {
  const [year = 0, month = 0, day = 0] = iso.split('-').map(Number)
  return { year, month, day }
}

export const monthOf = (iso: string): Month => {
  const { year, month } = parseDay(iso)
  return { year, month }
}

export const daysInMonth = ({ year, month }: Month) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** 0 for Sunday to 6 for Saturday. */
export const weekdayOf = (iso: string) => {
  const { year, month, day } = parseDay(iso)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** Every day from `from` to `to`, both included; empty when `from` is after `to`. */
export function eachDay(from: string, to: string, { skipSundays = false } = {}): string[] {
  const days: string[] = []
  const start = parseDay(from)
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day))
  const end = parseDay(to)
  const last = Date.UTC(end.year, end.month - 1, end.day)
  while (cursor.getTime() <= last) {
    const iso = isoDay(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate())
    if (!(skipSundays && cursor.getUTCDay() === 0)) days.push(iso)
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return days
}

const monthName = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

export const monthLabel = ({ year, month }: Month) => monthName.format(new Date(Date.UTC(year, month - 1, 1)))
