import { describe, expect, it } from 'vitest'
import {
  classifyQuery,
  currentAge,
  dateOnly,
  indiaToday,
  nameSimilarity,
  normaliseName,
  normalisePhone,
  yearsBetween,
} from '../src/modules/patients/patientRules.js'

describe('normalisePhone (PAT-001 validation)', () => {
  it('stores Indian mobiles as ten digits however they are typed', () => {
    for (const raw of [
      '9876543210',
      '98765 43210',
      '+91 98765-43210',
      '+919876543210',
      '09876543210',
      '0091 9876543210',
      '(98765) 43210',
    ]) {
      expect(normalisePhone(raw), raw).toBe('9876543210')
    }
  })

  it('rejects numbers that are not Indian mobiles', () => {
    for (const raw of ['', '12345', '5876543210', '98765432', '98765432101', 'abcdefghij', '+91 12345']) {
      expect(normalisePhone(raw), raw).toBeNull()
    }
  })

  it('accepts other countries only with their own + code', () => {
    expect(normalisePhone('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalisePhone('+1 (415) 555-0132')).toBe('+14155550132')
    expect(normalisePhone('+44 12')).toBeNull()
  })
})

describe('age and date of birth (BR-PAT-3)', () => {
  const at = (iso: string) => new Date(iso)

  it('counts whole years, not passing the birthday early', () => {
    expect(yearsBetween(dateOnly(1990, 6, 15), dateOnly(2026, 6, 14))).toBe(35)
    expect(yearsBetween(dateOnly(1990, 6, 15), dateOnly(2026, 6, 15))).toBe(36)
  })

  it('derives the age from a date of birth', () => {
    const patient = { dateOfBirth: dateOnly(1990, 6, 15), ageYears: 0, ageRecordedOn: dateOnly(2026, 1, 1) }
    expect(currentAge(patient, at('2026-10-29T06:00:00Z'))).toBe(36)
  })

  it('lets an entered age grow with the years since it was recorded', () => {
    const patient = { dateOfBirth: null, ageYears: 34, ageRecordedOn: dateOnly(2025, 10, 1) }
    expect(currentAge(patient, at('2026-09-30T06:00:00Z'))).toBe(34)
    expect(currentAge(patient, at('2026-10-29T06:00:00Z'))).toBe(35)
  })

  it("uses the clinic's calendar in India, not UTC", () => {
    // 20:00 UTC on the 28th is already the 29th in India.
    expect(indiaToday(new Date('2026-10-28T20:00:00Z'))).toEqual({ year: 2026, month: 10, day: 29 })
    expect(indiaToday(new Date('2026-10-28T10:00:00Z'))).toEqual({ year: 2026, month: 10, day: 28 })
  })
})

describe('name matching (BR-PAT-2)', () => {
  it('ignores case, accents, punctuation and spacing', () => {
    expect(normaliseName('  Dr.  Amit   KUMAR ')).toBe('dr amit kumar')
    expect(normaliseName('José Núñez')).toBe('jose nunez')
  })

  it('scores the same person high and different people low', () => {
    expect(nameSimilarity('Amit Kumar', 'amit  kumar')).toBe(1)
    expect(nameSimilarity('Amit Kumar', 'Amit Kumaar')).toBeGreaterThanOrEqual(0.8)
    expect(nameSimilarity('Priya Sharma', 'Priyaa Sharma')).toBeGreaterThanOrEqual(0.8)
    expect(nameSimilarity('Amit Kumar', 'Sneha Patil')).toBeLessThan(0.4)
    expect(nameSimilarity('', 'Amit')).toBe(0)
  })
})

describe('search text (PAT-002)', () => {
  it('treats digits as a phone fragment and needs four of them', () => {
    expect(classifyQuery('98765')).toEqual({ kind: 'phone', digits: '98765' })
    expect(classifyQuery('+91 9876')).toEqual({ kind: 'phone', digits: '9876' })
    expect(classifyQuery('+91 98765 43210')).toEqual({ kind: 'phone', digits: '9876543210' })
    expect(classifyQuery('+91 98')).toEqual({ kind: 'short' })
    expect(classifyQuery('987')).toEqual({ kind: 'short' })
  })

  it('treats anything else as part of a name', () => {
    expect(classifyQuery('  amit   ku ')).toEqual({ kind: 'name', text: 'amit ku' })
    expect(classifyQuery('amit 9876')).toEqual({ kind: 'name', text: 'amit 9876' })
    expect(classifyQuery('   ')).toEqual({ kind: 'none' })
  })
})
