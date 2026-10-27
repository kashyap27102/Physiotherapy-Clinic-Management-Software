import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ImageUp, Loader2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { api, errorMessage, isApiError, type Clinic } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName, textareaClassName } from '@/components/common/Field'
import { SectionCard } from '@/components/common/SectionCard'
import { LogoMark } from '@/components/layout/Logo'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { queryKeys } from '@/lib/queryKeys'
import { applyFieldErrors } from '@/lib/forms'
import { t } from '@/strings/en'

const LOGO_MAX_BYTES = 200 * 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']

/** TEN-001: the owner's clinic profile and logo (printed on receipts). */
export function ClinicSettingsPage() {
  const clinic = useQuery({ queryKey: queryKeys.clinic, queryFn: () => api.clinic.get() })

  return (
    <>
      <PageHeader crumbs={[{ label: t.settings.section }, { label: t.clinicSettings.title }]} />
      {clinic.isPending ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[520px] rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : clinic.isError ? (
        <FormAlert>{t.settings.loadError}</FormAlert>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <ProfileCard clinic={clinic.data} />
          <LogoCard clinic={clinic.data} />
        </div>
      )}
    </>
  )
}

interface ProfileValues {
  name: string
  phone: string
  address: string
  registrationDetails: string
  inactiveAfterDays: number
}

const PROFILE_FIELDS = ['name', 'phone', 'address', 'registrationDetails', 'inactiveAfterDays'] as const

const toValues = (clinic: Clinic): ProfileValues => ({
  name: clinic.name,
  phone: clinic.phone ?? '',
  address: clinic.address ?? '',
  registrationDetails: clinic.registrationDetails ?? '',
  inactiveAfterDays: clinic.inactiveAfterDays,
})

function ProfileCard({ clinic }: { clinic: Clinic }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<ProfileValues>({ defaultValues: toValues(clinic) })
  const { errors, isDirty } = form.formState

  // Keep the form in step when the profile is saved or refetched.
  useEffect(() => form.reset(toValues(clinic)), [clinic, form])

  const save = useMutation({
    mutationFn: (values: ProfileValues) =>
      api.clinic.update({
        name: values.name.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        registrationDetails: values.registrationDetails.trim(),
        inactiveAfterDays: Number(values.inactiveAfterDays),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.clinic, updated)
      toast.success(t.settings.saved)
    },
    onError: (e) => {
      if (isApiError(e, 'VALIDATION_FAILED') && applyFieldErrors(e.fields, PROFILE_FIELDS, form.setError)) return
      setError(errorMessage(e, t.common.genericError))
    },
  })

  return (
    <SectionCard title={t.clinicSettings.profileTitle}>
      <p className="-mt-1 mb-5 text-sm text-muted-foreground">{t.clinicSettings.profileBody}</p>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setError(null)
          save.mutate(values)
        })}
      >
        <Field id="name" label={t.clinicSettings.name} error={errors.name?.message}>
          <Input
            id="name"
            className={inputClassName}
            aria-invalid={Boolean(errors.name) || undefined}
            {...form.register('name', { validate: (v) => v.trim().length >= 2 || t.signup.required })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="phone" label={t.clinicSettings.phone} optional error={errors.phone?.message}>
            <Input id="phone" type="tel" className={inputClassName} {...form.register('phone')} />
          </Field>
          <Field
            id="inactiveAfterDays"
            label={t.clinicSettings.inactiveDays}
            error={errors.inactiveAfterDays?.message}
            hint={t.clinicSettings.inactiveDaysHint}
          >
            <div className="flex items-center gap-2">
              <Input
                id="inactiveAfterDays"
                type="number"
                inputMode="numeric"
                min={1}
                className={`${inputClassName} w-24`}
                aria-invalid={Boolean(errors.inactiveAfterDays) || undefined}
                {...form.register('inactiveAfterDays', {
                  valueAsNumber: true,
                  validate: (v) => (Number.isInteger(v) && v >= 1 && v <= 3650) || t.signup.required,
                })}
              />
              <span className="text-sm text-muted-foreground">{t.clinicSettings.inactiveDaysSuffix}</span>
            </div>
          </Field>
        </div>

        <Field id="address" label={t.clinicSettings.address} optional error={errors.address?.message}>
          <textarea id="address" rows={2} className={textareaClassName} {...form.register('address')} />
        </Field>

        <Field
          id="registrationDetails"
          label={t.clinicSettings.registration}
          optional
          error={errors.registrationDetails?.message}
          hint={t.clinicSettings.registrationHint}
        >
          <textarea
            id="registrationDetails"
            rows={2}
            className={textareaClassName}
            {...form.register('registrationDetails')}
          />
        </Field>

        {error && <FormAlert>{error}</FormAlert>}
        {!online && <FormAlert tone="info">{t.offline.blocked}</FormAlert>}

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className="h-10"
            disabled={!isDirty || save.isPending}
            onClick={() => form.reset(toValues(clinic))}
          >
            {t.settings.discard}
          </Button>
          <Button type="submit" className="h-10 px-4" disabled={!isDirty || save.isPending || !online}>
            {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {save.isPending ? t.settings.saving : t.settings.saveChanges}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}

function LogoCard({ clinic }: { clinic: Clinic }) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const onSaved = (updated: Clinic, message: string) => {
    queryClient.setQueryData(queryKeys.clinic, updated)
    toast.success(message)
  }

  const upload = useMutation({
    mutationFn: (file: File) => api.clinic.uploadLogo(file),
    onSuccess: (updated) => onSaved(updated, t.clinicSettings.logoSaved),
    onError: (e) => setError(errorMessage(e, t.common.genericError)),
  })
  const remove = useMutation({
    mutationFn: () => api.clinic.removeLogo(),
    onSuccess: (updated) => onSaved(updated, t.clinicSettings.logoRemoved),
    onError: (e) => setError(errorMessage(e, t.common.genericError)),
  })

  function choose(file: File | undefined) {
    if (input.current) input.current.value = ''
    if (!file) return
    setError(null)
    // Checked here for a quick answer; the server checks the real image type and size again.
    if (!LOGO_TYPES.includes(file.type)) return setError(t.clinicSettings.logoWrongType)
    if (file.size > LOGO_MAX_BYTES) return setError(t.clinicSettings.logoTooBig)
    upload.mutate(file)
  }

  const busy = upload.isPending || remove.isPending

  return (
    <SectionCard title={t.clinicSettings.logoTitle}>
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="relative flex size-36 items-center justify-center overflow-hidden rounded-2xl border bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-[length:16px_16px]">
          {clinic.logoVersion ? (
            <img
              src={`/api/v1/clinic/logo?v=${clinic.logoVersion}`}
              alt={t.clinicSettings.logoAlt(clinic.name)}
              className="size-full object-contain p-3"
            />
          ) : (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <LogoMark className="size-12 opacity-30 grayscale" />
              <span className="text-xs">{t.clinicSettings.logoNone}</span>
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
            </div>
          )}
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t.clinicSettings.logoBody}</p>

        <input
          ref={input}
          type="file"
          accept={LOGO_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => choose(e.target.files?.[0])}
        />
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
          <Button
            variant="outline"
            className="h-10 flex-1"
            disabled={busy || !online}
            onClick={() => input.current?.click()}
          >
            <ImageUp aria-hidden />
            {upload.isPending
              ? t.clinicSettings.logoUploading
              : clinic.logoVersion
                ? t.clinicSettings.logoReplace
                : t.clinicSettings.logoUpload}
          </Button>
          {clinic.logoVersion && (
            <Button
              variant="ghost"
              className="h-10 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              disabled={busy || !online}
              onClick={() => {
                setError(null)
                remove.mutate()
              }}
            >
              <Trash2 aria-hidden />
              {t.clinicSettings.logoRemove}
            </Button>
          )}
        </div>
        {error && (
          <div className="w-full text-left">
            <FormAlert>{error}</FormAlert>
          </div>
        )}
      </div>
    </SectionCard>
  )
}
