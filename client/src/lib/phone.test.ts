import { describe, expect, it } from 'vitest'
import { formatPhone, normalisePhone } from './phone'

describe('normalisePhone (PAT-001)', () => {
  it('accepts Indian mobiles however they are typed', () => {
    for (const raw of ['9876543210', '98765 43210', '+91 98765-43210', '09876543210', '0091 9876543210']) {
      expect(normalisePhone(raw), raw).toBe('9876543210')
    }
  })

  it('rejects numbers that are not valid', () => {
    for (const raw of ['', '12345', '5876543210', '98765432101', 'abc']) expect(normalisePhone(raw), raw).toBeNull()
  })

  it('accepts other countries with their own + code', () => {
    expect(normalisePhone('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalisePhone('+44 12')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('groups Indian numbers and leaves others alone', () => {
    expect(formatPhone('9876543210')).toBe('98765 43210')
    expect(formatPhone('+442079460958')).toBe('+442079460958')
  })
})
