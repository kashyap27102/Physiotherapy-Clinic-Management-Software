import { z } from 'zod'
import { parseIsoDate, parseMoney } from '../billing/billingRules.js'

const uuid = z.uuid({ error: 'Invalid id.' })

export const idParams = z.object({ id: uuid })

export const todayQuery = z.object({ branchId: uuid.optional() })

export const createVisitBody = z.object({
  patientId: uuid,
  therapistId: uuid.optional(),
  /** Owners work across branches; staff always use their own. */
  branchId: uuid.optional(),
  feeOverride: z
    .object({
      amount: z
        .union([z.string(), z.number()], { error: 'Enter the fee as an amount such as 500 or 500.50.' })
        .transform((value, ctx) => {
          const paise = parseMoney(String(value))
          if (paise === null) {
            ctx.addIssue({ code: 'custom', message: 'Enter the fee as an amount such as 500 or 500.50.' })
            return z.NEVER
          }
          return paise
        }),
      reason: z.string().trim().max(500, 'Use at most 500 characters.').default(''),
    })
    .optional(),
  /** The day the visit really happened, for attendance that was forgotten. Needs `visit.backdate` (checked in the service). */
  visitDate: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return null
      const parts = parseIsoDate(value)
      if (!parts) {
        ctx.addIssue({ code: 'custom', message: 'Enter the date as YYYY-MM-DD.' })
        return z.NEVER
      }
      return parts
    }),
  backdateReason: z.string().trim().max(500, 'Use at most 500 characters.').default(''),
  /** Confirms a second visit on the chosen day (today unless a visit date is given). */
  confirmSecondVisitToday: z.boolean().optional(),
})

const isoDate = z.string({ error: 'Choose the day.' }).transform((value, ctx) => {
  const parts = parseIsoDate(value)
  if (!parts) {
    ctx.addIssue({ code: 'custom', message: 'Enter the date as YYYY-MM-DD.' })
    return z.NEVER
  }
  return parts
})

export const MAX_BULK_ENTRIES = 60

export const bulkVisitsBody = z
  .object({
    entries: z
      .array(z.object({ patientId: uuid, date: isoDate }))
      .min(1, 'Choose at least one patient and day.')
      .max(MAX_BULK_ENTRIES, `Mark at most ${MAX_BULK_ENTRIES} visits at a time.`),
    therapistId: uuid.optional(),
    /** Owners work across branches; otherwise each visit is at the branch its episode started at. */
    branchId: uuid.optional(),
    reason: z.string().trim().max(500, 'Use at most 500 characters.').default(''),
    confirmDuplicates: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>()
    for (const [index, entry] of body.entries.entries()) {
      const key = `${entry.patientId}|${entry.date.year}-${entry.date.month}-${entry.date.day}`
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: ['entries', index], message: 'The same patient and day is listed twice.' })
      }
      seen.add(key)
    }
  })

export const noteBody = z.object({
  noteText: z
    .string({ error: 'Write the note.' })
    .trim()
    .min(1, 'Write the note.')
    .max(4000, 'Use at most 4000 characters.'),
})

export { reverseBody } from '../billing/billing.schemas.js'
