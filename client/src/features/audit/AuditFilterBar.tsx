import { SlidersHorizontal, UserRound, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { StaffMember } from '@/api'
import { dayKey } from '@/lib/date'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { activeFilterCount, presetRange, type AuditFilters, type DatePreset } from './auditFilters'
import { PatientPicker } from './PatientPicker'

const PRESETS: DatePreset[] = ['today', 'week', 'month', 'thisMonth', 'custom']

const chipSelect =
  'h-9 cursor-pointer appearance-none rounded-lg border border-input bg-card pr-3 pl-3 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
const chipActive = 'border-primary/50 bg-primary/5 font-medium text-primary dark:bg-primary/10'
const dateInput =
  'h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]'

interface AuditFilterBarProps {
  filters: AuditFilters
  /** Staff for the person filter; undefined when the viewer cannot list staff (the select is then left out). */
  staff: StaffMember[] | undefined
  /** Names for the ids in the address, learned from the entries on screen. */
  patientName: string | null
  userName: string | null
  /** A filter change; the page goes back to 1 unless the patch sets it. */
  onChange: (patch: Partial<AuditFilters>) => void
  onPickPatient: (patient: { id: string; fullName: string }) => void
  onClear: () => void
}

function Chip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex">
      <span className="sr-only">{label}</span>
      {children}
    </label>
  )
}

/** Person, activity, date and patient filters for the audit log. Collapses behind a button on phones. */
export function AuditFilterBar({
  filters,
  staff,
  patientName,
  userName,
  onChange,
  onPickPatient,
  onClear,
}: AuditFilterBarProps) {
  const [open, setOpen] = useState(false)
  const [today] = useState(() => dayKey(new Date()))
  const count = activeFilterCount(filters)
  const preset = filters.preset ?? ''
  // A person from a deep link who is not in the staff list (or the viewer cannot list staff) still gets a chip.
  const knownUser = staff?.some((person) => person.id === filters.userId) ?? false

  const choosePreset = (value: string) => {
    if (!value) return onChange({ preset: undefined, from: undefined, to: undefined })
    const chosen = value as DatePreset
    // Custom keeps any dates already chosen so switching to it does not lose them.
    if (chosen === 'custom') return onChange({ preset: 'custom' })
    onChange({ preset: chosen, ...presetRange(chosen, new Date()) })
  }

  return (
    <div className="border-b px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className={cn(
            'flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
            count > 0 && chipActive,
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          {t.audit.filters.toggle}
          {count > 0 && (
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {count}
            </span>
          )}
        </button>
        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="h-9 px-2 text-sm text-muted-foreground hover:text-foreground"
          >
            {t.audit.filters.clear}
          </button>
        )}
      </div>

      <div className={cn('flex-wrap items-center gap-2 pt-3 md:flex md:pt-0', open ? 'flex' : 'hidden')}>
        {filters.patientId ? (
          <span
            className={cn('flex h-9 max-w-64 items-center gap-1.5 rounded-lg border pr-1 pl-3 text-sm', chipActive)}
          >
            <UserRound className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{patientName ?? t.audit.filters.patientFilter}</span>
            <button
              type="button"
              onClick={() => onChange({ patientId: undefined })}
              aria-label={t.audit.filters.removePatient}
              className="flex size-7 shrink-0 items-center justify-center rounded-md outline-none hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          <PatientPicker onPick={onPickPatient} />
        )}

        {(staff || filters.userId) && (
          <Chip label={t.audit.filters.user}>
            <select
              value={filters.userId ?? ''}
              onChange={(event) => onChange({ userId: event.target.value || undefined })}
              className={cn(chipSelect, 'max-w-48', filters.userId && chipActive)}
            >
              <option value="">
                {t.audit.filters.user}: {t.audit.filters.anyUser}
              </option>
              {filters.userId && !knownUser && (
                <option value={filters.userId}>
                  {t.audit.filters.user}: {userName ?? t.audit.unknownUser}
                </option>
              )}
              {staff?.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </Chip>
        )}

        <Chip label={t.audit.filters.action}>
          <select
            value={filters.action ?? ''}
            onChange={(event) => onChange({ action: event.target.value || undefined })}
            className={cn(chipSelect, 'max-w-56', filters.action && chipActive)}
          >
            <option value="">{t.audit.filters.anyAction}</option>
            {t.audit.groups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Chip>

        <Chip label={t.audit.filters.when}>
          <select
            value={preset}
            onChange={(event) => choosePreset(event.target.value)}
            className={cn(chipSelect, preset !== '' && chipActive)}
          >
            <option value="">
              {t.audit.filters.when}: {t.audit.filters.presets.any}
            </option>
            {PRESETS.map((value) => (
              <option key={value} value={value}>
                {t.audit.filters.when}: {t.audit.filters.presets[value]}
              </option>
            ))}
          </select>
        </Chip>

        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t.audit.filters.from}
              value={filters.from ?? ''}
              max={filters.to ?? today}
              onChange={(event) => onChange({ preset: 'custom', from: event.target.value || undefined })}
              className={dateInput}
            />
            <span className="text-sm text-muted-foreground">–</span>
            <input
              type="date"
              aria-label={t.audit.filters.to}
              value={filters.to ?? ''}
              min={filters.from}
              max={today}
              onChange={(event) => onChange({ preset: 'custom', to: event.target.value || undefined })}
              className={dateInput}
            />
          </div>
        )}

        {count > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:flex"
          >
            <X className="size-3.5" aria-hidden />
            {t.audit.filters.clear}
          </button>
        )}
      </div>
    </div>
  )
}
