import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, CircleCheck, Loader2, LockKeyhole } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useSearchParams } from 'react-router-dom'
import { errorMessage, isApiError } from '@/api'
import { AuthIcon, AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { backLinkClass } from '@/components/auth/styles'
import { Field } from '@/components/common/Field'
import { Button, buttonVariants } from '@/components/ui/button'
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordStrength'
import { t } from '@/strings/en'

interface FormValues {
  newPassword: string
  confirmPassword: string
}

interface SetPasswordScreenProps {
  title: string
  subtitle: string
  submitLabel: string
  submittingLabel: string
  doneTitle: string
  doneBody: string
  /** Shown when the link has no token or the server says it is no longer valid. */
  invalidLinkText: string
  /** Where to get a new link, if the person can do that themselves (reset yes, invitation no). */
  requestNew?: { label: string; to: string }
  submit: (input: { token: string; newPassword: string }) => Promise<void>
}

/**
 * The page an emailed single-use link opens (?token=...): a new password with strength hint and confirmation.
 * Used for password reset (AUTH-004) and for accepting a staff invitation (USR-001).
 */
export function SetPasswordScreen(props: SetPasswordScreenProps) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [error, setError] = useState<string | null>(null)
  const [linkInvalid, setLinkInvalid] = useState(false)

  const form = useForm<FormValues>({ defaultValues: { newPassword: '', confirmPassword: '' } })
  const newPassword = useWatch({ control: form.control, name: 'newPassword' })

  const save = useMutation({
    mutationFn: (values: FormValues) => props.submit({ token, newPassword: values.newPassword }),
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

  const icon = (
    <AuthIcon>
      <LockKeyhole aria-hidden />
    </AuthIcon>
  )
  const footer = (
    <Link to="/login" className={backLinkClass}>
      <ArrowLeft className="size-4" aria-hidden />
      {t.forgot.backToSignIn}
    </Link>
  )

  if (save.isSuccess) {
    return (
      <AuthLayout
        icon={
          <AuthIcon tone="success">
            <CircleCheck aria-hidden />
          </AuthIcon>
        }
        title={props.doneTitle}
        subtitle={props.doneBody}
      >
        <Link to="/login" className={buttonVariants({ className: 'h-11 w-full text-[0.95rem]' })}>
          {t.reset.goToSignIn}
        </Link>
      </AuthLayout>
    )
  }

  if (!token || linkInvalid) {
    return (
      <AuthLayout icon={icon} title={props.title} footer={footer}>
        <div className="space-y-5">
          <FormAlert>{props.invalidLinkText}</FormAlert>
          {props.requestNew && (
            <Link to={props.requestNew.to} className={buttonVariants({ className: 'h-11 w-full text-[0.95rem]' })}>
              {props.requestNew.label}
            </Link>
          )}
        </div>
      </AuthLayout>
    )
  }

  const { errors } = form.formState
  return (
    <AuthLayout icon={icon} title={props.title} subtitle={props.subtitle} footer={footer}>
      <form
        className="space-y-5"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setError(null)
          save.mutate(values)
        })}
      >
        <Field id="newPassword" label={t.reset.newPassword} error={errors.newPassword?.message}>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            autoFocus
            aria-invalid={Boolean(errors.newPassword) || undefined}
            {...form.register('newPassword', {
              minLength: { value: PASSWORD_MIN_LENGTH, message: t.reset.tooShort },
              required: t.reset.tooShort,
            })}
          />
        </Field>
        <PasswordStrength password={newPassword} />
        <Field id="confirmPassword" label={t.reset.confirmPassword} error={errors.confirmPassword?.message}>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.confirmPassword) || undefined}
            {...form.register('confirmPassword', {
              validate: (value, values) => value === values.newPassword || t.reset.mismatch,
            })}
          />
        </Field>
        {error && <FormAlert>{error}</FormAlert>}
        <Button type="submit" className="h-11 w-full text-[0.95rem]" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending ? props.submittingLabel : props.submitLabel}
        </Button>
      </form>
    </AuthLayout>
  )
}
