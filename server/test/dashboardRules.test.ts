import { describe, expect, it } from 'vitest'
import type { EntryType } from '../src/modules/billing/billingRules.js'
import { cashEffect, summariseDues, tallyCash, type CashEntry } from '../src/modules/dashboard/dashboardRules.js'

const entry = (
  entryType: EntryType,
  amountPaise: number,
  method: string | null = 'cash',
  reversed: CashEntry['reversed'] = null,
): CashEntry => ({ entryType, amountPaise, method, reversed })

describe('cash effect of a ledger entry (REP-001, BR-REP-1)', () => {
  it('counts payments in, refunds out, and charges not at all', () => {
    expect(cashEffect(entry('PAYMENT', 50_000))).toBe(50_000)
    expect(cashEffect(entry('REFUND', 5_000))).toBe(-5_000)
    expect(cashEffect(entry('CHARGE', 50_000, null))).toBe(0)
  })

  it('takes a reversed payment back out and puts a reversed refund back in', () => {
    expect(cashEffect(entry('REVERSAL', 10_000, null, { entryType: 'PAYMENT', method: 'upi' }))).toBe(-10_000)
    expect(cashEffect(entry('REVERSAL', 5_000, null, { entryType: 'REFUND', method: 'cash' }))).toBe(5_000)
  })

  it('ignores a reversal of a charge, which never moved cash', () => {
    expect(cashEffect(entry('REVERSAL', 50_000, null, { entryType: 'CHARGE', method: null }))).toBe(0)
    expect(cashEffect(entry('REVERSAL', 50_000, null, null))).toBe(0)
  })
})

describe('the day’s collections', () => {
  it('shows 6,000 received as 6,000 collected (US-26.1)', () => {
    const tally = tallyCash([entry('PAYMENT', 400_000), entry('PAYMENT', 200_000, 'upi')])
    expect(tally).toMatchObject({ payments: 600_000, reversed: 0, refunded: 0, net: 600_000 })
    expect(tally.byMethod).toEqual({ cash: 400_000, upi: 200_000, card: 0, bank_transfer: 0 })
  })

  it('nets a reversed payment but shows it separately (US-26.2)', () => {
    const tally = tallyCash([
      entry('PAYMENT', 600_000),
      entry('REVERSAL', 100_000, null, { entryType: 'PAYMENT', method: 'upi' }),
    ])
    expect(tally).toMatchObject({ payments: 600_000, reversed: 100_000, refunded: 0, net: 500_000 })
    // The reversal comes off the method of the payment it cancels.
    expect(tally.byMethod.upi).toBe(-100_000)
    expect(tally.byMethod.cash).toBe(600_000)
  })

  it('takes refunds off the net and shows them separately', () => {
    const tally = tallyCash([entry('PAYMENT', 150_00), entry('REFUND', 50_00)])
    expect(tally).toMatchObject({ payments: 150_00, refunded: 50_00, net: 100_00 })
  })

  it('treats a reversed refund as money back in', () => {
    const tally = tallyCash([
      entry('REFUND', 50_00),
      entry('REVERSAL', 50_00, null, { entryType: 'REFUND', method: 'cash' }),
    ])
    expect(tally).toMatchObject({ refunded: 0, net: 0 })
  })

  it('is empty on a quiet day', () => {
    expect(tallyCash([])).toEqual({
      payments: 0,
      reversed: 0,
      refunded: 0,
      net: 0,
      byMethod: { cash: 0, upi: 0, card: 0, bank_transfer: 0 },
    })
  })
})

describe('outstanding dues', () => {
  const rows = [
    { patientId: 'a', netPaise: 20_000 },
    { patientId: 'b', netPaise: 30_000 },
    { patientId: 'c', netPaise: -10_000 },
    { patientId: 'd', netPaise: 0 },
  ]

  it('adds up only what patients owe; credit does not offset anyone else', () => {
    const dues = summariseDues(rows)
    expect(dues.totalPaise).toBe(50_000)
    expect(dues.patients).toBe(2)
  })

  it('lists the largest first and caps the list', () => {
    expect(summariseDues(rows).top.map((row) => row.patientId)).toEqual(['b', 'a'])
    expect(summariseDues(rows, 1).top.map((row) => row.patientId)).toEqual(['b'])
  })
})
