import { Router } from 'express'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { idempotent } from '../../lib/idempotency.js'
import { requirePermission } from '../../middleware/authorize.js'
import { bulkVisitsBody, createVisitBody, idParams, noteBody, reverseBody, todayQuery } from './visits.schemas.js'
import {
  createVisit,
  getVisit,
  listNotes,
  listPatientVisits,
  listTherapists,
  listTodayVisits,
  reverseVisit,
  saveNote,
} from './visits.service.js'
import { createBulkVisits } from './visitsBulk.service.js'

export const visitsRouter = Router()

visitsRouter.get('/visits/today', requirePermission('patient.view'), async (req, res) => {
  const { branchId } = parseInput(todayQuery, req.query)
  res.json(await listTodayVisits(tenantDbFor(req), requireAuthContext(req), branchId))
})

visitsRouter.post('/visits', requirePermission('visit.mark'), async (req, res) => {
  const body = parseInput(createVisitBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  const outcome = await idempotent(req, async () => ({
    status: 201,
    body: await createVisit(db, auth, body, req.ip),
  }))
  if (outcome.replayed) res.setHeader('Idempotent-Replay', 'true')
  res.status(outcome.status).json(outcome.body)
})

visitsRouter.post('/visits/bulk', requirePermission('visit.mark', 'visit.bulk'), async (req, res) => {
  const body = parseInput(bulkVisitsBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  const outcome = await idempotent(req, async () => ({
    status: 201,
    body: await createBulkVisits(db, auth, body, req.ip),
  }))
  if (outcome.replayed) res.setHeader('Idempotent-Replay', 'true')
  res.status(outcome.status).json(outcome.body)
})

visitsRouter.get('/visits/:id', requirePermission('patient.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await getVisit(tenantDbFor(req), id))
})

visitsRouter.post('/visits/:id/reverse', requirePermission('entry.reverse'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(reverseBody, req.body ?? {})
  const db = tenantDbFor(req)
  const auth = requireAuthContext(req)
  const outcome = await idempotent(req, async () => ({
    status: 201,
    body: await reverseVisit(db, auth, id, body.reason, req.ip),
  }))
  if (outcome.replayed) res.setHeader('Idempotent-Replay', 'true')
  res.status(outcome.status).json(outcome.body)
})

visitsRouter.get('/visits/:id/notes', requirePermission('clinical.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listNotes(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

visitsRouter.post('/visits/:id/notes', requirePermission('clinical.edit'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const body = parseInput(noteBody, req.body ?? {})
  const { created, note } = await saveNote(tenantDbFor(req), requireAuthContext(req), id, body.noteText, req.ip)
  res.status(created ? 201 : 200).json(note)
})

visitsRouter.get('/patients/:id/visits', requirePermission('patient.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await listPatientVisits(tenantDbFor(req), id))
})

visitsRouter.get('/branches/current/therapists', requirePermission('visit.mark'), async (req, res) => {
  res.json(await listTherapists(tenantDbFor(req), requireAuthContext(req)))
})
