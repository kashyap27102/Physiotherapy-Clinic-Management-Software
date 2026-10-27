import { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission, requireSignedIn } from '../../middleware/authorize.js'
import { createBranch, listBranches } from './branches.service.js'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined)

const createBody = z.object({
  name: z.string().trim().min(2, 'Enter the branch name.').max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, 'Use 2 to 6 letters or digits, for example PUN or MUM1.'),
  address: optionalText(300),
  phone: optionalText(20),
})

export const branchesRouter = Router()

branchesRouter.get('/branches', requireSignedIn, async (req, res) => {
  res.json({ branches: await listBranches(tenantDbFor(req), requireAuthContext(req)) })
})

branchesRouter.post('/branches', requirePermission('clinic.manage'), async (req, res) => {
  const branch = await createBranch(tenantDbFor(req), requireAuthContext(req), parseInput(createBody, req.body), req.ip)
  res.status(201).json(branch)
})
