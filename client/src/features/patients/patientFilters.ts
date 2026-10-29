import type { Gender, PatientSearchInput, PatientSort } from '@/api'
import { dayKey } from '@/lib/date'

export const PAGE_SIZES = [10, 25, 50] as const
const DEFAULT_PAGE_SIZE = 25

export type RegisteredPreset = 'today' | 'week' | 'month' | 'thisMonth' | 'custom'

/** The patient list's filters, as kept in the address bar so going back to the list keeps them. */
export interface PatientFilters {
  gender?: Gender
  status?: 'active' | 'inactive'
  phoneContactType?: 'self' | 'guardian'
  registered?: RegisteredPreset
  registeredFrom?: string
  registeredTo?: string
  sort: PatientSort
  page: number
  pageSize: number
}

const GENDERS: readonly Gender[] = ['male', 'female', 'other', 'undisclosed']
const SORTS: readonly PatientSort[] = ['newest', 'oldest', 'name', 'name_desc']
const PRESETS: readonly RegisteredPreset[] = ['today', 'week', 'month', 'thisMonth', 'custom']
const isDay = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value)

function oneOf<T extends string>(allowed: readonly T[], value: string | null): T | undefined {
  return allowed.find((item) => item === value)
}

/** Reads filters from the address bar, ignoring anything unknown (an old bookmark must not break the list). */
export function readFilters(params: URLSearchParams): PatientFilters {
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('size'))
  return {
    gender: oneOf(GENDERS, params.get('gender')),
    status: oneOf(['active', 'inactive'] as const, params.get('status')),
    phoneContactType: oneOf(['self', 'guardian'] as const, params.get('contact')),
    registered: oneOf(PRESETS, params.get('registered')),
    registeredFrom: isDay(params.get('from')) ? params.get('from')! : undefined,
    registeredTo: isDay(params.get('to')) ? params.get('to')! : undefined,
    sort: oneOf(SORTS, params.get('sort')) ?? 'newest',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: PAGE_SIZES.find((size) => size === pageSize) ?? DEFAULT_PAGE_SIZE,
  }
}

/** Writes filters back, leaving defaults out so a plain list keeps a clean address. */
export function writeFilters(filters: PatientFilters, q: string): URLSearchParams {
  const entries: [string, string | undefined][] = [
    ['q', q || undefined],
    ['gender', filters.gender],
    ['status', filters.status],
    ['contact', filters.phoneContactType],
    ['registered', filters.registered],
    ['from', filters.registeredFrom],
    ['to', filters.registeredTo],
    ['sort', filters.sort === 'newest' ? undefined : filters.sort],
    ['page', filters.page === 1 ? undefined : String(filters.page)],
    ['size', filters.pageSize === DEFAULT_PAGE_SIZE ? undefined : String(filters.pageSize)],
  ]
  return new URLSearchParams(entries.filter((entry): entry is [string, string] => entry[1] !== undefined))
}

/** How many filters narrow the list (sorting and paging do not count). */
export function activeFilterCount(filters: PatientFilters): number {
  return [
    filters.gender,
    filters.status,
    filters.phoneContactType,
    filters.registeredFrom ?? filters.registeredTo,
  ].filter(Boolean).length
}

/** The date range a preset means, counted in India days up to and including today. */
export function presetRange(preset: RegisteredPreset, now: Date): { registeredFrom?: string; registeredTo?: string } {
  const today = dayKey(now)
  const daysAgo = (n: number) => dayKey(new Date(now.getTime() - n * 86_400_000))
  switch (preset) {
    case 'today':
      return { registeredFrom: today, registeredTo: today }
    case 'week':
      return { registeredFrom: daysAgo(6), registeredTo: today }
    case 'month':
      return { registeredFrom: daysAgo(29), registeredTo: today }
    case 'thisMonth':
      return { registeredFrom: `${today.slice(0, 8)}01`, registeredTo: today }
    case 'custom':
      return {}
  }
}

export function toSearchInput(filters: PatientFilters, q: string, branchId: string | null): PatientSearchInput {
  return {
    q,
    branchId: branchId ?? undefined,
    gender: filters.gender,
    status: filters.status,
    phoneContactType: filters.phoneContactType,
    registeredFrom: filters.registeredFrom,
    registeredTo: filters.registeredTo,
    sort: filters.sort,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}
