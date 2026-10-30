import { z } from 'zod'

const uuid = z.uuid({ error: 'Invalid id.' })

/** Optional free text: empty means not given. */
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((value) => value || null)

export const idParams = z.object({ id: uuid })

export const startEpisodeBody = z.object({
  /** Owners work across branches, so they say where the episode starts. */
  branchId: uuid.optional(),
})

const extraFields = z
  .object({
    chiefComplaint: z.string().trim().max(500, 'Use at most 500 characters.').optional(),
    painScore: z
      .number({ error: 'Enter the pain score from 0 to 10.' })
      .int('Enter the pain score as a whole number.')
      .min(0, 'Enter the pain score from 0 to 10.')
      .max(10, 'Enter the pain score from 0 to 10.')
      .optional(),
  })
  .strict()
  .optional()
  .transform((value) => {
    const out: Record<string, string | number> = {}
    if (value?.chiefComplaint) out['chiefComplaint'] = value.chiefComplaint
    if (value?.painScore !== undefined) out['painScore'] = value.painScore
    return out
  })

export const assessmentBody = z.object({
  history: text(4000),
  pain: text(2000),
  rangeOfMotion: text(2000),
  diagnosis: text(1000),
  extraFields,
})

export const planBody = z.object({
  diagnosis: text(1000),
  goals: text(2000),
  plannedSessions: z
    .number({ error: 'Enter the planned sessions as a number.' })
    .int('Enter whole sessions.')
    .min(1, 'Enter at least 1 session.')
    .max(500, 'Enter at most 500 sessions.')
    .optional()
    .transform((value) => value ?? null),
  frequency: text(200),
  therapyTypes: text(500),
  /** A string such as "1500" or "1500.50", so no float ever carries money (NFR money rule). */
  estimatedCost: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value, ctx) => {
      if (value === undefined || value === '') return null
      const raw = String(value).trim()
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) {
        ctx.addIssue({ code: 'custom', message: 'Enter an amount such as 1500 or 1500.50.' })
        return z.NEVER
      }
      const [whole = '0', fraction = ''] = raw.split('.')
      return `${whole.replace(/^0+(?=\d)/, '')}.${fraction.padEnd(2, '0')}`
    }),
  notes: text(2000),
})

export const dischargeBody = z.object({
  note: text(1000),
})
