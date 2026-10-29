import { Router } from 'express'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { parseInput } from '../../lib/errors.js'
import { requirePermission } from '../../middleware/authorize.js'
import { confirmQuery, createBody, idParams, searchQuery, updateBody } from './patients.schemas.js'
import { createPatient, searchPatients, updatePatient, viewPatient } from './patients.service.js'

export const patientsRouter = Router()

// Search terms can be patient names or phone numbers; the request log keeps only the path, never the query (NFR-010).
patientsRouter.get('/patients', requirePermission('patient.view'), async (req, res) => {
  res.json(await searchPatients(tenantDbFor(req), requireAuthContext(req), parseInput(searchQuery, req.query)))
})

patientsRouter.post('/patients', requirePermission('patient.register'), async (req, res) => {
  const body = parseInput(createBody, req.body)
  const { confirmDuplicate } = parseInput(confirmQuery, req.query)
  const patient = await createPatient(
    tenantDbFor(req),
    requireAuthContext(req),
    body,
    { confirmDuplicate: confirmDuplicate === 'true' },
    req.ip,
  )
  res.status(201).json(patient)
})

patientsRouter.get('/patients/:id', requirePermission('patient.view'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  res.json(await viewPatient(tenantDbFor(req), requireAuthContext(req), id, req.ip))
})

patientsRouter.patch('/patients/:id', requirePermission('patient.edit'), async (req, res) => {
  const { id } = parseInput(idParams, req.params)
  const input = parseInput(updateBody, req.body)
  const { confirmDuplicate } = parseInput(confirmQuery, req.query)
  res.json(
    await updatePatient(
      tenantDbFor(req),
      requireAuthContext(req),
      id,
      input,
      { confirmDuplicate: confirmDuplicate === 'true' },
      req.ip,
    ),
  )
})
