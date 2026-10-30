import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, UserRoundPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api, errorDetails, isApiError, type PatientListItem } from '@/api'
import { useUser } from '@/auth/hooks'
import { useBranchScope } from '@/branchScope/context'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, selectClassName } from '@/components/common/Field'
import { SectionCard } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CoreFields, OptionalFields, type PatientFormValues } from '@/features/patients/PatientFormFields'
import { DuplicateNotice } from '@/features/patients/DuplicateNotice'
import { blankValues, PATIENT_FORM_FIELDS, toCreateInput } from '@/features/patients/patientForm'
import { useFormMutation } from '@/hooks/useFormMutation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { queryKeys } from '@/lib/queryKeys'
import { OfflineNotice } from '@/components/common/OfflineNotice'
import { t } from '@/strings/en'

/** PAT-001: register a patient with name, phone, age (or date of birth) and gender; everything else is optional. */
export function RegisterPatientPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const user = useUser()
  const prefill = (useLocation().state as { prefill?: string } | null)?.prefill ?? ''

  const [duplicates, setDuplicates] = useState<PatientListItem[] | null>(null)

  // Owners work in every branch, so they say where the patient is registered. Staff always use their own branch.
  // If the server says it needs a branch the form did not ask for, the picker appears instead of failing silently.
  const [serverWantsBranch, setServerWantsBranch] = useState(false)
  const needsBranch = !user.branch || serverWantsBranch
  const branches = useQuery({
    queryKey: queryKeys.branches,
    queryFn: () => api.branches.list(),
    enabled: needsBranch,
  })
  const activeBranches = branches.data?.filter((b) => b.isActive) ?? []

  // The branch chosen in the top bar is the likely place of registration.
  const scopedBranchId = useBranchScope().branchId
  const form = useForm<PatientFormValues>({
    defaultValues: { ...blankValues(prefill), branchId: scopedBranchId ?? '' },
  })
  const { register, handleSubmit, setError, control, formState } = form
  const { errors } = formState
  const values = useWatch({ control })
  const ageMode = values.ageMode ?? 'age'

  const create = useFormMutation({
    fields: PATIENT_FORM_FIELDS,
    setError,
    mutationFn: ({ input, confirmDuplicate }: { input: PatientFormValues; confirmDuplicate: boolean }) =>
      api.patients.create(toCreateInput(input), { confirmDuplicate }),
    onSuccess: async (patient) => {
      toast.success(t.register.created)
      await queryClient.invalidateQueries({ queryKey: ['patients'] })
      void navigate(`/patients/${patient.id}`, { replace: true })
    },
    onError: (error) => {
      if (isApiError(error, 'DUPLICATE_PATIENT_WARNING')) {
        setDuplicates(errorDetails<{ candidates: PatientListItem[] }>(error).candidates ?? [])
        return true
      }
      // The server wants a branch the form did not ask for: show the picker (the error itself lands on the field).
      if (isApiError(error, 'VALIDATION_FAILED') && error.fields.some((field) => field.field === 'branchId')) {
        setServerWantsBranch(true)
      }
    },
  })

  const submit = (confirmDuplicate: boolean) =>
    handleSubmit((input) => {
      setDuplicates(null)
      create.submit({ input, confirmDuplicate })
    })

  return (
    <>
      <PageHeader crumbs={[{ label: t.nav.patients, to: '/' }, { label: t.register.title }]} />

      <form onSubmit={submit(false)} noValidate className="max-w-3xl space-y-6">
        <SectionCard title={t.register.patientSection}>
          <p className="-mt-1 mb-5 text-sm text-muted-foreground">{t.register.subtitle}</p>
          <CoreFields
            register={register}
            errors={errors}
            values={{
              ageMode,
              gender: values.gender ?? '',
              phoneContactType: values.phoneContactType ?? 'self',
            }}
          />

          {needsBranch && (
            <div className="mt-5 border-t pt-5">
              <Field
                id="branchId"
                label={t.register.branch}
                hint={t.register.branchHint}
                error={errors.branchId?.message}
              >
                <select
                  id="branchId"
                  className={selectClassName}
                  aria-invalid={Boolean(errors.branchId) || undefined}
                  {...register('branchId', { validate: (v) => v !== '' || t.register.errors.branch })}
                >
                  <option value="">{t.register.branchPick}</option>
                  {activeBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name} ({branch.code})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </SectionCard>

        <details className="group overflow-hidden rounded-xl border bg-card shadow-xs">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-base font-semibold select-none [&::-webkit-details-marker]:hidden">
            <span>
              {t.register.moreSection}{' '}
              <span className="text-sm font-normal text-muted-foreground">({t.common.optional})</span>
            </span>
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <div className="border-t p-5">
            <OptionalFields register={register} errors={errors} />
          </div>
        </details>

        {create.formError && <FormAlert>{create.formError}</FormAlert>}
        <OfflineNotice />

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link to="/" className={buttonVariants({ variant: 'outline', className: 'h-11 px-5' })}>
            {t.common.cancel}
          </Link>
          <Button type="submit" className="h-11 gap-2 px-6" disabled={create.isPending || !online}>
            {create.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <UserRoundPlus aria-hidden />}
            {create.isPending ? t.register.submitting : t.register.submit}
          </Button>
        </div>
      </form>

      <Dialog open={duplicates !== null} onOpenChange={(open) => !open && setDuplicates(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.register.duplicateTitle}</DialogTitle>
          </DialogHeader>
          <DuplicateNotice candidates={duplicates ?? []} onOpen={() => setDuplicates(null)} />
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setDuplicates(null)}>
              {t.common.cancel}
            </Button>
            <Button className="h-10" disabled={create.isPending} onClick={() => void submit(true)()}>
              {create.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {t.register.createAnyway}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
