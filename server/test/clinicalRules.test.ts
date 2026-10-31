import { describe, expect, it } from 'vitest'
import { isEmptyAssessment, isEmptyPlan, planProgress, sameContent } from '../src/modules/clinical/clinicalRules.js'
import { assessmentBody, planBody } from '../src/modules/clinical/clinical.schemas.js'

describe('clinical rules (CLN-002, CLN-003)', () => {
  it('treats an assessment with nothing written as empty', () => {
    const blank = { history: null, pain: null, rangeOfMotion: null, diagnosis: null, extraFields: {} }
    expect(isEmptyAssessment(blank)).toBe(true)
    expect(isEmptyAssessment({ ...blank, extraFields: { painScore: 0 } })).toBe(false)
    expect(isEmptyAssessment({ ...blank, diagnosis: 'ACL strain' })).toBe(false)
  })

  it('treats a plan with nothing filled in as empty', () => {
    const blank = {
      diagnosis: null,
      goals: null,
      plannedSessions: null,
      frequency: null,
      therapyTypes: null,
      estimatedCost: null,
      notes: null,
    }
    expect(isEmptyPlan(blank)).toBe(true)
    expect(isEmptyPlan({ ...blank, plannedSessions: 10 })).toBe(false)
    expect(isEmptyPlan({ ...blank, estimatedCost: '0.00' })).toBe(false)
  })

  it('compares content without caring about key order', () => {
    expect(sameContent({ a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toBe(true)
    expect(sameContent({ a: 1 }, { a: 2 })).toBe(false)
  })

  it('reports plan progress as a guide, never a limit (BR-CLN-6)', () => {
    expect(planProgress(6, 10)).toEqual({ sessionsDone: 6, plannedSessions: 10, exceeded: false })
    expect(planProgress(10, 10).exceeded).toBe(false)
    expect(planProgress(11, 10).exceeded).toBe(true)
    expect(planProgress(4, null)).toEqual({ sessionsDone: 4, plannedSessions: null, exceeded: false })
  })
})

describe('clinical input rules', () => {
  it('trims text, drops empty values and keeps a pain score of zero', () => {
    const parsed = assessmentBody.parse({ history: '  Knee pain ', pain: '   ', extraFields: { painScore: 0 } })
    expect(parsed).toMatchObject({ history: 'Knee pain', pain: null, extraFields: { painScore: 0 } })
  })

  it('names a pain score outside 0 to 10 and refuses unknown extra fields', () => {
    expect(assessmentBody.safeParse({ extraFields: { painScore: 11 } }).success).toBe(false)
    expect(assessmentBody.safeParse({ extraFields: { surprise: 'x' } }).success).toBe(false)
  })

  it('keeps the estimated cost as an exact two-decimal string, never a float', () => {
    expect(planBody.parse({ estimatedCost: 1500 }).estimatedCost).toBe('1500.00')
    expect(planBody.parse({ estimatedCost: '1500.5' }).estimatedCost).toBe('1500.50')
    expect(planBody.parse({ estimatedCost: '' }).estimatedCost).toBeNull()
    expect(planBody.safeParse({ estimatedCost: '-5' }).success).toBe(false)
    expect(planBody.safeParse({ estimatedCost: '10.999' }).success).toBe(false)
  })

  it('needs whole planned sessions of at least one', () => {
    expect(planBody.parse({ plannedSessions: 10 }).plannedSessions).toBe(10)
    expect(planBody.safeParse({ plannedSessions: 0 }).success).toBe(false)
    expect(planBody.safeParse({ plannedSessions: 2.5 }).success).toBe(false)
  })
})
