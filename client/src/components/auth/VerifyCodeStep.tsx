import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { errorMessage, isApiError, type SessionUser } from '@/api'
import { AuthIcon, AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { OtpInput } from '@/components/auth/OtpInput'
import { Button } from '@/components/ui/button'
import { t } from '@/strings/en'

/** Matches the server's minimum spacing between resends (AUTH-002). */
const RESEND_SECONDS = 30

interface VerifyCodeStepProps {
  title: string
  subtitle: string
  backLabel: string
  onBack: () => void
  /** Checks the code; resolves with the signed-in user. */
  verify: (code: string, trustDevice: boolean) => Promise<SessionUser>
  /** Asks the server for a new code (the caller keeps track of any new id). */
  resend: () => Promise<void>
  onSignedIn: (user: SessionUser) => void
}

/**
 * The emailed 6-digit code screen, shared by sign-in on a new device (AUTH-002) and clinic registration
 * (TEN-001). Auto-submits on the sixth digit, offers "trust this device", and spaces out resends.
 */
export function VerifyCodeStep({
  title,
  subtitle,
  backLabel,
  onBack,
  verify,
  resend,
  onSignedIn,
}: VerifyCodeStepProps) {
  const [code, setCode] = useState('')
  const [trustDevice, setTrustDevice] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(RESEND_SECONDS)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  const check = useMutation({
    mutationFn: (value: string) => verify(value, trustDevice),
    onSuccess: (user) => onSignedIn(user),
    onError: (e) => {
      setCode('')
      setError(isApiError(e, 'OTP_INVALID') ? e.message || t.auth.invalidOtp : errorMessage(e, t.common.genericError))
    },
  })

  const again = useMutation({
    mutationFn: resend,
    onSuccess: () => {
      setCode('')
      setNotice(t.auth.otpResent)
      setCooldown(RESEND_SECONDS)
    },
    onError: (e) => setError(errorMessage(e, t.common.genericError)),
  })

  function submit(value: string) {
    if (value.length !== 6 || check.isPending) return
    setError(null)
    setNotice(null)
    check.mutate(value)
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit(code)
  }

  return (
    <AuthLayout
      icon={
        <AuthIcon>
          <MailCheck aria-hidden />
        </AuthIcon>
      }
      title={title}
      subtitle={subtitle}
      footer={
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded font-medium text-foreground/80 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </button>
      }
    >
      <form className="space-y-6" onSubmit={onSubmit} noValidate>
        <OtpInput
          value={code}
          onChange={(value) => {
            setCode(value)
            if (error) setError(null)
          }}
          onComplete={submit}
          disabled={check.isPending}
          invalid={Boolean(error)}
          autoFocus
        />

        <label className="flex cursor-pointer gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:bg-muted/50 has-checked:border-primary/40 has-checked:bg-accent/50">
          <input
            type="checkbox"
            className="mt-0.5 size-4 shrink-0 accent-primary"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium">{t.auth.otpTrust}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t.auth.otpTrustHint}</span>
          </span>
        </label>

        {error && <FormAlert>{error}</FormAlert>}
        {notice && !error && <FormAlert tone="info">{notice}</FormAlert>}

        <Button type="submit" className="h-11 w-full text-[0.95rem]" disabled={code.length !== 6 || check.isPending}>
          {check.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {check.isPending ? t.auth.otpVerifying : t.auth.otpVerify}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          {t.auth.otpNoEmail}{' '}
          {cooldown > 0 ? (
            <span className="font-medium tabular-nums">{t.auth.otpResendIn(cooldown)}</span>
          ) : (
            <button
              type="button"
              onClick={() => {
                setError(null)
                again.mutate()
              }}
              disabled={again.isPending}
              className="rounded font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              {t.auth.otpResend}
            </button>
          )}
        </p>
      </form>
    </AuthLayout>
  )
}
