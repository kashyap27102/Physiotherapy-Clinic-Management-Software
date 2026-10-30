import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown, Loader2, Lock, Stethoscope, TriangleAlert, UsersRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  api,
  errorDetails,
  errorMessage,
  isApiError,
  type PermissionKey,
  type PermissionWarning,
  type RoleSummary,
} from '@/api'
import { FormAlert } from '@/components/auth/FormAlert'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { Switch } from '@/components/common/Switch'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { queryKeys } from '@/lib/queryKeys'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'

type ClinicPermission = Exclude<PermissionKey, 'platform.admin'>

const GROUPS: { key: keyof typeof t.permissionGroups; permissions: ClinicPermission[] }[] = [
  { key: 'patients', permissions: ['patient.view', 'patient.register', 'patient.edit'] },
  {
    key: 'billing',
    permissions: [
      'visit.mark',
      'ledger.view',
      'payment.record',
      'document.issue',
      'fee.override',
      'refund.process',
      'entry.reverse',
    ],
  },
  { key: 'clinical', permissions: ['clinical.view', 'clinical.edit', 'episode.manage'] },
  { key: 'data', permissions: ['report.view', 'data.export', 'data.import', 'audit.view'] },
  { key: 'clinic', permissions: ['clinic.manage', 'staff.manage', 'role.manage', 'device.manage'] },
]
const ALL: ClinicPermission[] = GROUPS.flatMap((g) => g.permissions)

const ROLE_ICONS: Record<string, LucideIcon> = { owner: Crown, receptionist: UsersRound, physiotherapist: Stethoscope }

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key) => b.includes(key))

/** USR-002: the owner chooses what Receptionists and Physiotherapists can do. The owner role is fixed. */
export function RolesPage() {
  const roles = useQuery({ queryKey: queryKeys.roles, queryFn: () => api.roles.list() })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Unsaved edits per role, so switching tabs does not lose them.
  const [drafts, setDrafts] = useState<Record<string, PermissionKey[]>>({})

  const list = roles.data ?? []
  const selected = list.find((r) => r.id === selectedId) ?? list.find((r) => r.editable) ?? list[0]

  return (
    <>
      <PageHeader crumbs={[{ label: t.settings.section }, { label: t.roleSettings.title }]} />
      <p className="-mt-3 mb-6 max-w-2xl text-sm text-muted-foreground">{t.roleSettings.subtitle}</p>

      {roles.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : roles.isError || !selected ? (
        <FormAlert>{t.settings.loadError}</FormAlert>
      ) : (
        <>
          <div role="tablist" aria-label={t.roleSettings.title} className="mb-6 grid gap-3 sm:grid-cols-3">
            {list.map((role) => {
              const Icon = ROLE_ICONS[role.key] ?? UsersRound
              const active = role.id === selected.id
              const draft = drafts[role.id]
              const dirty = draft !== undefined && !sameSet(draft, role.permissions)
              const count = role.editable ? (draft ?? role.permissions).length : ALL.length
              return (
                <button
                  key={role.id}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  onClick={() => setSelectedId(role.id)}
                  className={cn(
                    'relative flex items-start gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition-all outline-none',
                    'hover:border-primary/30 focus-visible:ring-3 focus-visible:ring-ring/50',
                    active && 'border-primary/50 bg-accent/40 ring-1 ring-primary/20',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-xl',
                      active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      {role.name}
                      {!role.editable && <Lock className="size-3.5 text-muted-foreground" aria-hidden />}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t.roleSettings.members(role.userCount)} · {t.roleSettings.granted(count, ALL.length)}
                    </span>
                  </span>
                  {dirty && (
                    <span
                      className="absolute top-3 right-3 size-2 rounded-full bg-chart-3"
                      aria-label={t.roleSettings.unsaved}
                    />
                  )}
                </button>
              )
            })}
          </div>

          <RoleEditor
            key={selected.id}
            role={selected}
            draft={drafts[selected.id] ?? selected.permissions}
            onDraft={(next) => setDrafts((d) => ({ ...d, [selected.id]: next }))}
            onSaved={() =>
              setDrafts((d) => {
                const { [selected.id]: _saved, ...rest } = d
                return rest
              })
            }
          />
        </>
      )}
    </>
  )
}

interface RoleEditorProps {
  role: RoleSummary
  draft: PermissionKey[]
  onDraft: (next: PermissionKey[]) => void
  onSaved: () => void
}

function RoleEditor({ role, draft, onDraft, onSaved }: RoleEditorProps) {
  const queryClient = useQueryClient()
  const online = useOnlineStatus()
  const [warnings, setWarnings] = useState<PermissionWarning[] | null>(null)
  const editable = role.editable
  const granted = new Set<PermissionKey>(editable ? draft : ALL)
  const dirty = editable && !sameSet(draft, role.permissions)

  const save = useMutation({
    mutationFn: (confirm: boolean) => api.roles.setPermissions(role.id, draft, confirm),
    onSuccess: async () => {
      setWarnings(null)
      onSaved()
      toast.success(t.roleSettings.saved(role.name))
      await queryClient.invalidateQueries({ queryKey: queryKeys.roles })
    },
    onError: (e) => {
      // US-07.4: the server asks for confirmation before leaving only the owner able to do everyday work.
      if (isApiError(e, 'PERMISSION_WARNING')) {
        setWarnings(errorDetails<{ warnings: PermissionWarning[] }>(e).warnings ?? [])
        return
      }
      setWarnings(null)
      toast.error(errorMessage(e, t.common.genericError))
    },
  })

  function toggle(key: PermissionKey, on: boolean) {
    onDraft(on ? [...draft, key] : draft.filter((k) => k !== key))
  }

  return (
    <div className="space-y-4 pb-24">
      {!editable && <FormAlert tone="info">{t.roleSettings.ownerLocked}</FormAlert>}

      {/* Columns (not a grid) so a short card sits right under the one above it instead of leaving a gap. */}
      <div className="gap-4 xl:columns-2">
        {GROUPS.map((group) => {
          const on = group.permissions.filter((key) => granted.has(key)).length
          return (
            <section
              key={group.key}
              className="mb-4 break-inside-avoid overflow-hidden rounded-xl border bg-card shadow-xs"
            >
              <header className="flex items-center justify-between border-b px-5 py-3.5">
                <h2 className="text-sm font-semibold">{t.permissionGroups[group.key]}</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {on}/{group.permissions.length}
                </span>
              </header>
              <ul className="divide-y">
                {group.permissions.map((key) => {
                  const labelId = `perm-${role.key}-${key}`
                  const changed = editable && granted.has(key) !== role.permissions.includes(key)
                  return (
                    <li key={key} className={cn('flex items-center gap-4 px-5 py-3.5', changed && 'bg-accent/30')}>
                      <div className="min-w-0 flex-1">
                        <div id={labelId} className="flex items-center gap-2 text-sm font-medium">
                          {t.permissions[key].label}
                          {changed && <span className="size-1.5 rounded-full bg-chart-3" aria-hidden />}
                        </div>
                        <p id={`${labelId}-hint`} className="mt-0.5 text-xs text-muted-foreground">
                          {t.permissions[key].hint}
                        </p>
                      </div>
                      <Switch
                        checked={granted.has(key)}
                        onChange={(next) => toggle(key, next)}
                        disabled={!editable || !online || save.isPending}
                        labelledBy={labelId}
                        describedBy={`${labelId}-hint`}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      {/* Save bar: appears only with unsaved changes, pinned to the bottom of the screen. */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm animate-in slide-in-from-bottom-4 md:inset-x-auto md:right-6 md:bottom-6 md:left-auto md:rounded-2xl md:border md:shadow-lg">
          <div className="flex items-center gap-3 px-4 py-3 md:px-5">
            <span className="size-2 shrink-0 rounded-full bg-chart-3" aria-hidden />
            <span className="mr-auto text-sm font-medium">{t.roleSettings.unsaved}</span>
            <Button
              variant="ghost"
              className="h-10"
              disabled={save.isPending}
              onClick={() => onDraft(role.permissions)}
            >
              {t.settings.discard}
            </Button>
            <Button className="h-10 px-4" disabled={save.isPending || !online} onClick={() => save.mutate(false)}>
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              {save.isPending ? t.settings.saving : t.settings.saveChanges}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={warnings !== null}
        onOpenChange={(open) => !open && setWarnings(null)}
        title={t.roleSettings.warningTitle}
        description={t.roleSettings.warningBody}
        confirmLabel={t.roleSettings.warningConfirm}
        tone="destructive"
        pending={save.isPending}
        onConfirm={() => save.mutate(true)}
      >
        <ul className="space-y-2">
          {(warnings ?? []).map((warning) => (
            <li
              key={warning.permission}
              className="flex gap-2.5 rounded-lg border border-chart-3/30 bg-[color-mix(in_oklch,var(--chart-3),transparent_88%)] px-3 py-2.5 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-chart-3" aria-hidden />
              {warning.message}
            </li>
          ))}
        </ul>
      </ConfirmDialog>
    </div>
  )
}
