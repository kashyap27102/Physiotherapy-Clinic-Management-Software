import { z } from 'zod'
import { parseMoney } from '../billing/billingRules.js'

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
  confirmSecondVisitToday: z.boolean().optional(),
})

export const noteBody = z.object({
  noteText: z
    .string({ error: 'Write the note.' })
    .trim()
    .min(1, 'Write the note.')
    .max(4000, 'Use at most 4000 characters.'),
})

export { reverseBody } from '../billing/billing.schemas.js'
