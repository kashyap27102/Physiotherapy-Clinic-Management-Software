import { describe, expect, it } from 'vitest'
import type { DashboardToday } from '@/api'
import { collectionNotes, seenNotes } from './dashboardText'

const collections = (over: Partial<DashboardToday['collections']> = {}): DashboardToday['collections'] => ({
  net: '0.00',
  payments: '0.00',
  reversed: '0.00',
  refunded: '0.00',
  byMethod: [],
  ...over,
})

describe('dashboard small print', () => {
  it('says what was received and what was taken off it (US-26.2)', () => {
    expect(
      collectionNotes(collections({ net: '600.00', payments: '750.00', reversed: '100.00', refunded: '50.00' })),
    ).toEqual(['₹750 received', '₹100 reversed', '₹50 refunded'])
  })

  it('stays quiet about reversals and refunds that did not happen', () => {
    expect(collectionNotes(collections({ net: '6000.00', payments: '6000.00' }))).toEqual(['₹6,000 received'])
    expect(collectionNotes(collections())).toEqual([])
  })

  it('shows paise only when present', () => {
    expect(collectionNotes(collections({ payments: '1500.50' }))).toEqual(['₹1,500.50 received'])
  })

  it('counts sessions and mentions new patients only when there are some', () => {
    expect(seenNotes({ sessions: 1, newPatients: 0 })).toEqual(['1 session'])
    expect(seenNotes({ sessions: 12, newPatients: 1 })).toEqual(['12 sessions', '1 new patient'])
    expect(seenNotes({ sessions: 0, newPatients: 3 })).toEqual(['0 sessions', '3 new patients'])
  })
})
