import { z } from 'zod'
import { dateOnly, indiaToday, normalisePhone, yearsBetween } from './patientRules.js'

const uuid = z.uuid({ error: 'Invalid id.' })

const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const

const fullName = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(2, 'Enter the patient name.').max(120, 'Use at most 120 characters.'))

const phone = z
  .string()
  .max(30, 'Enter a valid mobile number.')
  .transform((value, ctx) => {
    const normalised = normalisePhone(value)
    if (!normalised) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit mobile number, for example 98765 43210.' })
      return z.NEVER
    }
    return normalised
  })

/** A calendar date "YYYY-MM-DD" that is real, not in the future, and not more than 120 years ago. */
const dateOfBirth = z.string().transform((value, ctx) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = match ? dateOnly(Number(match[1]), Number(match[2]), Number(match[3])) : null
  const real = date && date.toISOString().slice(0, 10) === value
  const today = indiaToday()
  const todayDate = dateOnly(today.year, today.month, today.day)
  if (!date || !real || date > todayDate || yearsBetween(date, todayDate) > 120) {
    ctx.addIssue({ code: 'custom', message: 'Enter a valid date of birth.' })
    return z.NEVER
  }
  return date
})

const age = z
  .number({ error: 'Enter the age in years.' })
  .int('Enter the age in whole years.')
  .min(0, 'Enter a valid age.')
  .max(120, 'Enter an age up to 120.')

const gender = z.enum(GENDERS, { error: 'Choose a gender.' })
const contactType = z.enum(['self', 'guardian'], { error: 'Choose whose number this is.' })

/** Optional text on create: empty means not given. */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .optional()
    .transform((value) => value || undefined)

/** Optional text on edit: empty clears the field. */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine((value) => value === '' || z.email().safeParse(value).success, 'Enter a valid email address.')

export const createBody = z
  .object({
    fullName,
    phone,
    phoneContactType: contactType.default('self'),
    age: age.optional(),
    dateOfBirth: dateOfBirth.optional(),
    gender,
    address: optional(300),
    emergencyContact: optional(120),
    occupation: optional(120),
    referringDoctor: optional(120),
    email: email.optional().transform((value) => value || undefined),
    notes: optional(1000),
    /** Owners work across branches, so they say where the patient is being registered. */
    branchId: uuid.optional(),
  })
  .refine((body) => body.age !== undefined || body.dateOfBirth !== undefined, {
    path: ['age'],
    message: 'Enter the age or the date of birth.',
    // By default a refinement is skipped when any other field is invalid, which would hide this message until the
    // rest was fixed. Run it unless the age or date of birth themselves were the problem.
    when: (payload) =>
      payload.issues?.every((issue) => issue.path?.[0] !== 'age' && issue.path?.[0] !== 'dateOfBirth') ?? true,
  })

export const updateBody = z
  .object({
    fullName,
    phone,
    phoneContactType: contactType,
    age,
    dateOfBirth: dateOfBirth.nullable(),
    gender,
    address: clearable(300),
    emergencyContact: clearable(120),
    occupation: clearable(120),
    referringDoctor: clearable(120),
    email: email.transform((value) => value || null).nullable(),
    notes: clearable(1000),
  })
  .partial()

export const idParams = z.object({ id: uuid })

/** A calendar date "YYYY-MM-DD" in a filter. */
const filterDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-04-01.')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number]
    return dateOnly(year, month, day).toISOString().slice(0, 10) === value
  }, 'Enter a real date.')

export const SORTS = ['newest', 'oldest', 'name', 'name_desc'] as const

export const searchQuery = z
  .object({
    q: z.string().max(100).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    /** Only patients registered at this branch (the global branch selector). */
    branchId: uuid.optional(),
    gender: gender.optional(),
    phoneContactType: contactType.optional(),
    /** Registered on or after / on or before these India-time dates. */
    registeredFrom: filterDate.optional(),
    registeredTo: filterDate.optional(),
    sort: z.enum(SORTS).default('newest'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(25),
  })
  .refine((query) => !query.registeredFrom || !query.registeredTo || query.registeredFrom <= query.registeredTo, {
    path: ['registeredTo'],
    message: 'The end date must be on or after the start date.',
  })

export const confirmQuery = z.object({ confirmDuplicate: z.enum(['true', 'false']).optional() })
