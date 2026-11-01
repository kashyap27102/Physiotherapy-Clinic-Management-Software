import { describe, expect, it } from 'vitest'
import { actionLabel, actionTone, changesOf, factsOf, humanizeKey, showValue, summarize } from './auditSummary'

describe('audit entry wording', () => {
  it('labels known actions and falls back to the key for a new one', () => {
    expect(actionLabel('payment.recorded')).toBe('Payment recorded')
    expect(actionLabel('something.new')).toBe('something.new')
  })

  it('colours warnings, money and plain views differently', () => {
    expect(actionTone('visit.fee_overridden')).toBe('danger')
    expect(actionTone('auth.login_failed')).toBe('danger')
    expect(actionTone('payment.recorded')).toBe('success')
    expect(actionTone('patient.viewed')).toBe('muted')
    expect(actionTone('document.printed')).toBe('muted')
    expect(actionTone('patient.created')).toBe('primary')
  })

  it('humanises field names', () => {
    expect(humanizeKey('registeredBranchId')).toBe('registered branch id')
    expect(humanizeKey('phone_number')).toBe('phone number')
  })
})

describe('one-line summaries', () => {
  it('summarises a payment', () => {
    expect(summarize('payment.recorded', { amount: '500.00', method: 'cash', receipt: 'MUM/2026-27/0001' })).toBe(
      '₹500 by Cash · Receipt MUM/2026-27/0001',
    )
  })

  it('summarises a fee override with its reason', () => {
    expect(summarize('visit.fee_overridden', { defaultFee: '500.00', fee: '400.00', reason: 'Senior citizen' })).toBe(
      '₹500 to ₹400 · Reason: Senior citizen',
    )
  })

  it('lists changed field names but never the values', () => {
    const line = summarize('patient.updated', { before: { phone: '9876543210' }, after: { phone: '9123456780' } })
    expect(line).toBe('Changed: phone')
    expect(line).not.toContain('98765')
  })

  it('summarises a backdated visit and a printed copy', () => {
    expect(summarize('visit.backdated', { visitDate: '2026-10-20', reason: 'Forgot' })).toBe(
      'For 20 Oct 2026 · Reason: Forgot',
    )
    expect(summarize('document.printed', { number: 'MUM/2026-27/0001', duplicate: true })).toBe(
      'MUM/2026-27/0001 · Duplicate copy',
    )
  })

  it('returns nothing when there is nothing useful to say', () => {
    expect(summarize('patient.viewed', null)).toBeNull()
    expect(summarize('patient.viewed', {})).toBeNull()
    expect(summarize('unknown.action', { x: 1 })).toBeNull()
  })
})

describe('detail dialog data', () => {
  it('builds before and after rows', () => {
    expect(changesOf({ before: { address: null }, after: { address: '12 MG Road' } })).toEqual([
      { field: 'address', before: '(empty)', after: '12 MG Road' },
    ])
    expect(changesOf({ amount: '5.00' })).toEqual([])
  })

  it('lists the other facts and leaves out ids it shows elsewhere', () => {
    expect(factsOf({ patientId: 'x', amount: '500.00', bulk: true, before: {}, reason: 'Late' })).toEqual([
      { label: 'Amount', value: '₹500' },
      { label: 'Bulk', value: 'Yes' },
      { label: 'Reason', value: 'Late' },
    ])
  })

  it('shows values readably', () => {
    expect(showValue(null)).toBe('(empty)')
    expect(showValue(['a', 'b'])).toBe('a, b')
    expect(showValue(12)).toBe('12')
  })
})
