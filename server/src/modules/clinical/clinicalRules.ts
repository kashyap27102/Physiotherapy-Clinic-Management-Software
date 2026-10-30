/** Pure clinical rules (CLN-002, CLN-003): which edits count as a change, and plan progress. */

export const ASSESSMENT_TEXT_FIELDS = ['history', 'pain', 'rangeOfMotion', 'diagnosis'] as const
export const PLAN_TEXT_FIELDS = ['diagnosis', 'goals', 'frequency', 'therapyTypes', 'notes'] as const

export interface AssessmentContent {
  history: string | null
  pain: string | null
  rangeOfMotion: string | null
  diagnosis: string | null
  /** Chief complaint, pain score and others. */
  extraFields: Record<string, string | number>
}

export interface PlanContent {
  diagnosis: string | null
  goals: string | null
  plannedSessions: number | null
  frequency: string | null
  therapyTypes: string | null
  /** Two decimals, for example "1500.00". Informational only (BR-CLN-5). */
  estimatedCost: string | null
  notes: string | null
}

/** True when nothing was written at all, so an empty save is refused. */
export function isEmptyAssessment(content: AssessmentContent): boolean {
  return ASSESSMENT_TEXT_FIELDS.every((key) => !content[key]) && Object.keys(content.extraFields).length === 0
}

export function isEmptyPlan(content: PlanContent): boolean {
  return (
    PLAN_TEXT_FIELDS.every((key) => !content[key]) && content.plannedSessions === null && content.estimatedCost === null
  )
}

/** Key order must not matter when two JSON objects are compared. */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`
}

/** Saving the same content again must not create a new version. */
export const sameContent = (a: object, b: object): boolean => stable(a) === stable(b)

/** "Session 6 of 10" and whether the plan is exceeded (BR-CLN-6). A guide, never a limit. */
export function planProgress(sessionsDone: number, plannedSessions: number | null) {
  if (plannedSessions === null) return { sessionsDone, plannedSessions: null, exceeded: false }
  return { sessionsDone, plannedSessions, exceeded: sessionsDone > plannedSessions }
}
