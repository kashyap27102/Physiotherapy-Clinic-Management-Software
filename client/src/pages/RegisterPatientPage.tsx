import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api, errorMessage, isApiError, type CreatePatientInput, type Gender, type PatientListItem } from '@/api'
import { BalanceBadge } from '@/components/common/Balance'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
import { SectionCard } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { t } from '@/strings/en'

interface FormValues {
  fullName: string
  phone: string
  age: string
  gender: Gender | ''
  phoneContactType: 'self' | 'guardian'
  address: string
  emergencyContact: string
  occupation: string
  referringDoctor: string
  email: string
  notes: string
}

const GENDERS: Gender[] = ['male', 'female', 'other', 'undisclosed']

function phoneDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits
}

export function RegisterPatientPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const prefill = ((useLocation().state as { prefill?: string } | null)?.prefill ?? '').trim()
  const prefillIsPhone = /^[\d\s+-]{3,}$/.test(prefill)

  const [duplicates, setDuplicates] = useState<PatientListItem[] | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      fullName: prefill && !prefillIsPhone ? prefill : '',
      phone: prefill && prefillIsPhone ? prefill : '',
      age: '',
      gender: '',
      phoneContactType: 'self',
      address: '',
      emergencyContact: '',
      occupation: '',
      referringDoctor: '',
      email: '',
      notes: '',
    },
  })

  const create = useMutation({
    mutationFn: ({ values, confirmDuplicate }: { values: FormValues; confirmDuplicate: boolean }) => {
      const input: CreatePatientInput = {
        fullName: values.fullName.trim(),
        phone: phoneDigits(values.phone),
        age: Number(values.age),
        gender: values.gender as Gender,
        phoneContactType: values.phoneContactType,
        address: values.address.trim() || undefined,
        emergencyContact: values.emergencyContact.trim() || undefined,
        occupation: values.occupation.trim() || undefined,
        referringDoctor: values.referringDoctor.trim() || undefined,
        email: values.email.trim() || undefined,
        notes: values.notes.trim() || undefined,
      }
      return api.patients.create(input, { confirmDuplicate })
    },
    onSuccess: async (patient) => {
      toast.success(t.register.created)
      await queryClient.invalidateQueries({ queryKey: ['patients'] })
      navigate(`/patients/${patient.id}`, { replace: true })
    },
    onError: (error) => {
      if (isApiError(error, 'DUPLICATE_PATIENT_WARNING')) {
        const details = error.details as { candidates?: PatientListItem[] } | undefined
        setDuplicates(details?.candidates ?? [])
        return
      }
      if (isApiError(error, 'VALIDATION_FAILED')) {
        for (const field of error.fields) setError(field.field as keyof FormValues, { message: field.message })
      }
      setFormError(errorMessage(error, t.common.genericError))
    },
  })

  const submit = (confirmDuplicate: boolean) =>
    handleSubmit((values) => {
      setFormError(null)
      setDuplicates(null)
      create.mutate({ values, confirmDuplicate })
    })

  return (
    <>
      <PageHeader crumbs={[{ label: t.nav.patients, to: '/' }, { label: t.register.title }]} />

      <form onSubmit={submit(false)} noValidate className="max-w-3xl">
        <SectionCard title={t.register.title}>
          <p className="mb-5 text-sm text-muted-foreground">{t.register.subtitle}</p>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field id="fullName" label={t.register.fullName} error={errors.fullName?.message}>
                <Input
                  id="fullName"
                  autoComplete="off"
                  aria-invalid={!!errors.fullName}
                  className={inputClassName}
                  {...register('fullName', { validate: (v) => v.trim() !== '' || t.register.errors.fullName })}
                />
              </Field>
            </div>

            <Field id="phone" label={t.register.phone} hint={t.register.phoneHelp} error={errors.phone?.message}>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="off"
                aria-invalid={!!errors.phone}
                className={inputClassName}
                {...register('phone', { validate: (v) => /^\d{10}$/.test(phoneDigits(v)) || t.register.errors.phone })}
              />
            </Field>

            <Field id="age" label={t.register.age} error={errors.age?.message}>
              <Input
                id="age"
                inputMode="numeric"
                autoComplete="off"
                aria-invalid={!!errors.age}
                className={inputClassName}
                {...register('age', {
                  validate: (v) => (/^\d{1,3}$/.test(v.trim()) && Number(v) <= 120) || t.register.errors.age,
                })}
              />
            </Field>

            <div className="sm:col-span-2">
              <Field id="gender" label={t.register.gender} error={errors.gender?.message}>
                <select
                  id="gender"
                  aria-invalid={!!errors.gender}
                  className={selectClassName}
                  {...register('gender', { validate: (v) => v !== '' || t.register.errors.gender })}
                >
                  <option value="">{t.register.genderPick}</option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {t.patient.gender[g]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <details className="mt-6 rounded-lg border">
            <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium">
              {t.register.moreDetails}
            </summary>
            <div className="grid gap-5 border-t p-4 sm:grid-cols-2">
              <Field id="phoneContactType" label={t.register.phoneContactType}>
                <select id="phoneContactType" className={selectClassName} {...register('phoneContactType')}>
                  <option value="self">{t.register.contactSelf}</option>
                  <option value="guardian">{t.register.contactGuardian}</option>
                </select>
              </Field>
              <Field id="email" label={t.patient.email} optional>
                <Input id="email" type="email" className={inputClassName} {...register('email')} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="address" label={t.patient.address} optional>
                  <Input id="address" className={inputClassName} {...register('address')} />
                </Field>
              </div>
              <Field id="emergencyContact" label={t.patient.emergencyContact} optional>
                <Input id="emergencyContact" className={inputClassName} {...register('emergencyContact')} />
              </Field>
              <Field id="occupation" label={t.patient.occupation} optional>
                <Input id="occupation" className={inputClassName} {...register('occupation')} />
              </Field>
              <div className="sm:col-span-2">
                <Field id="referringDoctor" label={t.patient.referringDoctor} optional>
                  <Input id="referringDoctor" className={inputClassName} {...register('referringDoctor')} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field id="notes" label={t.patient.notes} optional>
                  <Input id="notes" className={inputClassName} {...register('notes')} />
                </Field>
              </div>
            </div>
          </details>

          {formError && (
            <Alert variant="destructive" className="mt-5">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          {!online && <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">{t.offline.blocked}</p>}

          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" size="lg" className="h-10 px-5" disabled={create.isPending || !online}>
              {create.isPending ? t.register.submitting : t.register.submit}
            </Button>
            <Link to="/" className={buttonVariants({ variant: 'outline', className: 'h-10 px-5' })}>
              {t.common.cancel}
            </Link>
          </div>
        </SectionCard>
      </form>

      <Dialog open={duplicates !== null} onOpenChange={(open) => !open && setDuplicates(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.register.duplicateTitle}</DialogTitle>
            <DialogDescription>{t.register.duplicateBody}</DialogDescription>
          </DialogHeader>
          <ul className="divide-y rounded-lg border">
            {duplicates?.map((patient) => (
              <li key={patient.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{patient.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.patient.ageYears(patient.age)} · {patient.phone}
                  </div>
                </div>
                <BalanceBadge balance={patient.balance} />
                <Link to={`/patients/${patient.id}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                  {t.register.openExisting}
                </Link>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => setDuplicates(null)}>
              {t.common.cancel}
            </Button>
            <Button size="lg" onClick={() => void submit(true)()}>
              {t.register.createAnyway}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
