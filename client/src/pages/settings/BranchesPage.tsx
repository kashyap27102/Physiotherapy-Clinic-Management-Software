import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, Loader2, Lock, MapPin, Pencil, Phone, Plus, Power, Users } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { api, errorMessage, type Branch } from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { Field, inputClassName } from '@/components/common/Field'
import { SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormMutation } from '@/hooks/useFormMutation'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

/** TEN-002: the owner's branches. Deactivated, never deleted (BR-TEN-3). */
export function BranchesPage() {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const branches = useQuery({ queryKey: queryKeys.branches, queryFn: () => api.branches.list() })
  const [editing, setEditing] = useState<Branch | 'new' | null>(null)
  const [deactivating, setDeactivating] = useState<Branch | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.branches })

  const deactivate = useMutation({
    mutationFn: (id: string) => api.branches.deactivate(id),
    onSuccess: async () => {
      setDeactivating(null)
      toast.success(t.branchSettings.deactivated)
      await refresh()
    },
    // BRANCH_HAS_STAFF and LAST_BRANCH carry a message meant for the owner.
    onError: (e) => {
      setDeactivating(null)
      toast.error(errorMessage(e, t.common.genericError))
    },
  })
  const reactivate = useMutation({
    mutationFn: (id: string) => api.branches.reactivate(id),
    onSuccess: async () => {
      toast.success(t.branchSettings.reactivated)
      await refresh()
    },
    onError: (e) => toast.error(errorMessage(e, t.common.genericError)),
  })

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.settings.section }, { label: t.branchSettings.title }]}
        actions={
          <Button className="h-10 px-4" disabled={!online} onClick={() => setEditing('new')}>
            <Plus aria-hidden />
            {t.branchSettings.add}
          </Button>
        }
      />
      <p className="-mt-3 mb-6 text-sm text-muted-foreground">{t.branchSettings.subtitle}</p>

      {branches.isPending ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : branches.isError ? (
        <FormAlert>{t.settings.loadError}</FormAlert>
      ) : branches.data.length === 0 ? (
        <div className="rounded-xl border bg-card">
          <EmptyState icon={Building2}>{t.branchSettings.empty}</EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {branches.data.map((branch) => (
            <li
              key={branch.id}
              className={cn(
                'group flex flex-col rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-md',
                !branch.isActive && 'bg-muted/40 shadow-none',
              )}
            >
              <div className="flex items-start gap-3 p-5 pb-4">
                <span
                  className={cn(
                    'flex size-11 shrink-0 items-center justify-center rounded-xl',
                    branch.isActive ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Building2 className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className={cn('truncate font-semibold', !branch.isActive && 'text-muted-foreground')}>
                      {branch.name}
                    </h2>
                    {!branch.isActive && <SoftPill tone="muted">{t.settings.inactive}</SoftPill>}
                  </div>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-foreground/80">
                    {branch.codeLocked && <Lock className="size-3" aria-label={t.branchSettings.codeLocked} />}
                    {branch.code}
                  </span>
                </div>
              </div>

              <dl className="flex-1 space-y-2 px-5 text-sm text-muted-foreground">
                {branch.address && (
                  <div className="flex gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <dd className="line-clamp-2">{branch.address}</dd>
                  </div>
                )}
                {branch.phone && (
                  <div className="flex gap-2">
                    <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <dd>{branch.phone}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <dd>
                    {branch.staffCount ? t.branchSettings.staffCount(branch.staffCount) : t.branchSettings.noStaff}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 flex items-center justify-end gap-1 border-t px-3 py-2">
                {branch.isActive ? (
                  <Button
                    variant="ghost"
                    className="h-9 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    disabled={!online}
                    onClick={() => setDeactivating(branch)}
                  >
                    <Power aria-hidden />
                    {t.settings.deactivate}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    className="h-9"
                    disabled={!online || reactivate.isPending}
                    onClick={() => reactivate.mutate(branch.id)}
                  >
                    <Power aria-hidden />
                    {t.settings.reactivate}
                  </Button>
                )}
                <Button variant="ghost" className="h-9" disabled={!online} onClick={() => setEditing(branch)}>
                  <Pencil aria-hidden />
                  {t.settings.edit}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing !== null && (
            <BranchForm
              branch={editing === 'new' ? null : editing}
              onDone={async () => {
                setEditing(null)
                await refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deactivating !== null}
        onOpenChange={(open) => !open && setDeactivating(null)}
        title={t.branchSettings.deactivateTitle}
        description={
          <>
            <span className="font-medium text-foreground">{deactivating?.name}</span> —{' '}
            {t.branchSettings.deactivateBody}
          </>
        }
        confirmLabel={t.settings.deactivate}
        tone="destructive"
        pending={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
      />
    </>
  )
}

interface BranchValues {
  name: string
  code: string
  address: string
  phone: string
}

const BRANCH_FIELDS = ['name', 'code', 'address', 'phone'] as const

function BranchForm({ branch, onDone }: { branch: Branch | null; onDone: () => void }) {
  const form = useForm<BranchValues>({
    defaultValues: {
      name: branch?.name ?? '',
      code: branch?.code ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
    },
  })
  const { errors } = form.formState

  const save = useFormMutation({
    fields: BRANCH_FIELDS,
    setError: form.setError,
    mutationFn: (values: BranchValues) => {
      const input = {
        name: values.name.trim(),
        code: values.code.trim().toUpperCase(),
        address: values.address.trim(),
        phone: values.phone.trim(),
      }
      if (branch) return api.branches.update(branch.id, branch.codeLocked ? { ...input, code: undefined } : input)
      return api.branches.create({
        name: input.name,
        code: input.code,
        ...(input.address ? { address: input.address } : {}),
        ...(input.phone ? { phone: input.phone } : {}),
      })
    },
    onSuccess: () => {
      toast.success(branch ? t.branchSettings.updated : t.branchSettings.created)
      onDone()
    },
  })

  return (
    <form noValidate onSubmit={form.handleSubmit((values) => save.submit(values))}>
      <DialogHeader>
        <DialogTitle>{branch ? t.branchSettings.editTitle : t.branchSettings.addTitle}</DialogTitle>
      </DialogHeader>
      <div className="mt-4 space-y-4">
        <Field id="branch-name" label={t.branchSettings.name} error={errors.name?.message}>
          <Input
            id="branch-name"
            autoFocus
            className={inputClassName}
            aria-invalid={Boolean(errors.name) || undefined}
            {...form.register('name', { validate: (v) => v.trim().length >= 2 || t.signup.required })}
          />
        </Field>
        <Field
          id="branch-code"
          label={t.branchSettings.code}
          error={errors.code?.message}
          hint={branch?.codeLocked ? t.branchSettings.codeLocked : t.branchSettings.codeHint}
        >
          <Input
            id="branch-code"
            maxLength={6}
            disabled={branch?.codeLocked}
            className={`${inputClassName} w-36 font-mono tracking-widest uppercase`}
            aria-invalid={Boolean(errors.code) || undefined}
            {...form.register('code', {
              validate: (v) => branch?.codeLocked || /^[A-Za-z0-9]{2,6}$/.test(v.trim()) || t.setup.codeInvalid,
            })}
          />
        </Field>
        <Field id="branch-address" label={t.branchSettings.address} optional error={errors.address?.message}>
          <Input id="branch-address" className={inputClassName} {...form.register('address')} />
        </Field>
        <Field id="branch-phone" label={t.branchSettings.phone} optional error={errors.phone?.message}>
          <Input id="branch-phone" type="tel" className={inputClassName} {...form.register('phone')} />
        </Field>
        {save.formError && <FormAlert>{save.formError}</FormAlert>}
      </div>
      <DialogFooter className="mt-6">
        <Button type="submit" className="h-10 px-4" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          {save.isPending ? t.settings.saving : branch ? t.settings.saveChanges : t.branchSettings.add}
        </Button>
      </DialogFooter>
    </form>
  )
}
