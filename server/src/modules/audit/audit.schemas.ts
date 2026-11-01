import { z } from 'zod'
import { filterDate } from '../patients/patients.schemas.js'

const uuid = z.uuid({ error: 'Invalid id.' })

export const listQuery = z
  .object({
    userId: uuid.optional(),
    patientId: uuid.optional(),
    /** An exact action such as `payment.recorded`, or a group ending in a dot such as `patient.`. */
    action: z
      .string()
      .trim()
      .max(60)
      .regex(/^[a-z_]+(\.([a-z_]+)?)?$/, 'Use an action such as payment.recorded.')
      .optional(),
    branchId: uuid.optional(),
    /** On or after / on or before these India-time dates. */
    from: filterDate.optional(),
    to: filterDate.optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    path: ['to'],
    message: 'The end date must be on or after the start date.',
  })

export type ListQuery = z.infer<typeof listQuery>
