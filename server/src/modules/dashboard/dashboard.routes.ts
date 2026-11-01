import { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import { getFinanceToday, getTodaySummary } from './dashboard.service.js'

const todayQuery = z.object({ branchId: z.uuid({ error: 'Invalid id.' }).optional() })

export const dashboardRouter = Router()

dashboardRouter.get('/dashboard/today', requirePermission('report.view'), async (req, res) => {
  const { branchId } = parseInput(todayQuery, req.query)
  res.json(await getTodaySummary(tenantDbFor(req), requireAuthContext(req), branchId))
})

// Money has its own permission, so the dashboard can be shared without showing revenue.
dashboardRouter.get('/finance/today', requirePermission('finance.view'), async (req, res) => {
  const { branchId } = parseInput(todayQuery, req.query)
  res.json(await getFinanceToday(tenantDbFor(req), requireAuthContext(req), branchId))
})
