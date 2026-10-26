import { describe, expect, it } from 'vitest'
import { financialYear } from './date'
import { formatINR, fromPaise, isValidAmount, toPaise } from './money'

describe('money', () => {
  it('converts to and from paise without floating point drift', () => {
    expect(toPaise('1500')).toBe(150000)
    expect(toPaise('1500.5')).toBe(150050)
    expect(toPaise('0.07')).toBe(7)
    expect(fromPaise(150050)).toBe('1500.50')
    expect(fromPaise(7)).toBe('0.07')
    expect(fromPaise(0)).toBe('0.00')
  })

  it('rejects invalid amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1,000', '1e3', ' ']) expect(isValidAmount(bad)).toBe(false)
    expect(toPaise('1.234')).toBeNull()
  })

  it('formats rupees the Indian way', () => {
    expect(formatINR('1500.00')).toBe('₹1,500')
    expect(formatINR('1500.50')).toBe('₹1,500.50')
    expect(formatINR('125000.00')).toBe('₹1,25,000')
  })
})

describe('financial year (April to March, India time)', () => {
  it('rolls over on 1 April India time', () => {
    expect(financialYear('2027-03-31T12:00:00+05:30')).toBe('2026-27')
    expect(financialYear('2027-04-01T00:30:00+05:30')).toBe('2027-28')
    expect(financialYear('2026-10-26T10:00:00+05:30')).toBe('2026-27')
    expect(financialYear('2027-01-15T10:00:00+05:30')).toBe('2026-27')
  })
})
