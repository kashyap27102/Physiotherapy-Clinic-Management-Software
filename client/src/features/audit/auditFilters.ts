import type { AuditLogInput } from '@/api'
import { dayKey } from '@/lib/date'

export const PAGE_SIZES = [25, 50, 100] as const
const DEFAULT_PAGE_SIZE = 50

export type DatePreset = 'today' | 'week' | 'month' | 'thisMonth' | 'custom'

/**
 * The audit log's filters, as kept in the address bar so a bookmark, a deep link from a patient or a staff member, and
 * going back all keep them. The branch is not here: it follows the branch chosen in the top bar. No name is ever put in
 * the address, only ids.
 */
export interface AuditFilters {
  userId?: string
  patientId?: string
  /** An exact action, or a group ending in a dot (`patient.`). */
  action?: string
  preset?: DatePreset
  from?: string
  to?: string
  page: number
  pageSize: number
}

const PRESETS: readonly DatePreset[] = ['today', 'week', 'month', 'thisMonth', 'custom']
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isId = (value: string | null): value is string => value !== null && UUID.test(value)
const isDay = (value: string | null): value is string => value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value)
const isAction = (value: string | null): value is string => value !== null && /^[a-z_]+(\.([a-z_]+)?)?$/.test(value)

/** Reads filters from the address bar, ignoring anything unknown (an old bookmark must not break the page). */
export function readFilters(params: URLSearchParams): AuditFilters {
  const page = Number(params.get('page'))
  const pageSize = Number(params.get('size'))
  const preset = PRESETS.find((item) => item === params.get('range'))
  const from = params.get('from')
  const to = params.get('to')
  return {
    userId: isId(params.get('user')) ? params.get('user')! : undefined,
    patientId: isId(params.get('patient')) ? params.get('patient')! : undefined,
    action: isAction(params.get('action')) ? params.get('action')! : undefined,
    // Dates without a named range (a hand-made link) behave as a custom range.
    preset: preset ?? (isDay(from) || isDay(to) ? 'custom' : undefined),
    from: isDay(from) ? from : undefined,
    to: isDay(to) ? to : undefined,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    pageSize: PAGE_SIZES.find((size) => size === pageSize) ?? DEFAULT_PAGE_SIZE,
  }
}

/** Writes filters back, leaving defaults out so a plain log keeps a clean address. */
export function writeFilters(filters: AuditFilters): URLSearchParams {
  const entries: [string, string | undefined][] = [
    ['user', filters.userId],
    ['patient', filters.patientId],
    ['action', filters.action],
    ['range', filters.preset],
    ['from', filters.from],
    ['to', filters.to],
    ['page', filters.page === 1 ? undefined : String(filters.page)],
    ['size', filters.pageSize === DEFAULT_PAGE_SIZE ? undefined : String(filters.pageSize)],
  ]
  return new URLSearchParams(entries.filter((entry): entry is [string, string] => entry[1] !== undefined))
}

/** How many filters narrow the log (paging does not count). The branch is shown in the top bar, not counted here. */
export function activeFilterCount(filters: AuditFilters): number {
  return [filters.userId, filters.patientId, filters.action, filters.from ?? filters.to].filter(Boolean).length
}

/** The date range a preset means, counted in India days up to and including today. */
export function presetRange(preset: DatePreset, now: Date): { from?: string; to?: string } {
  const today = dayKey(now)
  const daysAgo = (n: number) => dayKey(new Date(now.getTime() - n * 86_400_000))
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'week':
      return { from: daysAgo(6), to: today }
    case 'month':
      return { from: daysAgo(29), to: today }
    case 'thisMonth':
      return { from: `${today.slice(0, 8)}01`, to: today }
    case 'custom':
      return {}
  }
}

export function toInput(filters: AuditFilters, branchId: string | null): AuditLogInput {
  return {
    userId: filters.userId,
    patientId: filters.patientId,
    action: filters.action,
    branchId: branchId ?? undefined,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    pageSize: filters.pageSize,
  }
}

/** The address of the log narrowed to one patient or one staff member, for the deep links. */
export const auditLinkForPatient = (patientId: string) =>
  `/audit-log?${writeFilters({ ...readFilters(new URLSearchParams()), patientId })}`
export const auditLinkForUser = (userId: string) =>
  `/audit-log?${writeFilters({ ...readFilters(new URLSearchParams()), userId })}`
