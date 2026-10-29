import { describe, expect, it } from 'vitest'
import { activeFilterCount, presetRange, readFilters, writeFilters } from './patientFilters'

describe('patient list filters in the address bar', () => {
  it('reads defaults from an empty address and writes nothing back', () => {
    const filters = readFilters(new URLSearchParams())
    expect(filters).toMatchObject({ sort: 'newest', page: 1, pageSize: 25 })
    expect(writeFilters(filters, '').toString()).toBe('')
  })

  it('round-trips every filter', () => {
    const params = new URLSearchParams(
      'q=patel&gender=female&status=active&contact=guardian&registered=custom&from=2026-10-01&to=2026-10-15&sort=name&page=3&size=50',
    )
    expect(writeFilters(readFilters(params), 'patel').toString()).toBe(params.toString())
  })

  it('ignores unknown or malformed values from an old bookmark', () => {
    const filters = readFilters(new URLSearchParams('gender=robot&sort=random&page=-2&size=7&from=yesterday'))
    expect(filters).toEqual({
      gender: undefined,
      status: undefined,
      phoneContactType: undefined,
      registered: undefined,
      registeredFrom: undefined,
      registeredTo: undefined,
      sort: 'newest',
      page: 1,
      pageSize: 25,
    })
  })

  it('counts narrowing filters, not sorting or paging', () => {
    const filters = readFilters(new URLSearchParams('gender=male&from=2026-10-01&to=2026-10-02&sort=name&page=2'))
    expect(activeFilterCount(filters)).toBe(2)
  })
})

describe('registered date presets (India time)', () => {
  // 29 Oct 2026, 01:00 in India is still 28 Oct in UTC: the range must follow the Indian day.
  const now = new Date('2026-10-28T19:30:00Z')

  it('counts days in India time, including today', () => {
    expect(presetRange('today', now)).toEqual({ registeredFrom: '2026-10-29', registeredTo: '2026-10-29' })
    expect(presetRange('week', now)).toEqual({ registeredFrom: '2026-10-23', registeredTo: '2026-10-29' })
    expect(presetRange('month', now)).toEqual({ registeredFrom: '2026-09-30', registeredTo: '2026-10-29' })
    expect(presetRange('thisMonth', now)).toEqual({ registeredFrom: '2026-10-01', registeredTo: '2026-10-29' })
    expect(presetRange('custom', now)).toEqual({})
  })
})
