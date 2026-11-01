import { Router } from 'express'
import { tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import { listQuery } from './audit.schemas.js'
import { listAuditLog } from './audit.service.js'

export const auditRouter = Router()

// There is no write endpoint: entries are created by the server as a side effect of other calls (API doc 5.9).
auditRouter.get('/audit-log', requirePermission('audit.view'), async (req, res) => {
  res.json(await listAuditLog(tenantDbFor(req), parseInput(listQuery, req.query)))
})
