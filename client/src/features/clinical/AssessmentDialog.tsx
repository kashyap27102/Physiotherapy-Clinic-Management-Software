import { useQueryClient } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { api, type Assessment } from '@/api'
import { Field, inputClassName, textareaClassName } from '@/components/common/Field'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFormMutation } from '@/hooks/useFormMutation'
import { t } from '@/strings/en'
import { ClinicalFormShell, clinicalDialogClass, FormSection } from './ClinicalFormShell'
import {
  ASSESSMENT_FORM_FIELDS,
  assessmentValues,
  formFieldOf,
  isEmptyAssessment,
  toAssessmentInput,
  type AssessmentFormValues,
} from './clinicalForm'
import { PainScale } from './PainScale'
import { afterVersionSaved, versionConflictMessage } from './saveVersion'

interface Props {
  episodeId: string
  latest: Assessment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** CLN-002 / US-12: record or update the initial assessment. Every save is a new version (BR-CLN-4). */
export function AssessmentDialog({ episodeId, latest, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={clinicalDialogClass}>
        {/* Mounted only while open, so the form always starts from the latest saved version. */}
        {open && <AssessmentForm episodeId={episodeId} latest={latest} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function AssessmentForm({
  episodeId,
  latest,
  onClose,
}: {
  episodeId: string
  latest: Assessment | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const { register, handleSubmit, control, setError, formState } = useForm<AssessmentFormValues>({
    defaultValues: assessmentValues(latest),
  })
  const { errors, isDirty } = formState

  const save = useFormMutation({
    fields: ASSESSMENT_FORM_FIELDS,
    setError,
    toName: formFieldOf,
    onError: versionConflictMessage,
    mutationFn: (values: AssessmentFormValues) => api.episodes.saveAssessment(episodeId, toAssessmentInput(values)),
    onSuccess: async (saved) => {
      await afterVersionSaved(queryClient, episodeId, latest?.version ?? null, saved.version)
      onClose()
    },
  })

  const onSubmit = handleSubmit((values) => {
    if (isEmptyAssessment(toAssessmentInput(values))) {
      save.setFormError(t.episode.emptyForm)
      return
    }
    save.submit(values)
  })

  return (
    <ClinicalFormShell
      title={latest ? t.episode.editAssessment : t.episode.record}
      description={t.episode.assessmentFormBody}
      onSubmit={onSubmit}
      onCancel={onClose}
      pending={save.isPending}
      canSave={isDirty}
      error={save.formError}
    >
      <FormSection id="assess-complaint" title={t.episode.chiefComplaint}>
        <Field id="chiefComplaint" label={t.episode.chiefComplaint} error={errors.chiefComplaint?.message} optional>
          <Input
            id="chiefComplaint"
            className={inputClassName}
            placeholder={t.episode.chiefComplaintPlaceholder}
            autoFocus
            aria-invalid={!!errors.chiefComplaint}
            {...register('chiefComplaint', { maxLength: { value: 500, message: t.episode.tooLong(500) } })}
          />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span id="painScore-label" className="text-sm font-medium">
              {t.episode.painScore}
              <span className="ml-1 font-normal text-muted-foreground">({t.common.optional})</span>
            </span>
          </div>
          <Controller
            control={control}
            name="painScore"
            render={({ field }) => <PainScale id="painScore" value={field.value} onChange={field.onChange} />}
          />
          {errors.painScore ? (
            <p className="text-xs text-destructive" role="alert">
              {errors.painScore.message}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t.episode.painScoreHint}</p>
          )}
        </div>
      </FormSection>

      <FormSection id="assess-findings" title={t.episode.assessment}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            id="history"
            label={t.episode.history}
            placeholder={t.episode.historyPlaceholder}
            max={4000}
            error={errors.history?.message}
            register={register}
          />
          <TextArea
            id="pain"
            label={t.episode.pain}
            placeholder={t.episode.painPlaceholder}
            max={2000}
            error={errors.pain?.message}
            register={register}
          />
          <TextArea
            id="rangeOfMotion"
            label={t.episode.rangeOfMotion}
            placeholder={t.episode.romPlaceholder}
            max={2000}
            error={errors.rangeOfMotion?.message}
            register={register}
          />
          <TextArea
            id="diagnosis"
            label={t.episode.diagnosis}
            placeholder={t.episode.diagnosisPlaceholder}
            max={1000}
            error={errors.diagnosis?.message}
            register={register}
          />
        </div>
      </FormSection>
    </ClinicalFormShell>
  )
}

function TextArea({
  id,
  label,
  placeholder,
  max,
  error,
  register,
}: {
  id: 'history' | 'pain' | 'rangeOfMotion' | 'diagnosis'
  label: string
  placeholder: string
  max: number
  error?: string
  register: ReturnType<typeof useForm<AssessmentFormValues>>['register']
}) {
  return (
    <Field id={id} label={label} error={error} optional>
      <textarea
        id={id}
        rows={4}
        className={textareaClassName}
        placeholder={placeholder}
        aria-invalid={!!error}
        {...register(id, { maxLength: { value: max, message: t.episode.tooLong(max) } })}
      />
    </Field>
  )
}
