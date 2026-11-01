import { formatDate } from '@/lib/date'
import { formatINR } from '@/lib/money'
import { t } from '@/strings/en'

export type Tone = 'success' | 'primary' | 'muted' | 'danger'

type Details = Record<string, unknown>

const asDetails = (value: unknown): Details | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Details) : null
const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null)
const money = (value: unknown): string | null => {
  const raw = text(value)
  return raw ? formatINR(raw) : null
}

/** "feeOverridden" -> "fee overridden", "phone_number" -> "phone number". */
export const humanizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase()

/** The sentence for an action, or the raw key when a newer server action is not known yet. */
export const actionLabel = (action: string): string => t.audit.actions[action] ?? action

const DANGER = new Set([
  'auth.login_failed',
  'auth.account_locked',
  'auth.otp_failed',
  'auth.device_revoked',
  'branch.deactivated',
  'user.deactivated',
  'visit.fee_overridden',
  'visit.backdated',
  'visit.reversed',
  'ledger.reversed',
  'role.permissions_changed',
])
const MONEY = new Set(['payment.recorded', 'refund.processed', 'document.issued'])

/** Colour of the action pill: warnings stand out, plain views stay quiet, money is green. */
export function actionTone(action: string): Tone {
  if (DANGER.has(action)) return 'danger'
  if (action.endsWith('.viewed') || action === 'document.printed') return 'muted'
  if (MONEY.has(action)) return 'success'
  return 'primary'
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1)

/** Names of the fields a `before`/`after` pair covers. */
function changedFields(details: Details): string[] {
  const after = asDetails(details['after'])
  const before = asDetails(details['before'])
  return Object.keys(after ?? before ?? {})
}

/** One short line for the list row. Full values are in the detail dialog; nothing here shows a phone or address. */
export function summarize(action: string, raw: unknown): string | null {
  const d = asDetails(raw)
  if (!d) return null
  const s = t.audit.summary
  const parts: (string | null)[] = []

  switch (action) {
    case 'payment.recorded': {
      const amount = money(d['amount'])
      const method = text(d['method'])
      parts.push(amount && method ? s.amountMethod(amount, capitalise(method)) : amount)
      const receipt = text(d['receipt'])
      parts.push(receipt ? s.receipt(receipt) : null)
      break
    }
    case 'refund.processed':
    case 'ledger.reversed':
    case 'visit.reversed': {
      parts.push(money(d['amount']))
      const receipt = text(d['receipt'])
      parts.push(receipt ? s.receipt(receipt) : null)
      const reason = text(d['reason'])
      parts.push(reason ? s.reason(reason) : null)
      break
    }
    case 'visit.fee_overridden': {
      const from = money(d['defaultFee'])
      const to = money(d['fee'])
      parts.push(from && to ? s.feeChange(from, to) : to)
      const reason = text(d['reason'])
      parts.push(reason ? s.reason(reason) : null)
      break
    }
    case 'visit.backdated': {
      const day = text(d['visitDate'])
      parts.push(day ? s.forDate(formatDate(`${day}T12:00:00+05:30`)) : null)
      const reason = text(d['reason'])
      parts.push(reason ? s.reason(reason) : null)
      break
    }
    case 'visit.marked':
      parts.push(money(d['fee']))
      break
    case 'fee.default_changed': {
      const from = money(d['from'])
      const to = money(d['to'])
      parts.push(from && to ? s.feeChange(from, to) : to)
      break
    }
    case 'document.issued': {
      const number = text(d['number'])
      parts.push(number)
      parts.push(typeof d['sessions'] === 'number' ? s.sessions(d['sessions']) : null)
      parts.push(money(d['total']))
      break
    }
    case 'document.printed': {
      const number = text(d['number'])
      parts.push(number)
      parts.push(typeof d['duplicate'] === 'boolean' ? (d['duplicate'] ? s.duplicate : s.original) : null)
      break
    }
    case 'role.permissions_changed': {
      const added = Array.isArray(d['added']) ? d['added'].length : 0
      const removed = Array.isArray(d['removed']) ? d['removed'].length : 0
      parts.push(added ? s.added(String(added)) : null)
      parts.push(removed ? s.removed(String(removed)) : null)
      break
    }
    case 'user.created': {
      const role = text(d['role'])
      parts.push(role ? s.role(humanizeKey(role)) : null)
      break
    }
    case 'episode.discharged':
    case 'patient.updated':
    case 'branch.updated':
    case 'clinic.updated': {
      const fields = changedFields(d)
      parts.push(fields.length ? s.changed(fields.map(humanizeKey).join(', ')) : null)
      break
    }
    default:
      break
  }
  const line = parts.filter((part): part is string => part !== null).join(' · ')
  return line === '' ? null : line
}

export interface Change {
  field: string
  before: string
  after: string
}

/** Rows for a "before and after" pair (patient, branch and clinic edits). */
export function changesOf(raw: unknown): Change[] {
  const d = asDetails(raw)
  const before = asDetails(d?.['before'])
  const after = asDetails(d?.['after'])
  if (!before && !after) return []
  return Object.keys(after ?? before ?? {}).map((key) => ({
    field: humanizeKey(key),
    before: showValue(before?.[key]),
    after: showValue(after?.[key]),
  }))
}

export interface Fact {
  label: string
  value: string
}

const HIDDEN = new Set(['before', 'after', 'patientId'])

/** The remaining details as label and value lines, for the detail dialog. */
export function factsOf(raw: unknown): Fact[] {
  const d = asDetails(raw)
  if (!d) return []
  return Object.entries(d)
    .filter(([key]) => !HIDDEN.has(key))
    .map(([key, value]) => ({ label: capitalise(humanizeKey(key)), value: showValue(value) }))
}

/** Any stored value as text a person can read: money as rupees, lists joined, empty as a dash. */
export function showValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return t.audit.detail.empty
  if (typeof value === 'boolean') return value ? t.common.yes : t.common.no
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return /^\d+\.\d{2}$/.test(value) ? formatINR(value) : value
  if (Array.isArray(value)) return value.length ? value.map(showValue).join(', ') : t.audit.detail.empty
  return JSON.stringify(value)
}
