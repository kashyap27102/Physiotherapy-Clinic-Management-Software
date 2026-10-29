import { ArrowDownUp, SlidersHorizontal, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Gender, PatientSort } from '@/api'
import { dayKey } from '@/lib/date'
import { cn } from '@/lib/utils'
import { t } from '@/strings/en'
import { activeFilterCount, presetRange, type PatientFilters, type RegisteredPreset } from './patientFilters'

const GENDERS: Gender[] = ['male', 'female', 'other', 'undisclosed']
const SORTS: PatientSort[] = ['newest', 'oldest', 'name', 'name_desc']
const PRESETS: RegisteredPreset[] = ['today', 'week', 'month', 'thisMonth', 'custom']

const chipSelect =
  'h-9 cursor-pointer appearance-none rounded-lg border border-input bg-card pr-3 pl-3 text-sm outline-none transition-colors hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'
const chipActive = 'border-primary/50 bg-primary/5 font-medium text-primary dark:bg-primary/10'
const dateInput =
  'h-9 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 dark:[color-scheme:dark]'

interface PatientFilterBarProps {
  filters: PatientFilters
  /** A filter change; the page goes back to 1 unless the patch sets it. */
  onChange: (patch: Partial<PatientFilters>) => void
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

/** Gender, status, whose phone, registration date, and sorting for the patient list. Collapses behind a button on phones. */
export function PatientFilterBar({ filters, onChange, onClear }: PatientFilterBarProps) {
  const [open, setOpen] = useState(false)
  const [today] = useState(() => dayKey(new Date()))
  const count = activeFilterCount(filters)
  const preset = filters.registered ?? (filters.registeredFrom || filters.registeredTo ? 'custom' : '')

  const choosePreset = (value: string) => {
    if (!value) return onChange({ registered: undefined, registeredFrom: undefined, registeredTo: undefined })
    const chosen = value as RegisteredPreset
    // Custom keeps any dates already chosen so switching to it does not lose them.
    if (chosen === 'custom') return onChange({ registered: 'custom' })
    onChange({ registered: chosen, ...presetRange(chosen, new Date()) })
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
          {t.home.filters.toggle}
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
            {t.home.filters.clear}
          </button>
        )}
      </div>

      <div className={cn('flex-wrap items-center gap-2 pt-3 md:flex md:pt-0', open ? 'flex' : 'hidden')}>
        <Chip label={t.home.filters.gender}>
          <select
            value={filters.gender ?? ''}
            onChange={(event) => onChange({ gender: (event.target.value || undefined) as Gender | undefined })}
            className={cn(chipSelect, filters.gender && chipActive)}
          >
            <option value="">{t.home.filters.anyGender}</option>
            {GENDERS.map((gender) => (
              <option key={gender} value={gender}>
                {t.patient.gender[gender]}
              </option>
            ))}
          </select>
        </Chip>

        <Chip label={t.home.filters.status}>
          <select
            value={filters.status ?? ''}
            onChange={(event) => onChange({ status: (event.target.value || undefined) as PatientFilters['status'] })}
            className={cn(chipSelect, filters.status && chipActive)}
          >
            <option value="">{t.home.filters.anyStatus}</option>
            <option value="active">{t.patient.status.active}</option>
            <option value="inactive">{t.patient.status.inactive}</option>
          </select>
        </Chip>

        <Chip label={t.home.filters.contact}>
          <select
            value={filters.phoneContactType ?? ''}
            onChange={(event) =>
              onChange({ phoneContactType: (event.target.value || undefined) as PatientFilters['phoneContactType'] })
            }
            className={cn(chipSelect, filters.phoneContactType && chipActive)}
          >
            <option value="">{t.home.filters.anyContact}</option>
            <option value="self">{t.home.filters.contactSelf}</option>
            <option value="guardian">{t.home.filters.contactGuardian}</option>
          </select>
        </Chip>

        <Chip label={t.home.filters.registered}>
          <select
            value={preset}
            onChange={(event) => choosePreset(event.target.value)}
            className={cn(chipSelect, preset !== '' && chipActive)}
          >
            <option value="">
              {t.home.filters.registered}: {t.home.filters.registeredPresets.any}
            </option>
            {PRESETS.map((value) => (
              <option key={value} value={value}>
                {t.home.filters.registered}: {t.home.filters.registeredPresets[value]}
              </option>
            ))}
          </select>
        </Chip>

        {preset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t.home.filters.from}
              value={filters.registeredFrom ?? ''}
              max={filters.registeredTo ?? today}
              onChange={(event) => onChange({ registered: 'custom', registeredFrom: event.target.value || undefined })}
              className={dateInput}
            />
            <span className="text-sm text-muted-foreground">–</span>
            <input
              type="date"
              aria-label={t.home.filters.to}
              value={filters.registeredTo ?? ''}
              min={filters.registeredFrom}
              max={today}
              onChange={(event) => onChange({ registered: 'custom', registeredTo: event.target.value || undefined })}
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
            {t.home.filters.clear}
          </button>
        )}

        <label className="relative flex items-center md:ml-auto">
          <span className="sr-only">{t.home.filters.sort}</span>
          <ArrowDownUp className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" aria-hidden />
          <select
            value={filters.sort}
            onChange={(event) => onChange({ sort: event.target.value as PatientSort })}
            className={cn(chipSelect, 'pl-8')}
          >
            {SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {t.home.filters.sorts[sort]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}
