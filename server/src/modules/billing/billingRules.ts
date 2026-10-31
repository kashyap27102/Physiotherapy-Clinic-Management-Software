/**
 * Pure billing rules (BILL-002, ER-Diagram sections 4 and 6). Money is held as whole paise (integers) while it is
 * added up, and as strings with two decimals everywhere else. No floats ever touch an amount.
 */

export type EntryType = 'CHARGE' | 'PAYMENT' | 'REFUND' | 'REVERSAL'
export type DocType = 'RECEIPT' | 'REVERSAL_RECEIPT' | 'INVOICE'
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'bank_transfer'
export const PAYMENT_METHODS = ['cash', 'upi', 'card', 'bank_transfer'] as const

export interface BalanceView {
  /** Absolute amount, for example "1000.00". */
  amount: string
  state: 'due' | 'credit' | 'zero'
}

/** "1500", "1500.5" or "1500.50" to paise, or null when it is not an amount with at most two decimals. */
export function parseMoney(raw: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(raw.trim())
  if (!match) return null
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

/** Paise to "1500.50". */
export function formatMoney(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * How one entry moves the patient's balance, in paise (positive means more dues). Reversals cancel exactly the
 * entry they point at, so their effect is the opposite of that entry's (ER section 4).
 */
export function entryEffect(type: EntryType, amountPaise: number, reversedType: EntryType | null): number {
  switch (type) {
    case 'CHARGE':
    case 'REFUND':
      return amountPaise
    case 'PAYMENT':
      return -amountPaise
    case 'REVERSAL':
      if (!reversedType || reversedType === 'REVERSAL') return 0
      return -entryEffect(reversedType, amountPaise, null)
  }
}

export interface LedgerFigure {
  entryType: EntryType
  amountPaise: number
  /** The type of the entry a REVERSAL cancels. */
  reversedType: EntryType | null
}

/** Dues are positive, advance credit is negative. */
export const netPaise = (entries: readonly LedgerFigure[]): number =>
  entries.reduce((sum, entry) => sum + entryEffect(entry.entryType, entry.amountPaise, entry.reversedType), 0)

export function toBalance(netPaiseValue: number): BalanceView {
  if (netPaiseValue > 0) return { amount: formatMoney(netPaiseValue), state: 'due' }
  if (netPaiseValue < 0) return { amount: formatMoney(-netPaiseValue), state: 'credit' }
  return { amount: '0.00', state: 'zero' }
}

/** The Indian financial year (April to March) a calendar date falls in, for example 2026-27. */
export function financialYear(year: number, month: number): string {
  const start = month >= 4 ? year : year - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

/** Receipts are MUM/2026-27/0001, reversal receipts MUM/2026-27/R0001 and invoices MUM/2026-27/INV0001. */
export function formatDocNumber(branchCode: string, docType: DocType, fy: string, seq: number): string {
  const prefix = docType === 'RECEIPT' ? '' : docType === 'REVERSAL_RECEIPT' ? 'R' : 'INV'
  return `${branchCode}/${fy}/${prefix}${String(seq).padStart(4, '0')}`
}

/** The UTC instants that bound one India calendar day. India has no daylight saving, so the offset is fixed. */
export function indiaDayRange(year: number, month: number, day: number): { start: Date; end: Date } {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00+05:30`)
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

/** "YYYY-MM-DD" to its parts, or null when it is not a real calendar date. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  const real = check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  return real ? { year, month, day } : null
}
