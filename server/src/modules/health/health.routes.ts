import { Router } from 'express'
import { getLiveness, getReadiness, getVersion } from './health.service.js'

export const healthRouter = Router()

// Public endpoints, outside rate limiting and authentication (docs/API-Requirements.md section 5.11).
// They return no clinic or patient data.
healthRouter.get('/health', (_req, res) => {
  res.json(getLiveness())
})

// Readiness is an addition to the API doc: 503 when a dependency (the database) is down.
healthRouter.get('/health/ready', async (_req, res) => {
  const readiness = await getReadiness()
  res.status(readiness.status === 'ok' ? 200 : 503).json(readiness)
})

healthRouter.get('/version', (_req, res) => {
  res.json(getVersion())
})
