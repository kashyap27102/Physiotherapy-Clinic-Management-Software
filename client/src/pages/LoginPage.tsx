import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { api, errorMessage, isApiError, USE_MOCK_API } from '@/api'
import { useAuth } from '@/auth/hooks'
import { Field, inputClassName } from '@/components/common/Field'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { t } from '@/strings/en'

const DEMO_ACCOUNTS = [
  { label: 'Owner', email: 'owner@demo.clinic' },
  { label: 'Receptionist', email: 'reception@demo.clinic' },
  { label: 'Physiotherapist', email: 'therapist@demo.clinic' },
]

export function LoginPage() {
  const { state, signedIn } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const login = useMutation({
    mutationFn: () => api.auth.login(email, password),
    onSuccess: (result) => {
      if (result.status === 'otp_required') setChallengeId(result.challengeId)
      else signedIn(result.user)
    },
    onError: (e) =>
      setError(
        isApiError(e, 'INVALID_CREDENTIALS') ? t.auth.invalidCredentials : errorMessage(e, t.common.genericError),
      ),
  })

  const verify = useMutation({
    mutationFn: () => api.auth.verifyOtp({ challengeId: challengeId ?? '', code: code.trim(), trustDevice }),
    onSuccess: (user) => signedIn(user),
    onError: (e) => setError(isApiError(e, 'OTP_INVALID') ? t.auth.invalidOtp : errorMessage(e, t.common.genericError)),
  })

  if (state.status === 'authenticated') return <Navigate to={from} replace />

  function submitCredentials(event: FormEvent) {
    event.preventDefault()
    setError(null)
    login.mutate()
  }

  function submitCode(event: FormEvent) {
    event.preventDefault()
    setError(null)
    verify.mutate()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t.app.name}</h1>
        </div>

        <Card>
          {challengeId === null ? (
            <>
              <CardHeader>
                <CardTitle>{t.auth.title}</CardTitle>
                <CardDescription>{t.auth.subtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitCredentials} noValidate>
                  <Field id="email" label={t.auth.email}>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="username"
                      className={inputClassName}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </Field>
                  <Field id="password" label={t.auth.password}>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      className={inputClassName}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </Field>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    className="h-10 w-full"
                    disabled={!email || !password || login.isPending}
                  >
                    {login.isPending ? t.auth.signingIn : t.auth.signIn}
                  </Button>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>{t.auth.otpTitle}</CardTitle>
                <CardDescription>{t.auth.otpSubtitle}</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={submitCode} noValidate>
                  <Field id="otp" label={t.auth.otpLabel}>
                    <Input
                      id="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      className={`${inputClassName} tracking-widest`}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    />
                  </Field>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={trustDevice}
                      onChange={(e) => setTrustDevice(e.target.checked)}
                    />
                    {t.auth.otpTrust}
                  </label>
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <Button
                    type="submit"
                    size="lg"
                    className="h-10 w-full"
                    disabled={code.length !== 6 || verify.isPending}
                  >
                    {verify.isPending ? t.auth.otpVerifying : t.auth.otpVerify}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-10 w-full"
                    onClick={() => {
                      setChallengeId(null)
                      setCode('')
                      setError(null)
                    }}
                  >
                    {t.auth.otpBack}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        {USE_MOCK_API && (
          <div className="rounded-xl border border-dashed bg-background p-4 text-sm">
            <div className="font-medium">{t.auth.demoTitle}</div>
            <p className="mt-1 text-muted-foreground">{t.auth.demoHint}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {DEMO_ACCOUNTS.map((account) => (
                <Button
                  key={account.email}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChallengeId(null)
                    setEmail(account.email)
                    setPassword('demo1234')
                    setError(null)
                  }}
                >
                  {account.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
