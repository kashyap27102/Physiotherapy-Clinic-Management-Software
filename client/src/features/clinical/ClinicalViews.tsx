import type { ReactNode } from 'react'
import type { Assessment, TreatmentPlan } from '@/api'
import { formatINR } from '@/lib/money'
import { t } from '@/strings/en'
import { PainBadge } from './PainScale'

/** A labelled block of free text. Empty values are left out, so a short record stays short. */
function Entry({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd className="mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">{children}</dd>
    </div>
  )
}

/** Read-only assessment (US-12.3): the same view for the latest version and for any earlier one. */
export function AssessmentView({ assessment }: { assessment: Assessment }) {
  const { chiefComplaint, painScore } = assessment.extraFields
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {chiefComplaint && (
        <Entry label={t.episode.chiefComplaint} wide>
          {chiefComplaint}
        </Entry>
      )}
      {painScore !== undefined && (
        <Entry label={t.episode.painScore}>
          <PainBadge score={painScore} />
        </Entry>
      )}
      {assessment.diagnosis && <Entry label={t.episode.diagnosis}>{assessment.diagnosis}</Entry>}
      {assessment.history && (
        <Entry label={t.episode.history} wide>
          {assessment.history}
        </Entry>
      )}
      {assessment.pain && <Entry label={t.episode.pain}>{assessment.pain}</Entry>}
      {assessment.rangeOfMotion && <Entry label={t.episode.rangeOfMotion}>{assessment.rangeOfMotion}</Entry>}
    </dl>
  )
}

/** Read-only treatment plan. The cost is labelled as an estimate everywhere it appears (US-13.3). */
export function PlanView({ plan }: { plan: TreatmentPlan }) {
  const therapies = plan.therapyTypes
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {plan.diagnosis && (
        <Entry label={t.episode.diagnosis} wide>
          {plan.diagnosis}
        </Entry>
      )}
      {plan.goals && (
        <Entry label={t.episode.goals} wide>
          {plan.goals}
        </Entry>
      )}
      {plan.plannedSessions !== null && (
        <Entry label={t.episode.plannedSessions}>{t.episode.sessionsUnit(plan.plannedSessions)}</Entry>
      )}
      {plan.frequency && <Entry label={t.episode.frequency}>{plan.frequency}</Entry>}
      {therapies && therapies.length > 0 && (
        <Entry label={t.episode.therapyTypes} wide>
          <span className="flex flex-wrap gap-1.5">
            {therapies.map((item) => (
              <span
                key={item}
                className="inline-flex h-6 items-center rounded-full bg-accent px-2.5 text-xs font-medium text-accent-foreground"
              >
                {item}
              </span>
            ))}
          </span>
        </Entry>
      )}
      {plan.estimatedCost !== null && (
        <Entry label={t.episode.estimatedCost}>
          <span className="tabular-nums">{formatINR(plan.estimatedCost)}</span>
          <span className="block text-xs text-muted-foreground">{t.episode.estimateOnly}</span>
        </Entry>
      )}
      {plan.notes && (
        <Entry label={t.episode.exerciseNotes} wide>
          {plan.notes}
        </Entry>
      )}
    </dl>
  )
}
