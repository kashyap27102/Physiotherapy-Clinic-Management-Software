import { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import { listPermissions, listRoles, setRolePermissions } from './roles.service.js'

const idParams = z.object({ id: z.uuid({ error: 'Invalid id.' }) })
const putBody = z.object({
  permissions: z.array(z.string().max(60)).max(60),
  confirmWarnings: z.boolean().default(false),
})

export const rolesRouter = Router()
const manage = requirePermission('role.manage')

rolesRouter.get('/roles', manage, async (req, res) => {
  res.json({ roles: await listRoles(tenantDbFor(req)) })
})

rolesRouter.get('/permissions', manage, async (req, res) => {
  res.json({ permissions: await listPermissions(tenantDbFor(req)) })
})

rolesRouter.put('/roles/:id/permissions', manage, async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(putBody, req.body)
  res.json(await setRolePermissions(tenantDbFor(req), requireAuthContext(req), id, body, req.ip))
})
