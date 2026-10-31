import { describe, expect, it } from 'vitest'
import { daysInMonth, eachDay, isoDay, monthLabel, shiftMonth, weekdayOf } from './calendar'

describe('calendar days', () => {
  it('counts the days of a month, including February in leap years', () => {
    expect(daysInMonth({ year: 2026, month: 10 })).toBe(31)
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28)
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29)
  })

  it('finds the weekday of a day, Sunday first', () => {
    expect(weekdayOf('2026-10-07')).toBe(3) // Wednesday
    expect(weekdayOf('2026-10-11')).toBe(0) // Sunday
  })

  it('moves between months across year ends', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 10 }, 0)).toEqual({ year: 2026, month: 10 })
  })

  it('lists every day of a range, both ends included', () => {
    expect(eachDay('2026-10-07', '2026-10-10')).toEqual(['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(eachDay('2026-10-10', '2026-10-07')).toEqual([])
  })

  it('can leave Sundays out of a range', () => {
    const week = eachDay('2026-10-05', '2026-10-12', { skipSundays: true })
    expect(week).toHaveLength(7)
    expect(week).not.toContain('2026-10-11')
  })

  it('writes and names days and months', () => {
    expect(isoDay(2026, 3, 9)).toBe('2026-03-09')
    expect(monthLabel({ year: 2026, month: 10 })).toBe('October 2026')
  })
})
