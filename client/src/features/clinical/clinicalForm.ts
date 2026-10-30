import type { Assessment, AssessmentInput, TreatmentPlan, TreatmentPlanInput } from '@/api'
import { isValidAmount } from '@/lib/money'

/* Form values are plain strings so inputs stay controlled; these helpers turn them into API input and back. */

export interface AssessmentFormValues {
  chiefComplaint: string
  /** Null when no score was chosen. */
  painScore: number | null
  history: string
  pain: string
  rangeOfMotion: string
  diagnosis: string
}

export const ASSESSMENT_FORM_FIELDS = [
  'chiefComplaint',
  'painScore',
  'history',
  'pain',
  'rangeOfMotion',
  'diagnosis',
] as const

/** The form starts from the latest version, so an update only changes what the therapist touches. */
export function assessmentValues(latest: Assessment | null): AssessmentFormValues {
  return {
    chiefComplaint: latest?.extraFields.chiefComplaint ?? '',
    painScore: latest?.extraFields.painScore ?? null,
    history: latest?.history ?? '',
    pain: latest?.pain ?? '',
    rangeOfMotion: latest?.rangeOfMotion ?? '',
    diagnosis: latest?.diagnosis ?? '',
  }
}

const filled = (value: string) => value.trim() || undefined

export function toAssessmentInput(values: AssessmentFormValues): AssessmentInput {
  const extraFields: NonNullable<AssessmentInput['extraFields']> = {}
  const complaint = filled(values.chiefComplaint)
  if (complaint) extraFields.chiefComplaint = complaint
  if (values.painScore !== null) extraFields.painScore = values.painScore
  return {
    history: filled(values.history),
    pain: filled(values.pain),
    rangeOfMotion: filled(values.rangeOfMotion),
    diagnosis: filled(values.diagnosis),
    extraFields,
  }
}

export function isEmptyAssessment(input: AssessmentInput): boolean {
  return (
    !input.history &&
    !input.pain &&
    !input.rangeOfMotion &&
    !input.diagnosis &&
    !input.extraFields?.chiefComplaint &&
    input.extraFields?.painScore === undefined
  )
}

export interface PlanFormValues {
  diagnosis: string
  goals: string
  plannedSessions: string
  frequency: string
  therapyTypes: string
  estimatedCost: string
  notes: string
}

export const PLAN_FORM_FIELDS = [
  'diagnosis',
  'goals',
  'plannedSessions',
  'frequency',
  'therapyTypes',
  'estimatedCost',
  'notes',
] as const

/** A first plan borrows the diagnosis from the assessment, which is nearly always the same. */
export function planValues(latest: TreatmentPlan | null, assessmentDiagnosis?: string | null): PlanFormValues {
  return {
    diagnosis: latest ? (latest.diagnosis ?? '') : (assessmentDiagnosis ?? ''),
    goals: latest?.goals ?? '',
    plannedSessions: latest?.plannedSessions ? String(latest.plannedSessions) : '',
    frequency: latest?.frequency ?? '',
    therapyTypes: latest?.therapyTypes ?? '',
    estimatedCost: latest?.estimatedCost ?? '',
    notes: latest?.notes ?? '',
  }
}

/** Whole sessions from 1 to 500, or empty. */
export function isValidSessions(text: string): boolean {
  const value = text.trim()
  return value === '' || (/^\d{1,3}$/.test(value) && Number(value) >= 1 && Number(value) <= 500)
}

/** Empty, or an amount such as 1500, 1,500 or 1500.50. */
export function isValidEstimate(text: string): boolean {
  const value = text.trim().replace(/,/g, '')
  return value === '' || isValidAmount(value)
}

export function toPlanInput(values: PlanFormValues): TreatmentPlanInput {
  const sessions = values.plannedSessions.trim()
  return {
    diagnosis: filled(values.diagnosis),
    goals: filled(values.goals),
    plannedSessions: sessions ? Number(sessions) : undefined,
    frequency: filled(values.frequency),
    therapyTypes: filled(values.therapyTypes),
    // Sent as a string: money never travels as a float.
    estimatedCost: filled(values.estimatedCost.replace(/,/g, '')),
    notes: filled(values.notes),
  }
}

export function isEmptyPlan(input: TreatmentPlanInput): boolean {
  return Object.values(input).every((value) => value === undefined)
}

/** The server names nested fields with a path ("extraFields.painScore"); the form knows them by the last part. */
export const formFieldOf = (serverField: string): string => serverField.split('.').pop() ?? serverField

/** Common frequencies, offered as suggestions so the therapist rarely has to type. */
export const FREQUENCY_SUGGESTIONS = ['Daily', '5 times a week', '3 times a week', '2 times a week', 'Once a week']

export const THERAPY_SUGGESTIONS = [
  'Exercise therapy',
  'Manual therapy',
  'IFT',
  'TENS',
  'Ultrasound',
  'Hot pack',
  'Cold pack',
  'Traction',
  'Dry needling',
  'Taping',
]
