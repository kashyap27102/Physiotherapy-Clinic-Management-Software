import { z } from 'zod'
import { PAYMENT_METHODS, parseMoney, parseIsoDate } from './billingRules.js'

const uuid = z.uuid({ error: 'Invalid id.' })

export const idParams = z.object({ id: uuid })

/** An amount typed or sent as "500", "500.5" or 500; kept as whole paise so no float carries money. */
const amount = (label: string, { allowZero = false } = {}) =>
  z
    .union([z.string(), z.number()], { error: `Enter ${label} as an amount such as 500 or 500.50.` })
    .transform((value, ctx) => {
      const paise = parseMoney(String(value))
      if (paise === null || (!allowZero && paise <= 0)) {
        ctx.addIssue({
          code: 'custom',
          message: allowZero
            ? 'Enter an amount such as 500 or 500.50.'
            : 'Enter an amount above zero, such as 500 or 500.50.',
        })
        return z.NEVER
      }
      return paise
    })

const reason = (what: string) =>
  z
    .string({ error: `Say why ${what}.` })
    .trim()
    .min(1, `Say why ${what}.`)
    .max(500, 'Use at most 500 characters.')

const method = z.enum(PAYMENT_METHODS, { error: 'Choose cash, UPI, card or bank transfer.' })

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((value) => value || null)

export const setFeeBody = z.object({ defaultFee: amount('the fee', { allowZero: true }) })

export const paymentBody = z
  .object({
    patientId: uuid,
    amount: amount('the amount'),
    method,
    reference: optionalText(100),
    /** Back-dating, owner only. */
    date: z
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
    branchId: uuid.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.method === 'bank_transfer' && !body.reference) {
      ctx.addIssue({ code: 'custom', path: ['reference'], message: 'A reference is required for bank transfers.' })
    }
  })

export const refundBody = z.object({
  patientId: uuid,
  amount: amount('the amount'),
  method,
  reason: reason('the money is being refunded'),
  branchId: uuid.optional(),
})

export const reverseBody = z.object({ reason: reason('this is being reversed') })

export const invoiceBody = z
  .object({
    patientId: uuid,
    episodeId: uuid.optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    branchId: uuid.optional(),
  })
  .superRefine((body, ctx) => {
    const hasRange = body.from !== undefined || body.to !== undefined
    if (!body.episodeId && !hasRange) {
      ctx.addIssue({ code: 'custom', path: ['episodeId'], message: 'Choose an episode or a date range.' })
    }
    for (const key of ['from', 'to'] as const) {
      const value = body[key]
      if (value !== undefined && !parseIsoDate(value)) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'Enter the date as YYYY-MM-DD.' })
      }
    }
    if (hasRange && !body.episodeId && (body.from === undefined || body.to === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'Enter both dates.' })
    }
    if (body.from && body.to && body.from > body.to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'The end date must not be before the start date.' })
    }
  })
