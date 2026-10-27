import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Monitor, Smartphone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { api, errorMessage, isApiError, type TrustedDevice } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { Field } from '@/components/common/Field'
import { SectionCard, SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatDate, formatDateTime } from '@/lib/date'
import { PASSWORD_MIN_LENGTH } from '@/lib/passwordStrength'
import { queryKeys } from '@/lib/queryKeys'
import { t } from '@/strings/en'

/** AUTH-003 and AUTH-004 for the signed-in user. */
export function SecurityPage() {
  return (
    <>
      <PageHeader crumbs={[{ label: t.security.title }]} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <ChangePasswordCard />
        <DevicesCard />
      </div>
    </>
  )
}

interface PasswordValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

function ChangePasswordCard() {
  const online = useOnlineStatus()
  const [error, setError] = useState<string | null>(null)
  const form = useForm<PasswordValues>({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  })
  const { errors } = form.formState
  const newPassword = useWatch({ control: form.control, name: 'newPassword' })

  const change = useMutation({
    mutationFn: ({ currentPassword, newPassword }: PasswordValues) =>
      api.auth.changePassword({ currentPassword, newPassword }),
    onSuccess: () => {
      form.reset()
      toast.success(t.security.saved)
    },
    onError: (e) => {
      if (isApiError(e, 'VALIDATION_FAILED') && e.fields.length > 0) {
        for (const field of e.fields) {
          if (field.field === 'currentPassword' || field.field === 'newPassword') {
            form.setError(field.field, { message: field.message })
          }
        }
      } else {
        setError(errorMessage(e, t.common.genericError))
      }
    },
  })

  return (
    <SectionCard title={t.security.passwordTitle}>
      <p className="-mt-1 mb-5 text-sm text-muted-foreground">{t.security.passwordBody}</p>
      <form
        className="space-y-4"
        noValidate
        onSubmit={form.handleSubmit((values) => {
          setError(null)
          change.mutate(values)
        })}
      >
        <Field id="currentPassword" label={t.security.currentPassword} error={errors.currentPassword?.message}>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            aria-invalid={Boolean(errors.currentPassword) || undefined}
            {...form.register('currentPassword', { required: t.common.required })}
          />
        </Field>
        <Field id="newPassword" label={t.security.newPassword} error={errors.newPassword?.message}>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            aria-invalid={Boolean(errors.newPassword) || undefined}
            {...form.register('newPassword', {
              required: t.reset.tooShort,
              minLength: { value: PASSWORD_MIN_LENGTH, message: t.reset.tooShort },
            })}
          />
        </Field>
        <PasswordStrength password={newPassword} />
        <Field id="confirmPassword" label={t.security.confirmPassword} error={errors.confirmPassword?.message}>
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
        {!online && <FormAlert tone="info">{t.offline.blocked}</FormAlert>}
        <div className="flex justify-end pt-1">
          <Button type="submit" className="h-10 px-4" disabled={change.isPending || !online}>
            {change.isPending && <Loader2 className="animate-spin" aria-hidden />}
            {change.isPending ? t.security.saving : t.security.save}
          </Button>
        </div>
      </form>
    </SectionCard>
  )
}

const isPhone = (label: string) => /Android|iOS/.test(label)

function DevicesCard() {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [confirming, setConfirming] = useState<TrustedDevice | null>(null)
  const devices = useQuery({ queryKey: queryKeys.trustedDevices, queryFn: () => api.auth.devices() })

  const revoke = useMutation({
    mutationFn: (id: string) => api.auth.revokeDevice(id),
    onSuccess: async () => {
      setConfirming(null)
      toast.success(t.security.revoked)
      await queryClient.invalidateQueries({ queryKey: queryKeys.trustedDevices })
    },
    onError: (e) => toast.error(errorMessage(e, t.common.genericError)),
  })

  const count = devices.data?.length

  return (
    <SectionCard
      title={t.security.devicesTitle}
      badge={count ? <SoftPill tone="primary">{count}</SoftPill> : undefined}
      bodyClassName="p-0"
    >
      <p className="px-5 pt-4 pb-1 text-sm text-muted-foreground">{t.security.devicesBody}</p>

      {devices.isPending ? (
        <div className="space-y-3 p-5">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : devices.isError ? (
        <div className="p-5">
          <FormAlert>
            {t.security.loadError}{' '}
            <button type="button" className="font-medium underline" onClick={() => void devices.refetch()}>
              {t.common.retry}
            </button>
          </FormAlert>
        </div>
      ) : devices.data.length === 0 ? (
        <p className="m-5 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          {t.security.devicesEmpty}
        </p>
      ) : (
        <ul className="divide-y">
          {devices.data.map((device) => {
            const Icon = isPhone(device.label) ? Smartphone : Monitor
            return (
              <li key={device.id} className="flex items-center gap-4 px-5 py-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{device.label}</span>
                    {device.current && <SoftPill tone="success">{t.security.thisDevice}</SoftPill>}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {t.security.lastUsed}:{' '}
                    {device.lastUsedAt ? formatDateTime(device.lastUsedAt) : t.security.neverUsed}
                    <span className="mx-1.5" aria-hidden>
                      ·
                    </span>
                    {t.security.expires} {formatDate(device.expiresAt)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`${t.security.revoke}: ${device.label}`}
                  disabled={!online}
                  onClick={() => setConfirming(device)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.security.revokeTitle}</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{confirming?.label}</span> — {t.security.revokeBody}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="h-10" onClick={() => setConfirming(null)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              className="h-10"
              disabled={revoke.isPending}
              onClick={() => confirming && revoke.mutate(confirming.id)}
            >
              {revoke.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {t.security.revokeConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  )
}
