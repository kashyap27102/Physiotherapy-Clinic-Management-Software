import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, KeyRound, Loader2, MailCheck } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, errorMessage } from '@/api'
import { AuthIcon, AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/strings/en'

const backLink = (
  <Link
    to="/login"
    className="inline-flex items-center gap-1.5 rounded font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    <ArrowLeft className="size-4" aria-hidden />
    {t.forgot.backToSignIn}
  </Link>
)

/** AUTH-004 step 1. The answer is the same whether or not the email has an account (US-03a.1). */
export function ForgotPasswordPage() {
  const location = useLocation()
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [error, setError] = useState<string | null>(null)

  const request = useMutation({
    mutationFn: () => api.auth.forgotPassword(email.trim()),
    onError: (e) => setError(errorMessage(e, t.common.genericError)),
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    request.mutate()
  }

  if (request.isSuccess) {
    return (
      <AuthLayout
        icon={
          <AuthIcon tone="success">
            <MailCheck aria-hidden />
          </AuthIcon>
        }
        title={t.forgot.sentTitle}
        subtitle={t.forgot.sentBody}
        footer={backLink}
      >
        <Button variant="outline" className="h-11 w-full" onClick={() => request.reset()}>
          {t.forgot.tryAgain}
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      icon={
        <AuthIcon>
          <KeyRound aria-hidden />
        </AuthIcon>
      }
      title={t.forgot.title}
      subtitle={t.forgot.subtitle}
      footer={backLink}
    >
      <form className="space-y-5" onSubmit={submit} noValidate>
        <Field id="email" label={t.auth.email}>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            autoFocus
            placeholder={t.auth.emailPlaceholder}
            className={inputClassName}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        {error && <FormAlert>{error}</FormAlert>}
        <Button type="submit" className="h-11 w-full text-[0.95rem]" disabled={!email.trim() || request.isPending}>
          {request.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {request.isPending ? t.forgot.submitting : t.forgot.submit}
        </Button>
      </form>
    </AuthLayout>
  )
}
