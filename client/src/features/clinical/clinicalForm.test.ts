import { describe, expect, it } from 'vitest'
import type { Assessment, TreatmentPlan } from '@/api'
import {
  assessmentValues,
  formFieldOf,
  isEmptyAssessment,
  isEmptyPlan,
  isValidEstimate,
  isValidSessions,
  planValues,
  toAssessmentInput,
  toPlanInput,
} from './clinicalForm'

const assessment: Assessment = {
  id: 'a1',
  episodeId: 'e1',
  version: 2,
  history: 'Fell while running',
  pain: null,
  rangeOfMotion: 'Knee flexion 0–95°',
  diagnosis: 'ACL sprain',
  extraFields: { chiefComplaint: 'Knee pain', painScore: 0 },
  author: 'Dr Rao',
  createdAt: '2026-10-29T10:00:00.000Z',
}

describe('assessment form (CLN-002)', () => {
  it('starts from the latest version, keeping a pain score of zero', () => {
    expect(assessmentValues(assessment)).toEqual({
      chiefComplaint: 'Knee pain',
      painScore: 0,
      history: 'Fell while running',
      pain: '',
      rangeOfMotion: 'Knee flexion 0–95°',
      diagnosis: 'ACL sprain',
    })
    expect(assessmentValues(null).painScore).toBeNull()
  })

  it('trims text, drops blanks and sends the score only when chosen', () => {
    const input = toAssessmentInput({ ...assessmentValues(null), history: '  Stairs hurt  ', pain: '   ' })
    expect(input).toEqual({
      history: 'Stairs hurt',
      pain: undefined,
      rangeOfMotion: undefined,
      diagnosis: undefined,
      extraFields: {},
    })
    expect(toAssessmentInput({ ...assessmentValues(null), painScore: 0 }).extraFields).toEqual({ painScore: 0 })
  })

  it('treats a form with nothing written as empty, but a pain score of zero as something', () => {
    expect(isEmptyAssessment(toAssessmentInput(assessmentValues(null)))).toBe(true)
    expect(isEmptyAssessment(toAssessmentInput({ ...assessmentValues(null), painScore: 0 }))).toBe(false)
  })
})

const plan: TreatmentPlan = {
  id: 'p1',
  episodeId: 'e1',
  version: 1,
  diagnosis: 'ACL sprain',
  goals: 'Run 5 km',
  plannedSessions: 10,
  frequency: '3 times a week',
  therapyTypes: 'IFT, Exercise therapy',
  estimatedCost: '5000.00',
  notes: null,
  author: 'Dr Rao',
  createdAt: '2026-10-29T10:00:00.000Z',
}

describe('treatment plan form (CLN-003)', () => {
  it('borrows the assessment diagnosis for a first plan only', () => {
    expect(planValues(null, 'ACL sprain').diagnosis).toBe('ACL sprain')
    expect(planValues({ ...plan, diagnosis: null }, 'ACL sprain').diagnosis).toBe('')
    expect(planValues(plan).plannedSessions).toBe('10')
  })

  it('accepts whole sessions from 1 to 500, or nothing', () => {
    expect(isValidSessions('')).toBe(true)
    expect(isValidSessions('10')).toBe(true)
    expect(isValidSessions('0')).toBe(false)
    expect(isValidSessions('2.5')).toBe(false)
    expect(isValidSessions('501')).toBe(false)
  })

  it('accepts an estimate as rupees with up to two decimals, commas allowed', () => {
    for (const ok of ['', '0', '1500', '1,500', '1500.5', '1500.50']) expect(isValidEstimate(ok), ok).toBe(true)
    for (const bad of ['-5', 'abc', '10.999', '1e3']) expect(isValidEstimate(bad), bad).toBe(false)
  })

  it('sends money as a string without commas, and sessions as a number', () => {
    const input = toPlanInput({ ...planValues(null), estimatedCost: '1,500', plannedSessions: ' 12 ' })
    expect(input.estimatedCost).toBe('1500')
    expect(input.plannedSessions).toBe(12)
    expect(isEmptyPlan(toPlanInput(planValues(null)))).toBe(true)
  })

  it('maps nested server field names onto form fields', () => {
    expect(formFieldOf('extraFields.painScore')).toBe('painScore')
    expect(formFieldOf('goals')).toBe('goals')
  })
})
