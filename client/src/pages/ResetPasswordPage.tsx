import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, Loader2, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { api, errorMessage, isApiError } from '@/api'
import { AuthIcon, AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { Field } from '@/components/common/Field'
import { Button, buttonVariants } from '@/components/ui/button'
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordStrength'
import { t } from '@/strings/en'

interface FormValues {
  newPassword: string
  confirmPassword: string
}

const linkClass =
  'inline-flex items-center gap-1.5 rounded font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50'

/** AUTH-004 step 2: the page the emailed link opens (/reset-password?token=...). */
export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [linkInvalid, setLinkInvalid] = useState(false)

  const form = useForm<FormValues>({ defaultValues: { newPassword: '', confirmPassword: '' } })
  const newPassword = useWatch({ control: form.control, name: 'newPassword' })

  const reset = useMutation({
    mutationFn: (values: FormValues) => api.auth.resetPassword({ token, newPassword: values.newPassword }),
    onError: (e) => {
      if (isApiError(e, 'VALIDATION_FAILED')) {
        const field = e.fields.find((f) => f.field === 'newPassword')
        if (field) form.setError('newPassword', { message: field.message })
        else setError(e.message)
      } else if (isApiError(e, 'BAD_REQUEST')) {
        setLinkInvalid(true)
        setError(e.message)
      } else {
        setError(errorMessage(e, t.common.genericError))
      }
    },
  })

  if (reset.isSuccess) {
    return (
      <AuthLayout
        icon={
          <AuthIcon tone="success">
            <CircleCheck aria-hidden />
          </AuthIcon>
        }
        title={t.reset.doneTitle}
        subtitle={t.reset.doneBody}
      >
        <Link to="/login" className={buttonVariants({ className: 'h-11 w-full text-[0.95rem]' })}>
          {t.reset.goToSignIn}
        </Link>
      </AuthLayout>
    )
  }

  const footer = (
    <Link to="/login" className={linkClass}>
      <ArrowLeft className="size-4" aria-hidden />
      {t.forgot.backToSignIn}
    </Link>
  )

  if (!token || linkInvalid) {
    return (
      <AuthLayout
        icon={
          <AuthIcon>
            <LockKeyhole aria-hidden />
          </AuthIcon>
        }
        title={t.reset.title}
        footer={footer}
      >
        <div className="space-y-5">
          <FormAlert>{error ?? t.reset.missingToken}</FormAlert>
          <Link to="/forgot-password" className={buttonVariants({ className: 'h-11 w-full text-[0.95rem]' })}>
            {t.reset.requestNew}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      icon={
        <AuthIcon>
          <LockKeyhole aria-hidden />
        </AuthIcon>
      }
      title={t.reset.title}
      subtitle={t.reset.subtitle}
      footer={footer}
    >
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setError(null)
          reset.mutate(values)
        })}
      >
        <Field id="newPassword" label={t.reset.newPassword} error={form.formState.errors.newPassword?.message}>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            autoFocus
            aria-invalid={Boolean(form.formState.errors.newPassword) || undefined}
            {...form.register('newPassword', {
              minLength: { value: PASSWORD_MIN_LENGTH, message: t.reset.tooShort },
              required: t.reset.tooShort,
            })}
          />
        </Field>
        <PasswordStrength password={newPassword} />
        <Field
          id="confirmPassword"
          label={t.reset.confirmPassword}
          error={form.formState.errors.confirmPassword?.message}
        >
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={Boolean(form.formState.errors.confirmPassword) || undefined}
            {...form.register('confirmPassword', {
              validate: (value, values) => value === values.newPassword || t.reset.mismatch,
            })}
          />
        </Field>
        {error && <FormAlert>{error}</FormAlert>}
        <Button type="submit" className="h-11 w-full text-[0.95rem]" disabled={reset.isPending}>
          {reset.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {reset.isPending ? t.reset.submitting : t.reset.submit}
        </Button>
      </form>
    </AuthLayout>
  )
}
