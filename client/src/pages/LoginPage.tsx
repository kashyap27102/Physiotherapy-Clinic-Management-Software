import { useMutation } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { api, errorMessage, isApiError } from '@/api'
import { useAuth } from '@/auth/hooks'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { textLinkClass } from '@/components/auth/styles'
import { VerifyCodeStep } from '@/components/auth/VerifyCodeStep'
import { Field, inputClassName } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/strings/en'

function credentialsError(error: unknown): string {
  // Locked, suspended, deactivated and rate-limited answers carry a message meant for the user.
  if (isApiError(error, 'INVALID_CREDENTIALS')) return t.auth.invalidCredentials
  return errorMessage(error, t.common.genericError)
}

/** AUTH-001 and AUTH-002: email and password, then the emailed code on a new device. */
export function LoginPage() {
  const { state, signedIn, sessionExpired } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const login = useMutation({
    mutationFn: () => api.auth.login(email.trim(), password),
    onSuccess: (result) => {
      if (result.status === 'otp_required') setChallengeId(result.challengeId)
      else signedIn(result.user)
    },
    onError: (e) => setError(credentialsError(e)),
  })

  if (state.status === 'authenticated') return <Navigate to={from} replace />

  if (challengeId) {
    return (
      <VerifyCodeStep
        title={t.auth.otpTitle}
        subtitle={t.auth.otpSentTo(email.trim())}
        backLabel={t.auth.otpBack}
        onBack={() => {
          setChallengeId(null)
          setPassword('')
        }}
        verify={(code, trustDevice) => api.auth.verifyOtp({ challengeId, code, trustDevice })}
        resend={async () => setChallengeId((await api.auth.resendOtp(challengeId)).challengeId)}
        onSignedIn={signedIn}
      />
    )
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    login.mutate()
  }

  return (
    <AuthLayout
      title={t.auth.welcome}
      subtitle={t.auth.subtitle}
      footer={
        <>
          {t.signup.prompt}{' '}
          <Link to="/register" className={textLinkClass}>
            {t.signup.promptLink}
          </Link>
        </>
      }
    >
      <form className="space-y-5" onSubmit={submit} noValidate>
        {sessionExpired && !error && <FormAlert tone="info">{t.auth.sessionExpired}</FormAlert>}

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

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm leading-none font-medium select-none">
              {t.auth.password}
            </label>
            <Link to="/forgot-password" state={{ email: email.trim() }} className={`text-sm ${textLinkClass}`}>
              {t.auth.forgotLink}
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder={t.auth.passwordPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <FormAlert>{error}</FormAlert>}

        <Button type="submit" className="h-11 w-full text-[0.95rem]" disabled={!email || !password || login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {login.isPending ? t.auth.signingIn : t.auth.signIn}
        </Button>
      </form>
    </AuthLayout>
  )
}
