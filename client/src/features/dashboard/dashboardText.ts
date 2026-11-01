import type { DashboardToday } from '@/api'
import { formatINR, toPaise } from '@/lib/money'
import { t } from '@/strings/en'

const isZero = (amount: string) => (toPaise(amount) ?? 0) === 0

/**
 * The small print under "Collected today": what came in, and the reversals and refunds that were taken off it (BR-REP-1).
 * Nothing is said about a reversal or refund that did not happen.
 */
export function collectionNotes(collections: DashboardToday['collections']): string[] {
  const notes: string[] = []
  if (!isZero(collections.payments)) notes.push(t.dashboard.received(formatINR(collections.payments)))
  if (!isZero(collections.reversed)) notes.push(t.dashboard.reversed(formatINR(collections.reversed)))
  if (!isZero(collections.refunded)) notes.push(t.dashboard.refunded(formatINR(collections.refunded)))
  return notes
}

/** "2 sessions · 1 new patient", leaving out what is zero beyond the sessions. */
export function seenNotes(summary: Pick<DashboardToday, 'sessions' | 'newPatients'>): string[] {
  const notes = [t.dashboard.sessions(summary.sessions)]
  if (summary.newPatients > 0) notes.push(t.dashboard.newPatients(summary.newPatients))
  return notes
}
