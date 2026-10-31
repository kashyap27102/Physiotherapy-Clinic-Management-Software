import { describe, expect, it } from 'vitest'
import {
  entryEffect,
  financialYear,
  formatDocNumber,
  formatMoney,
  indiaDayRange,
  invoiceFingerprint,
  netPaise,
  parseIsoDate,
  parseMoney,
  toBalance,
  type LedgerFigure,
} from '../src/modules/billing/billingRules.js'

describe('money (BILL-002)', () => {
  it('reads amounts as whole paise and refuses anything else', () => {
    expect(parseMoney('500')).toBe(50000)
    expect(parseMoney('500.5')).toBe(50050)
    expect(parseMoney('0.05')).toBe(5)
    expect(parseMoney('1,500')).toBeNull()
    expect(parseMoney('12.345')).toBeNull()
    expect(parseMoney('-5')).toBeNull()
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('1e3')).toBeNull()
  })

  it('formats paise with two decimals and never rounds through a float', () => {
    expect(formatMoney(0)).toBe('0.00')
    expect(formatMoney(5)).toBe('0.05')
    expect(formatMoney(150050)).toBe('1500.50')
    expect(formatMoney(parseMoney('19.99')! + parseMoney('0.01')!)).toBe('20.00')
  })
})

describe('ledger balance (ER-Diagram section 4)', () => {
  const f = (
    entryType: LedgerFigure['entryType'],
    rupees: number,
    reversedType: LedgerFigure['reversedType'] = null,
  ) => ({
    entryType,
    amountPaise: rupees * 100,
    reversedType,
  })

  it('reproduces the worked example from the ER document', () => {
    const entries = [
      f('CHARGE', 500),
      f('CHARGE', 500),
      f('PAYMENT', 2500),
      f('CHARGE', 500),
      f('REVERSAL', 500, 'CHARGE'),
    ]
    expect(toBalance(netPaise(entries))).toEqual({ amount: '1500.00', state: 'credit' })
    expect(toBalance(netPaise([...entries, f('REFUND', 1500)]))).toEqual({ amount: '0.00', state: 'zero' })
  })

  it('reports dues, credit and zero', () => {
    expect(toBalance(netPaise([f('CHARGE', 500)]))).toEqual({ amount: '500.00', state: 'due' })
    expect(toBalance(netPaise([f('PAYMENT', 300)]))).toEqual({ amount: '300.00', state: 'credit' })
    expect(toBalance(netPaise([]))).toEqual({ amount: '0.00', state: 'zero' })
  })

  it('cancels each kind of entry exactly when it is reversed', () => {
    expect(entryEffect('REVERSAL', 500, 'CHARGE')).toBe(-500)
    expect(entryEffect('REVERSAL', 500, 'PAYMENT')).toBe(500)
    expect(entryEffect('REVERSAL', 500, 'REFUND')).toBe(-500)
    for (const type of ['CHARGE', 'PAYMENT', 'REFUND'] as const) {
      expect(netPaise([f(type, 700), f('REVERSAL', 700, type)])).toBe(0)
    }
  })

  it('counts a zero-fee charge as nothing owed (DD-2)', () => {
    expect(toBalance(netPaise([f('CHARGE', 0)])).state).toBe('zero')
  })
})

describe('financial year and numbers (BR-BILL-17)', () => {
  it('runs April to March', () => {
    expect(financialYear(2026, 4)).toBe('2026-27')
    expect(financialYear(2027, 3)).toBe('2026-27')
    expect(financialYear(2027, 4)).toBe('2027-28')
    expect(financialYear(2026, 1)).toBe('2025-26')
    expect(financialYear(2099, 12)).toBe('2099-00')
  })

  it('numbers receipts, reversal receipts and invoices in separate series that cannot collide', () => {
    expect(formatDocNumber('MUM', 'RECEIPT', '2026-27', 1)).toBe('MUM/2026-27/0001')
    expect(formatDocNumber('MUM', 'REVERSAL_RECEIPT', '2026-27', 1)).toBe('MUM/2026-27/R0001')
    expect(formatDocNumber('MUM', 'INVOICE', '2026-27', 12)).toBe('MUM/2026-27/INV0012')
    expect(formatDocNumber('MUM', 'RECEIPT', '2026-27', 12345)).toBe('MUM/2026-27/12345')
  })
})

describe('India days', () => {
  it('bounds a calendar day at India midnight, not UTC midnight', () => {
    const { start, end } = indiaDayRange(2026, 11, 2)
    expect(start.toISOString()).toBe('2026-11-01T18:30:00.000Z')
    expect(end.toISOString()).toBe('2026-11-02T18:30:00.000Z')
  })

  it('accepts only real calendar dates', () => {
    expect(parseIsoDate('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 })
    expect(parseIsoDate('2026-02-30')).toBeNull()
    expect(parseIsoDate('26-02-28')).toBeNull()
    expect(parseIsoDate('2026-13-01')).toBeNull()
  })
})

describe('invoice sameness (BILL-007)', () => {
  const line = (date: string, amount: string, description = 'Physiotherapy session') => ({ date, description, amount })

  it('treats the same sessions and total as the same invoice', () => {
    const a = { lines: [line('7 Oct 2026', '350.00'), line('8 Oct 2026', '350.00')], total: '700.00' }
    const b = { lines: [line('7 Oct 2026', '350.00'), line('8 Oct 2026', '350.00')], total: '700.00' }
    expect(invoiceFingerprint(a)).toBe(invoiceFingerprint(b))
  })

  it('treats an added or removed session as a different invoice', () => {
    const base = { lines: [line('7 Oct 2026', '350.00')], total: '350.00' }
    const added = { lines: [...base.lines, line('8 Oct 2026', '350.00')], total: '700.00' }
    expect(invoiceFingerprint(base)).not.toBe(invoiceFingerprint(added))
  })

  it('treats a changed day, fee or therapist as a different invoice', () => {
    const base = { lines: [line('7 Oct 2026', '350.00')], total: '350.00' }
    expect(invoiceFingerprint(base)).not.toBe(invoiceFingerprint({ ...base, lines: [line('9 Oct 2026', '350.00')] }))
    expect(invoiceFingerprint(base)).not.toBe(
      invoiceFingerprint({ lines: [line('7 Oct 2026', '300.00')], total: '300.00' }),
    )
    expect(invoiceFingerprint(base)).not.toBe(
      invoiceFingerprint({ ...base, lines: [line('7 Oct 2026', '350.00', 'Physiotherapy session (Prapti Patel)')] }),
    )
  })

  it('ignores anything that is not the sessions or the total', () => {
    const base = { lines: [line('7 Oct 2026', '350.00')], total: '350.00', periodLabel: 'a', balanceLabel: 'b' }
    const other = { ...base, periodLabel: 'c', balanceLabel: 'd' }
    expect(invoiceFingerprint(base)).toBe(invoiceFingerprint(other))
  })
})
