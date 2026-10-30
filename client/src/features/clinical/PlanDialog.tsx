import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IndianRupee } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { api, type TreatmentPlan } from '@/api'
import { Field, inputClassName, textareaClassName } from '@/components/common/Field'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { ClinicalFormShell, clinicalDialogClass, FormSection } from './ClinicalFormShell'
import {
  FREQUENCY_SUGGESTIONS,
  isEmptyPlan,
  isValidEstimate,
  isValidSessions,
  PLAN_FORM_FIELDS,
  planValues,
  THERAPY_SUGGESTIONS,
  toPlanInput,
  type PlanFormValues,
} from './clinicalForm'
import { afterVersionSaved, saveErrorMessage } from './saveVersion'

interface Props {
  episodeId: string
  latest: TreatmentPlan | null
  /** Pre-fills the first plan's diagnosis. */
  assessmentDiagnosis: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** CLN-003 / US-13: write or update the treatment plan. Every save is a new version; the cost is an estimate only. */
export function PlanDialog({ episodeId, latest, assessmentDiagnosis, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={clinicalDialogClass}>
        {open && (
          <PlanForm
            episodeId={episodeId}
            latest={latest}
            assessmentDiagnosis={assessmentDiagnosis}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({
  episodeId,
  latest,
  assessmentDiagnosis,
  onClose,
}: {
  episodeId: string
  latest: TreatmentPlan | null
  assessmentDiagnosis: string | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [formError, setFormError] = useState<string | null>(null)
  const defaults = planValues(latest, assessmentDiagnosis)
  const { register, handleSubmit, control, setValue, setError, formState } = useForm<PlanFormValues>({
    defaultValues: defaults,
  })
  const { errors, isDirty } = formState
  const frequency = useWatch({ control, name: 'frequency' })
  const therapyTypes = useWatch({ control, name: 'therapyTypes' })

  const save = useMutation({
    mutationFn: (values: PlanFormValues) => api.episodes.savePlan(episodeId, toPlanInput(values)),
    onSuccess: async (saved) => {
      await afterVersionSaved(queryClient, episodeId, latest?.version ?? null, saved.version)
      onClose()
    },
    onError: (error) => setFormError(saveErrorMessage(error, PLAN_FORM_FIELDS, setError)),
  })

  const onSubmit = handleSubmit((values) => {
    setFormError(null)
    if (isEmptyPlan(toPlanInput(values))) {
      setFormError(t.episode.emptyForm)
      return
    }
    save.mutate(values)
  })

  // Tapping a therapy adds it to the list, or takes it out again, so most plans need no typing at all.
  const chosenTherapies = therapyTypes
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const toggleTherapy = (name: string) => {
    const has = chosenTherapies.some((item) => item.toLowerCase() === name.toLowerCase())
    const next = has
      ? chosenTherapies.filter((item) => item.toLowerCase() !== name.toLowerCase())
      : [...chosenTherapies, name]
    setValue('therapyTypes', next.join(', '), { shouldDirty: true })
  }
  // A first plan with a diagnosis copied from the assessment is worth saving even before anything is typed.
  const prefilled = !latest && !!defaults.diagnosis

  return (
    <ClinicalFormShell
      title={latest ? t.episode.editPlan : t.episode.writePlan}
      description={t.episode.planFormBody}
      onSubmit={onSubmit}
      onCancel={onClose}
      pending={save.isPending}
      canSave={isDirty || prefilled}
      error={formError}
    >
      <FormSection id="plan-aims" title={t.episode.plan}>
        <Field id="plan-diagnosis" label={t.episode.diagnosis} error={errors.diagnosis?.message} optional>
          <Input
            id="plan-diagnosis"
            className={inputClassName}
            placeholder={t.episode.diagnosisPlaceholder}
            aria-invalid={!!errors.diagnosis}
            {...register('diagnosis', { maxLength: { value: 1000, message: t.episode.tooLong(1000) } })}
          />
        </Field>
        <Field id="plan-goals" label={t.episode.goals} error={errors.goals?.message} optional>
          <textarea
            id="plan-goals"
            rows={3}
            className={textareaClassName}
            placeholder={t.episode.goalsPlaceholder}
            aria-invalid={!!errors.goals}
            {...register('goals', { maxLength: { value: 2000, message: t.episode.tooLong(2000) } })}
          />
        </Field>
      </FormSection>

      <FormSection id="plan-schedule" title={t.episode.frequency}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="plan-sessions"
            label={t.episode.plannedSessions}
            error={errors.plannedSessions?.message}
            hint={t.episode.progressHint}
            optional
          >
            <Input
              id="plan-sessions"
              className={inputClassName}
              inputMode="numeric"
              placeholder="10"
              aria-invalid={!!errors.plannedSessions}
              {...register('plannedSessions', {
                validate: (value) => isValidSessions(value) || t.episode.plannedSessionsError,
              })}
            />
          </Field>
          <Field id="plan-frequency" label={t.episode.frequency} error={errors.frequency?.message} optional>
            <Input
              id="plan-frequency"
              className={inputClassName}
              placeholder={t.episode.frequencyPlaceholder}
              aria-invalid={!!errors.frequency}
              {...register('frequency', { maxLength: { value: 200, message: t.episode.tooLong(200) } })}
            />
          </Field>
        </div>
        <Chips
          label={t.episode.frequency}
          options={FREQUENCY_SUGGESTIONS}
          isOn={(option) => option.toLowerCase() === frequency.trim().toLowerCase()}
          onToggle={(option) => setValue('frequency', option, { shouldDirty: true })}
        />
      </FormSection>

      <FormSection id="plan-therapy" title={t.episode.therapyTypes}>
        <Chips
          label={t.episode.therapyTypes}
          options={THERAPY_SUGGESTIONS}
          isOn={(option) => chosenTherapies.some((item) => item.toLowerCase() === option.toLowerCase())}
          onToggle={toggleTherapy}
        />
        <Field id="plan-therapies" label={t.episode.therapyTypes} error={errors.therapyTypes?.message} optional>
          <Input
            id="plan-therapies"
            className={inputClassName}
            placeholder={t.episode.therapyTypesPlaceholder}
            aria-invalid={!!errors.therapyTypes}
            {...register('therapyTypes', { maxLength: { value: 500, message: t.episode.tooLong(500) } })}
          />
        </Field>
      </FormSection>

      <FormSection id="plan-cost" title={t.episode.estimatedCost}>
        <Field
          id="plan-cost-input"
          label={t.episode.estimatedCost}
          error={errors.estimatedCost?.message}
          hint={t.episode.estimateOnly}
          optional
        >
          <div className="relative sm:max-w-60">
            <IndianRupee
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="plan-cost-input"
              className={cn(inputClassName, 'pl-8 tabular-nums')}
              inputMode="decimal"
              placeholder="5000"
              aria-invalid={!!errors.estimatedCost}
              {...register('estimatedCost', {
                validate: (value) => isValidEstimate(value) || t.episode.estimatedCostError,
              })}
            />
          </div>
        </Field>
      </FormSection>

      <FormSection id="plan-notes" title={t.episode.exerciseNotes}>
        <Field id="plan-notes-input" label={t.episode.exerciseNotes} error={errors.notes?.message} optional>
          <textarea
            id="plan-notes-input"
            rows={4}
            className={textareaClassName}
            placeholder={t.episode.exerciseNotesPlaceholder}
            aria-invalid={!!errors.notes}
            {...register('notes', { maxLength: { value: 2000, message: t.episode.tooLong(2000) } })}
          />
        </Field>
      </FormSection>
    </ClinicalFormShell>
  )
}

/** Tappable suggestion chips (toggle buttons). They scroll sideways on a phone instead of wrapping into a wall. */
function Chips({
  label,
  options,
  isOn,
  onToggle,
}: {
  label: string
  options: readonly string[]
  isOn: (option: string) => boolean
  onToggle: (option: string) => void
}) {
  return (
    <div role="group" aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
      {options.map((option) => {
        const on = isOn(option)
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors outline-none',
              'focus-visible:ring-3 focus-visible:ring-ring/50',
              on
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-foreground hover:bg-muted',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
