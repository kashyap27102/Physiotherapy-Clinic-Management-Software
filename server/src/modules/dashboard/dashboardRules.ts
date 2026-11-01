import { PAYMENT_METHODS, type EntryType, type PaymentMethod } from '../billing/billingRules.js'

/**
 * Pure rules for the owner dashboard (REP-001, BR-REP-1). Collections are cash basis: payments received, with
 * reversals and refunds taken off and shown separately. Everything is in paise.
 */

/** One ledger entry of the day, as the dashboard reads it. */
export interface CashEntry {
  entryType: EntryType
  amountPaise: number
  /** The method of the entry itself (payments, refunds). */
  method: string | null
  /** For a REVERSAL: the type and method of the entry it cancels. */
  reversed: { entryType: EntryType; method: string | null } | null
}

/** How an entry moves the till: money in is positive, money out is negative. Charges never touch it. */
export function cashEffect(entry: CashEntry): number {
  switch (entry.entryType) {
    case 'PAYMENT':
      return entry.amountPaise
    case 'REFUND':
      return -entry.amountPaise
    case 'REVERSAL':
      if (entry.reversed?.entryType === 'PAYMENT') return -entry.amountPaise
      if (entry.reversed?.entryType === 'REFUND') return entry.amountPaise
      return 0
    case 'CHARGE':
      return 0
  }
}

export interface CashTally {
  /** Payments received in the period. */
  payments: number
  /** Payments cancelled by a reversal in the period. */
  reversed: number
  /** Refunds paid out, less any refund that was itself reversed. */
  refunded: number
  /** payments - reversed - refunded. */
  net: number
  byMethod: Record<PaymentMethod, number>
}

const methodOf = (entry: CashEntry): PaymentMethod | null => {
  const method = entry.entryType === 'REVERSAL' ? (entry.reversed?.method ?? null) : entry.method
  return PAYMENT_METHODS.find((known) => known === method) ?? null
}

export function tallyCash(entries: readonly CashEntry[]): CashTally {
  const tally: CashTally = {
    payments: 0,
    reversed: 0,
    refunded: 0,
    net: 0,
    byMethod: { cash: 0, upi: 0, card: 0, bank_transfer: 0 },
  }
  for (const entry of entries) {
    const effect = cashEffect(entry)
    if (effect === 0) continue
    if (entry.entryType === 'PAYMENT') tally.payments += effect
    else if (entry.entryType === 'REFUND') tally.refunded -= effect
    else if (entry.reversed?.entryType === 'PAYMENT') tally.reversed -= effect
    else tally.refunded -= effect // a reversed refund puts the money back
    tally.net += effect
    const method = methodOf(entry)
    if (method) tally.byMethod[method] += effect
  }
  return tally
}

export interface DueRow {
  patientId: string
  netPaise: number
}

/** Dues only: a patient in credit does not offset anyone else's balance. */
export function summariseDues(rows: readonly DueRow[], topCount = 5) {
  const owing = rows.filter((row) => row.netPaise > 0).sort((a, b) => b.netPaise - a.netPaise)
  return {
    totalPaise: owing.reduce((sum, row) => sum + row.netPaise, 0),
    patients: owing.length,
    top: owing.slice(0, topCount),
  }
}
