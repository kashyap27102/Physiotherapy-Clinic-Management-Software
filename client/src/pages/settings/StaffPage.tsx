import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, MoreHorizontal, Pencil, Power, Send, UserPlus, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage, type StaffMember } from '@/api'
import { useUser } from '@/auth/hooks'
import { FormAlert } from '@/components/auth/FormAlert'
import { Avatar } from '@/components/common/Avatar'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { EmptyState } from '@/components/common/EmptyState'
import { selectClassName } from '@/components/common/Field'
import { SoftPill } from '@/components/common/SectionCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { formatDateTime } from '@/lib/date'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { StaffForm } from './StaffForm'

interface Filter {
  role: string
  branchId: string
  status: 'active' | 'inactive' | 'all'
}

/** USR-001: the owner invites, edits and deactivates staff; one branch each (BR-USR-1). */
export function StaffPage() {
  const me = useUser()
  const online = useOnlineStatus()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>({ role: '', branchId: '', status: 'active' })
  const [editing, setEditing] = useState<StaffMember | 'new' | null>(null)
  const [deactivating, setDeactivating] = useState<StaffMember | null>(null)

  const query = {
    ...(filter.role ? { role: filter.role } : {}),
    ...(filter.branchId ? { branchId: filter.branchId } : {}),
    ...(filter.status === 'all' ? {} : { active: filter.status === 'active' }),
  }
  const staff = useQuery({ queryKey: queryKeys.staff(query), queryFn: () => api.users.list(query) })
  const branches = useQuery({ queryKey: queryKeys.branches, queryFn: () => api.branches.list() })
  const activeBranches = branches.data?.filter((b) => b.isActive) ?? []

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['staff'] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.branches }),
    ])

  const deactivate = useMutation({
    mutationFn: (id: string) => api.users.deactivate(id),
    onSuccess: async () => {
      setDeactivating(null)
      toast.success(t.staffSettings.deactivated)
      await refresh()
    },
    onError: (e) => {
      setDeactivating(null)
      toast.error(errorMessage(e, t.common.genericError))
    },
  })
  const reactivate = useMutation({
    mutationFn: (id: string) => api.users.reactivate(id),
    onSuccess: async () => {
      toast.success(t.staffSettings.reactivated)
      await refresh()
    },
    onError: (e) => toast.error(errorMessage(e, t.common.genericError)),
  })
  const resend = useMutation({
    mutationFn: (id: string) => api.users.resendInvitation(id),
    onSuccess: () => toast.success(t.staffSettings.resent),
    onError: (e) => toast.error(errorMessage(e, t.common.genericError)),
  })

  const filtered = Boolean(filter.role || filter.branchId || filter.status !== 'active')

  return (
    <>
      <PageHeader
        crumbs={[{ label: t.settings.section }, { label: t.staffSettings.title }]}
        actions={
          <Button
            className="h-10 px-4"
            disabled={!online || activeBranches.length === 0}
            onClick={() => setEditing('new')}
          >
            <UserPlus aria-hidden />
            {t.staffSettings.add}
          </Button>
        }
      />
      <p className="-mt-3 mb-6 text-sm text-muted-foreground">{t.staffSettings.subtitle}</p>
      {branches.isSuccess && activeBranches.length === 0 && (
        <div className="mb-4">
          <FormAlert tone="info">{t.staffSettings.noBranches}</FormAlert>
        </div>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div className="grid gap-3 border-b bg-muted/30 p-4 sm:grid-cols-3">
          <FilterSelect
            label={t.staffSettings.filterRole}
            value={filter.role}
            onChange={(role) => setFilter((f) => ({ ...f, role }))}
            options={[
              { value: '', label: t.settings.all },
              { value: 'owner', label: t.roles.owner },
              { value: 'receptionist', label: t.roles.receptionist },
              { value: 'physiotherapist', label: t.roles.physiotherapist },
            ]}
          />
          <FilterSelect
            label={t.staffSettings.filterBranch}
            value={filter.branchId}
            onChange={(branchId) => setFilter((f) => ({ ...f, branchId }))}
            options={[
              { value: '', label: t.staffSettings.allBranches },
              ...(branches.data ?? []).map((b) => ({ value: b.id, label: `${b.name} (${b.code})` })),
            ]}
          />
          <FilterSelect
            label={t.staffSettings.filterStatus}
            value={filter.status}
            onChange={(status) => setFilter((f) => ({ ...f, status: status as Filter['status'] }))}
            options={[
              { value: 'active', label: t.settings.active },
              { value: 'inactive', label: t.settings.inactive },
              { value: 'all', label: t.settings.all },
            ]}
          />
        </div>

        {staff.isPending ? (
          <div className="divide-y">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : staff.isError ? (
          <div className="p-5">
            <FormAlert>{t.settings.loadError}</FormAlert>
          </div>
        ) : staff.data.length === 0 ? (
          <EmptyState icon={UsersRound}>{filtered ? t.staffSettings.empty : t.staffSettings.emptyFirst}</EmptyState>
        ) : (
          <ul className="divide-y">
            {staff.data.map((person) => {
              const isMe = person.id === me.id
              const isOwner = person.role.key === 'owner'
              return (
                <li
                  key={person.id}
                  className={cn(
                    'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]',
                    !person.isActive && 'bg-muted/30',
                  )}
                >
                  <Avatar name={person.fullName} muted={!person.isActive} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('truncate font-medium', !person.isActive && 'text-muted-foreground')}>
                        {person.fullName}
                      </span>
                      {isMe && <SoftPill tone="primary">{t.staffSettings.you}</SoftPill>}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{person.email}</div>
                  </div>

                  {/* Role and branch: their own columns on wide screens, a second line on phones. */}
                  <div className="col-span-3 col-start-2 row-start-2 flex flex-wrap items-center gap-2 text-sm md:col-span-1 md:col-start-auto md:row-start-auto">
                    <RoleBadge role={person.role.key} label={person.role.name} />
                    <span className="inline-flex min-w-0 items-center gap-1 text-muted-foreground">
                      <Building2 className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">
                        {person.branch ? person.branch.name : t.staffSettings.allBranches}
                      </span>
                    </span>
                  </div>

                  <div className="col-span-3 col-start-2 row-start-3 text-sm md:col-span-1 md:col-start-auto md:row-start-auto">
                    <StatusPill person={person} />
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {person.lastLoginAt
                        ? `${t.staffSettings.lastSeen} ${formatDateTime(person.lastLoginAt)}`
                        : t.staffSettings.neverSignedIn}
                    </div>
                  </div>

                  <div className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`${t.settings.actions}: ${person.fullName}`}
                        disabled={!online}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem onClick={() => setEditing(person)}>
                          <Pencil className="size-4" aria-hidden />
                          {t.settings.edit}
                        </DropdownMenuItem>
                        {person.invited && person.isActive && (
                          <DropdownMenuItem onClick={() => resend.mutate(person.id)}>
                            <Send className="size-4" aria-hidden />
                            {t.staffSettings.resend}
                          </DropdownMenuItem>
                        )}
                        {!isOwner && (
                          <>
                            <DropdownMenuSeparator />
                            {person.isActive ? (
                              <DropdownMenuItem variant="destructive" onClick={() => setDeactivating(person)}>
                                <Power className="size-4" aria-hidden />
                                {t.settings.deactivate}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => reactivate.mutate(person.id)}>
                                <Power className="size-4" aria-hidden />
                                {t.settings.reactivate}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            <StaffForm
              person={editing === 'new' ? null : editing}
              branches={activeBranches}
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
        title={t.staffSettings.deactivateTitle(deactivating?.fullName ?? '')}
        description={t.staffSettings.deactivateBody}
        confirmLabel={t.settings.deactivate}
        tone="destructive"
        pending={deactivate.isPending}
        onConfirm={() => deactivating && deactivate.mutate(deactivating.id)}
      />
    </>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select className={cn(selectClassName, 'bg-background')} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function RoleBadge({ role, label }: { role: string; label: string }) {
  const tone = role === 'owner' ? 'primary' : role === 'physiotherapist' ? 'success' : 'muted'
  return <SoftPill tone={tone}>{label}</SoftPill>
}

function StatusPill({ person }: { person: StaffMember }) {
  if (!person.isActive) return <SoftPill tone="danger">{t.settings.inactive}</SoftPill>
  if (person.invited) return <SoftPill tone="primary">{t.staffSettings.invited}</SoftPill>
  return <SoftPill tone="success">{t.settings.active}</SoftPill>
}
