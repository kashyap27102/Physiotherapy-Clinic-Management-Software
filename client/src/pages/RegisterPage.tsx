import { Loader2, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { api, type RegisterClinicInput } from '@/api'
import { useAuth } from '@/auth/hooks'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { textLinkClass } from '@/components/auth/styles'
import { VerifyCodeStep } from '@/components/auth/VerifyCodeStep'
import { Field, inputClassName } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormMutation } from '@/hooks/useFormMutation'
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordStrength'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

const FIELDS = ['clinicName', 'fullName', 'email', 'phone', 'password', 'acceptTerms'] as const
type FieldName = (typeof FIELDS)[number]

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
      <span className="h-px flex-1 bg-border" aria-hidden />
    </div>
  )
}

/**
 * Clinic self-registration (TEN-001, revised): the owner fills one short form, confirms the email with a code,
 * and lands signed in on the first-branch setup step.
 */
export function RegisterPage() {
  const { state, signedIn } = useAuth()
  const [registrationId, setRegistrationId] = useState<string | null>(null)

  const form = useForm<RegisterClinicInput>({
    defaultValues: { clinicName: '', fullName: '', email: '', phone: '', password: '', acceptTerms: false },
  })
  const { errors } = form.formState
  const password = useWatch({ control: form.control, name: 'password' })
  const email = useWatch({ control: form.control, name: 'email' })

  const start = useFormMutation({
    fields: FIELDS,
    setError: form.setError,
    mutationFn: (values: RegisterClinicInput) => api.auth.register({ ...values, email: values.email.trim() }),
    onSuccess: (result) => setRegistrationId(result.registrationId),
  })

  if (state.status === 'authenticated') return <Navigate to="/" replace />

  if (registrationId) {
    return (
      <VerifyCodeStep
        title={t.signup.verifyTitle}
        subtitle={t.signup.verifySubtitle(email.trim())}
        backLabel={t.signup.verifyBack}
        onBack={() => setRegistrationId(null)}
        verify={(code, trustDevice) => api.auth.verifyRegistration({ registrationId, code, trustDevice })}
        resend={async () => setRegistrationId((await api.auth.resendRegistration(registrationId)).registrationId)}
        onSignedIn={signedIn}
      />
    )
  }

  const invalid = (name: FieldName) => Boolean(errors[name]) || undefined

  return (
    <AuthLayout
      title={t.signup.title}
      subtitle={
        <>
          <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
            <Sparkles className="size-3.5" aria-hidden />
            {t.signup.trialNote}
          </span>
          <span className="block">{t.signup.subtitle}</span>
        </>
      }
      footer={
        <>
          {t.signup.haveAccount}{' '}
          <Link to="/login" className={textLinkClass}>
            {t.signup.signInLink}
          </Link>
        </>
      }
    >
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => start.submit(values))}>
        <SectionLabel>{t.signup.clinicSection}</SectionLabel>
        <Field id="clinicName" label={t.signup.clinicName} error={errors.clinicName?.message}>
          <Input
            id="clinicName"
            autoComplete="organization"
            autoFocus
            placeholder={t.signup.clinicNamePlaceholder}
            className={inputClassName}
            aria-invalid={invalid('clinicName')}
            {...form.register('clinicName', {
              validate: (v) => v.trim().length >= 2 || t.signup.required,
            })}
          />
        </Field>

        <SectionLabel>{t.signup.accountSection}</SectionLabel>
        <Field id="fullName" label={t.signup.fullName} error={errors.fullName?.message}>
          <Input
            id="fullName"
            autoComplete="name"
            placeholder={t.signup.fullNamePlaceholder}
            className={inputClassName}
            aria-invalid={invalid('fullName')}
            {...form.register('fullName', { validate: (v) => v.trim().length >= 2 || t.signup.required })}
          />
        </Field>

        <Field id="email" label={t.signup.email} error={errors.email?.message} hint={t.signup.emailHint}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t.auth.emailPlaceholder}
            className={inputClassName}
            aria-invalid={invalid('email')}
            {...form.register('email', {
              validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t.signup.invalidEmail,
            })}
          />
        </Field>

        <Field id="phone" label={t.signup.phone} error={errors.phone?.message}>
          <div
            className={cn(
              'flex h-10 items-center overflow-hidden rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30',
              errors.phone && 'border-destructive ring-3 ring-destructive/20',
            )}
          >
            <span className="flex h-full items-center border-r bg-muted/60 px-3 text-sm text-muted-foreground">
              {t.signup.phonePrefix}
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder={t.signup.phonePlaceholder}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              aria-invalid={invalid('phone')}
              {...form.register('phone', {
                validate: (v) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, '').slice(-10)) || t.signup.invalidPhone,
              })}
            />
          </div>
        </Field>

        <Field id="password" label={t.signup.password} error={errors.password?.message}>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={invalid('password')}
            {...form.register('password', {
              minLength: { value: PASSWORD_MIN_LENGTH, message: t.reset.tooShort },
              required: t.reset.tooShort,
            })}
          />
        </Field>
        <PasswordStrength password={password} />

        <div className="space-y-1.5 pt-1">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-primary"
              aria-invalid={invalid('acceptTerms')}
              {...form.register('acceptTerms', { validate: (v) => v || t.signup.termsRequired })}
            />
            <span className="text-muted-foreground">{t.signup.acceptTerms}</span>
          </label>
          {errors.acceptTerms && (
            <p className="text-xs text-destructive" role="alert">
              {errors.acceptTerms.message}
            </p>
          )}
        </div>

        {start.formError && <FormAlert>{start.formError}</FormAlert>}

        <Button type="submit" className="mt-2 h-11 w-full text-[0.95rem]" disabled={start.isPending}>
          {start.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {start.isPending ? t.signup.submitting : t.signup.submit}
        </Button>
      </form>
    </AuthLayout>
  )
}
