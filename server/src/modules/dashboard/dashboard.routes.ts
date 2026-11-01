import { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import { getTodaySummary } from './dashboard.service.js'

const todayQuery = z.object({ branchId: z.uuid({ error: 'Invalid id.' }).optional() })

export const dashboardRouter = Router()

dashboardRouter.get('/dashboard/today', requirePermission('report.view'), async (req, res) => {
  const { branchId } = parseInput(todayQuery, req.query)
  res.json(await getTodaySummary(tenantDbFor(req), requireAuthContext(req), branchId))
})
