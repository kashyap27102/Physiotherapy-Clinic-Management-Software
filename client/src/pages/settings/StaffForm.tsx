import { Loader2, MailPlus, Stethoscope, UsersRound, type LucideIcon } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { api, type Branch, type StaffMember, type StaffRoleKey } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { Field, inputClassName, selectClassName } from '@/components/common/Field'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useFormMutation } from '@/hooks/useFormMutation'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

interface StaffValues {
  fullName: string
  email: string
  role: StaffRoleKey
  branchId: string
}

const STAFF_FIELDS = ['fullName', 'email', 'role', 'branchId'] as const

const ROLE_CHOICES: { key: StaffRoleKey; icon: LucideIcon; hint: string }[] = [
  { key: 'receptionist', icon: UsersRound, hint: t.staffSettings.roleHints.receptionist },
  { key: 'physiotherapist', icon: Stethoscope, hint: t.staffSettings.roleHints.physiotherapist },
]

/** USR-001: invite a staff member, or edit one (the owner's role and branch are fixed). */
export function StaffForm({
  person,
  branches,
  onDone,
}: {
  person: StaffMember | null
  branches: Branch[]
  onDone: () => void
}) {
  const isOwner = person?.role.key === 'owner'
  const form = useForm<StaffValues>({
    defaultValues: {
      fullName: person?.fullName ?? '',
      email: person?.email ?? '',
      role: person && !isOwner ? (person.role.key as StaffRoleKey) : 'receptionist',
      branchId: person?.branch?.id ?? (branches.length === 1 ? (branches[0]?.id ?? '') : ''),
    },
  })
  const { errors } = form.formState
  const role = useWatch({ control: form.control, name: 'role' })

  const save = useFormMutation({
    fields: STAFF_FIELDS,
    setError: form.setError,
    mutationFn: async (values: StaffValues) => {
      if (!person) {
        const result = await api.users.create({
          ...values,
          fullName: values.fullName.trim(),
          email: values.email.trim(),
        })
        if (result.invitationSent) toast.success(t.staffSettings.invitedToast(result.staff.fullName))
        else toast.warning(t.staffSettings.inviteFailed)
        return
      }
      await api.users.update(
        person.id,
        isOwner
          ? { fullName: values.fullName.trim() }
          : { fullName: values.fullName.trim(), role: values.role, branchId: values.branchId },
      )
      toast.success(t.staffSettings.updated)
    },
    onSuccess: onDone,
  })

  // The person's current branch may be inactive; keep it selectable so the form does not silently change it.
  const branchOptions =
    person?.branch && !branches.some((b) => b.id === person.branch?.id)
      ? [
          ...branches,
          { ...person.branch, address: null, phone: null, isActive: false, staffCount: 0, codeLocked: false },
        ]
      : branches

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.submit(values))}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          {!person && <MailPlus className="size-5 text-primary" aria-hidden />}
          {person ? t.staffSettings.editTitle : t.staffSettings.addTitle}
        </DialogTitle>
        <DialogDescription>
          {person ? (isOwner ? t.staffSettings.ownerNote : person.email) : t.staffSettings.addBody}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-5 space-y-4">
        <Field id="staff-name" label={t.staffSettings.fullName} error={errors.fullName?.message}>
          <Input
            id="staff-name"
            autoFocus
            autoComplete="off"
            className={inputClassName}
            aria-invalid={Boolean(errors.fullName) || undefined}
            {...form.register('fullName', { validate: (v) => v.trim().length >= 2 || t.signup.required })}
          />
        </Field>

        {!person && (
          <Field id="staff-email" label={t.staffSettings.email} error={errors.email?.message}>
            <Input
              id="staff-email"
              type="email"
              autoComplete="off"
              placeholder={t.auth.emailPlaceholder}
              className={inputClassName}
              aria-invalid={Boolean(errors.email) || undefined}
              {...form.register('email', {
                validate: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || t.signup.invalidEmail,
              })}
            />
          </Field>
        )}

        {!isOwner && (
          <>
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium">{t.staffSettings.role}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_CHOICES.map(({ key, icon: Icon, hint }) => (
                  <label
                    key={key}
                    className={cn(
                      'flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50',
                      role === key && 'border-primary/50 bg-accent/60 ring-1 ring-primary/20',
                    )}
                  >
                    <input type="radio" value={key} className="sr-only" {...form.register('role')} />
                    <Icon
                      className={cn('mt-0.5 size-5 shrink-0', role === key ? 'text-primary' : 'text-muted-foreground')}
                      aria-hidden
                    />
                    <span>
                      <span className="block text-sm font-medium">{t.roles[key]}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
            </fieldset>

            <Field id="staff-branch" label={t.staffSettings.branch} error={errors.branchId?.message}>
              <select
                id="staff-branch"
                className={selectClassName}
                aria-invalid={Boolean(errors.branchId) || undefined}
                {...form.register('branchId', { validate: (v) => Boolean(v) || t.signup.required })}
              >
                <option value="" disabled>
                  {t.staffSettings.chooseBranch}
                </option>
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id} disabled={!b.isActive}>
                    {b.name} ({b.code}){b.isActive ? '' : ` — ${t.settings.inactive}`}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        {save.formError && <FormAlert>{save.formError}</FormAlert>}
      </div>

      <DialogFooter className="mt-6">
        <Button type="submit" className="h-10 px-4" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending
            ? person
              ? t.settings.saving
              : t.staffSettings.inviting
            : person
              ? t.settings.saveChanges
              : t.staffSettings.invite}
        </Button>
      </DialogFooter>
    </form>
  )
}
