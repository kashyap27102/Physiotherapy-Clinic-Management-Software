import { Building2, Loader2, LogOut } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { api } from '@/api'
import { Forbidden } from '@/auth/guards'
import { useAuth, useCan, useUser } from '@/auth/hooks'
import { AuthIcon, AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert } from '@/components/auth/FormAlert'
import { backLinkClass } from '@/components/auth/styles'
import { Field, inputClassName } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFormMutation } from '@/hooks/useFormMutation'
import { t } from '@/strings/en'

interface BranchValues {
  name: string
  code: string
  address: string
  phone: string
}

const BRANCH_FIELDS = ['name', 'code', 'address', 'phone'] as const

/** First letters of the name as a suggested branch code: "Koregaon Park" → "KP", "Pune" → "PUN". */
function suggestCode(name: string): string {
  const words = name.toUpperCase().match(/[A-Z0-9]+/g) ?? []
  if (words.length >= 2)
    return words
      .map((w) => w[0])
      .join('')
      .slice(0, 4)
  return (words[0] ?? '').slice(0, 3)
}

/**
 * First sign-in after registration (TEN-002): the clinic needs one branch before staff, visits and receipts can
 * exist. Shown full screen; the app shell sends owners here until it is done.
 */
export function SetupPage() {
  const user = useUser()
  const canManage = useCan('clinic.manage')
  const { signedIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [codeTouched, setCodeTouched] = useState(false)

  const form = useForm<BranchValues>({ defaultValues: { name: '', code: '', address: '', phone: '' } })
  const { errors } = form.formState

  const save = useFormMutation({
    fields: BRANCH_FIELDS,
    setError: form.setError,
    mutationFn: async (values: BranchValues) => {
      await api.branches.create({
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        ...(values.address.trim() ? { address: values.address.trim() } : {}),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
      })
      return api.auth.me()
    },
    onSuccess: (updated) => {
      if (updated) signedIn(updated)
      toast.success(t.setup.welcome(user.tenantName))
      void navigate('/', { replace: true })
    },
  })

  if (!user.needsSetup) return <Navigate to="/" replace />
  if (!canManage) return <Forbidden />

  const nameField = form.register('name', {
    validate: (v) => v.trim().length >= 2 || t.signup.required,
    onChange: (event: { target: { value: string } }) => {
      if (!codeTouched) form.setValue('code', suggestCode(event.target.value))
    },
  })

  return (
    <AuthLayout
      icon={
        <AuthIcon>
          <Building2 aria-hidden />
        </AuthIcon>
      }
      title={t.setup.title}
      subtitle={
        <>
          <span className="mb-2 block text-xs font-semibold tracking-wide text-primary uppercase">
            {t.setup.step} · {user.tenantName}
          </span>
          {t.setup.subtitle}
        </>
      }
      footer={
        <button type="button" className={backLinkClass} onClick={() => void signOut()}>
          <LogOut className="size-4" aria-hidden />
          {t.setup.signOut}
        </button>
      }
    >
      <form className="space-y-4" noValidate onSubmit={form.handleSubmit((values) => save.submit(values))}>
        <Field id="name" label={t.setup.name} error={errors.name?.message}>
          <Input
            id="name"
            autoFocus
            placeholder={t.setup.namePlaceholder}
            className={inputClassName}
            aria-invalid={Boolean(errors.name) || undefined}
            {...nameField}
          />
        </Field>

        <Field id="code" label={t.setup.code} error={errors.code?.message} hint={t.setup.codeHint}>
          <Input
            id="code"
            className={`${inputClassName} font-mono tracking-widest uppercase`}
            maxLength={6}
            aria-invalid={Boolean(errors.code) || undefined}
            {...form.register('code', {
              validate: (v) => /^[A-Za-z0-9]{2,6}$/.test(v.trim()) || t.setup.codeInvalid,
              onChange: () => setCodeTouched(true),
            })}
          />
        </Field>

        <Field id="address" label={t.setup.address} optional error={errors.address?.message}>
          <Input id="address" autoComplete="street-address" className={inputClassName} {...form.register('address')} />
        </Field>

        <Field id="phone" label={t.setup.phone} optional error={errors.phone?.message}>
          <Input id="phone" type="tel" autoComplete="tel" className={inputClassName} {...form.register('phone')} />
        </Field>

        {save.formError && <FormAlert>{save.formError}</FormAlert>}

        <Button type="submit" className="mt-2 h-11 w-full text-[0.95rem]" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending ? t.setup.submitting : t.setup.submit}
        </Button>
      </form>
    </AuthLayout>
  )
}
