import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { api, errorMessage, isApiError, type PatientDetail, type PatientListItem } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DuplicateNotice } from '@/features/patients/DuplicateNotice'
import { CoreFields, OptionalFields, type PatientFormValues } from '@/features/patients/PatientFormFields'
import { PATIENT_FORM_FIELDS, toUpdateInput, valuesFromPatient } from '@/features/patients/patientForm'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { applyFieldErrors } from '@/lib/forms'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

interface Props {
  patient: PatientDetail
  open: boolean
  onOpenChange: (open: boolean) => void
}

/** PAT-004: correct a patient's details. The form resets every time it opens; the audit log keeps old and new values. */
export function EditPatientDialog({ patient, open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        {open && <EditForm patient={patient} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function EditForm({ patient, onClose }: { patient: PatientDetail; onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [duplicates, setDuplicates] = useState<PatientListItem[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<PatientFormValues>({ defaultValues: valuesFromPatient(patient) })
  const { register, handleSubmit, setError, control, formState } = form
  const { errors, isDirty } = formState
  const values = useWatch({ control })

  const save = useMutation({
    mutationFn: ({ input, confirmDuplicate }: { input: PatientFormValues; confirmDuplicate: boolean }) =>
      api.patients.update(patient.id, toUpdateInput(input), { confirmDuplicate }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.patient(patient.id), updated)
      await queryClient.invalidateQueries({ queryKey: ['patients'] })
      toast.success(t.patient.saved)
      onClose()
    },
    onError: (error) => {
      // US-11a.2: the new phone number belongs to someone else; show who, and let the user decide.
      if (isApiError(error, 'DUPLICATE_PATIENT_WARNING')) {
        setDuplicates((error.details as { candidates?: PatientListItem[] } | undefined)?.candidates ?? [])
        return
      }
      if (isApiError(error, 'VALIDATION_FAILED') && applyFieldErrors(error.fields, PATIENT_FORM_FIELDS, setError))
        return
      setFormError(errorMessage(error, t.common.genericError))
    },
  })

  const submit = (confirmDuplicate: boolean) =>
    handleSubmit((input) => {
      setFormError(null)
      save.mutate({ input, confirmDuplicate })
    })

  return (
    <form onSubmit={submit(false)} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader className="px-5 pt-5 pb-4">
        <DialogTitle className="text-base">{t.patient.editTitle}</DialogTitle>
        <DialogDescription>{t.patient.editBody}</DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto border-y px-5 py-5">
        {duplicates && (
          <div className="space-y-3">
            <DuplicateNotice candidates={duplicates} onOpen={onClose} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={() => setDuplicates(null)}>
                {t.common.cancel}
              </Button>
              <Button type="button" className="h-10" disabled={save.isPending} onClick={() => void submit(true)()}>
                {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
                {t.register.saveAnyway}
              </Button>
            </div>
          </div>
        )}

        <section aria-labelledby="edit-core" className="space-y-4">
          <h3 id="edit-core" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t.patient.personalSection}
          </h3>
          <CoreFields
            register={register}
            errors={errors}
            values={{
              ageMode: values.ageMode ?? 'age',
              gender: values.gender ?? '',
              phoneContactType: values.phoneContactType ?? 'self',
            }}
          />
        </section>

        <section aria-labelledby="edit-more" className="space-y-4">
          <h3 id="edit-more" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t.register.moreSection}
          </h3>
          <OptionalFields register={register} errors={errors} />
        </section>

        {formError && <FormAlert>{formError}</FormAlert>}
        {!online && <FormAlert tone="info">{t.offline.blocked}</FormAlert>}
      </div>

      <div className="flex flex-col-reverse gap-2 px-5 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="h-10" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" className="h-10 px-5" disabled={!isDirty || save.isPending || !online}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending ? t.settings.saving : t.settings.saveChanges}
        </Button>
      </div>
    </form>
  )
}
