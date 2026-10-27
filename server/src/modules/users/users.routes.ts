import { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import {
  createStaff,
  deactivateStaff,
  listStaff,
  reactivateStaff,
  resendInvitation,
  STAFF_ROLES,
  updateStaff,
} from './users.service.js'

const uuid = z.uuid({ error: 'Invalid id.' })
const idParams = z.object({ id: uuid })

const nameField = z.string().trim().min(2, 'Enter the full name.').max(120)
const roleField = z.enum(STAFF_ROLES, { error: 'Choose Receptionist or Physiotherapist.' })

const createBody = z.object({
  fullName: nameField,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ error: 'Enter a valid email address.' })),
  role: roleField,
  branchId: uuid,
})

const updateBody = z.object({ fullName: nameField, role: roleField, branchId: uuid }).partial()

const listQuery = z.object({
  role: z.string().optional(),
  branchId: uuid.optional(),
  active: z.enum(['true', 'false']).optional(),
})

export const usersRouter = Router()
const manage = requirePermission('staff.manage')

usersRouter.get('/users', manage, async (req, res) => {
  const query = parseInput(listQuery, req.query)
  const staff = await listStaff(tenantDbFor(req), {
    role: query.role,
    branchId: query.branchId,
    active: query.active === undefined ? undefined : query.active === 'true',
  })
  res.json({ staff })
})

usersRouter.post('/users', manage, async (req, res) => {
  const result = await createStaff(tenantDbFor(req), requireAuthContext(req), parseInput(createBody, req.body), req.ip)
  res.status(201).json(result)
})

usersRouter.patch('/users/:id', manage, async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await updateStaff(tenantDbFor(req), requireAuthContext(req), id, parseInput(updateBody, req.body), req.ip))
})

usersRouter.post('/users/:id/deactivate', manage, async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await deactivateStaff(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

usersRouter.post('/users/:id/reactivate', manage, async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await reactivateStaff(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

usersRouter.post('/users/:id/resend-invitation', manage, async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  await resendInvitation(tenantDbFor(req), requireAuthContext(req), id, req.ip)
  res.status(204).end()
})
