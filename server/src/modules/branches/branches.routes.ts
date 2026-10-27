import { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission, requireSignedIn } from '../../middleware/authorize.js'
import { createBranch, deactivateBranch, listBranches, reactivateBranch, updateBranch } from './branches.service.js'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

const nameField = z.string().trim().min(2, 'Enter the branch name.').max(120)
const codeField = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/, 'Use 2 to 6 letters or digits, for example PUN or MUM1.')

const createBody = z.object({
  name: nameField,
  code: codeField,
  address: optionalText(300),
  phone: optionalText(20),
})

/** Edits can clear address and phone (empty becomes null). */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()

const updateBody = z
  .object({ name: nameField, code: codeField, address: clearable(300), phone: clearable(20) })
  .partial()

const idParams = z.object({ id: z.uuid({ error: 'Invalid id.' }) })

export const branchesRouter = Router()

branchesRouter.get('/branches', requireSignedIn, async (req, res) => {
  res.json({ branches: await listBranches(tenantDbFor(req), requireAuthContext(req)) })
})

branchesRouter.post('/branches', requirePermission('clinic.manage'), async (req, res) => {
  const branch = await createBranch(tenantDbFor(req), requireAuthContext(req), parseInput(createBody, req.body), req.ip)
  res.status(201).json(branch)
})

branchesRouter.patch('/branches/:id', requirePermission('clinic.manage'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const changes = parseInput(updateBody, req.body)
  res.json(await updateBranch(tenantDbFor(req), requireAuthContext(req), id, changes, req.ip))
})

branchesRouter.post('/branches/:id/deactivate', requirePermission('clinic.manage'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await deactivateBranch(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

branchesRouter.post('/branches/:id/reactivate', requirePermission('clinic.manage'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await reactivateBranch(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})
