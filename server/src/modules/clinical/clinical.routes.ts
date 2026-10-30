import { Router } from 'express'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import { assessmentBody, dischargeBody, idParams, planBody, startEpisodeBody } from './clinical.schemas.js'
import {
  dischargeEpisode,
  listAssessments,
  listEpisodes,
  listPlans,
  saveAssessment,
  savePlan,
  startEpisode,
  viewEpisode,
} from './clinical.service.js'

export const clinicalRouter = Router()

clinicalRouter.get('/patients/:id/episodes', requirePermission('patient.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listEpisodes(tenantDbFor(req), id))
})

clinicalRouter.post('/patients/:id/episodes', requirePermission('episode.manage'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(startEpisodeBody, req.body ?? {})
  res.status(201).json(await startEpisode(tenantDbFor(req), requireAuthContext(req), id, body, req.ip))
})

clinicalRouter.get('/episodes/:id', requirePermission('clinical.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await viewEpisode(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

clinicalRouter.get('/episodes/:id/assessments', requirePermission('clinical.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listAssessments(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

clinicalRouter.post('/episodes/:id/assessments', requirePermission('clinical.edit'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(assessmentBody, req.body ?? {})
  const { created, assessment } = await saveAssessment(tenantDbFor(req), requireAuthContext(req), id, body, req.ip)
  res.status(created ? 201 : 200).json(assessment)
})

clinicalRouter.get('/episodes/:id/treatment-plans', requirePermission('clinical.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listPlans(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

clinicalRouter.post('/episodes/:id/treatment-plans', requirePermission('clinical.edit'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(planBody, req.body ?? {})
  const { created, plan } = await savePlan(tenantDbFor(req), requireAuthContext(req), id, body, req.ip)
  res.status(created ? 201 : 200).json(plan)
})

clinicalRouter.post('/episodes/:id/discharge', requirePermission('episode.manage'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(dischargeBody, req.body ?? {})
  res.json(await dischargeEpisode(tenantDbFor(req), requireAuthContext(req), id, body, req.ip))
})
