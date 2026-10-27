import express, { Router } from 'express'
import { z } from 'zod'
import { requireAuthContext, tenantDbFor } from '../../auth/context.js'
import { badRequest, parseInput } from '../../lib/errors.js'
import { requirePermission, requireSignedIn } from '../../middleware/authorize.js'
import { getClinic, LOGO_MAX_BYTES, readLogo, removeLogo, saveLogo, updateClinic } from './clinic.service.js'

/** Optional text: empty becomes null so a field can be cleared. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()

const profileBody = z
  .object({
    name: z.string().trim().min(2, 'Enter the clinic name.').max(120),
    phone: optionalText(20),
    address: optionalText(300),
    registrationDetails: optionalText(500),
    inactiveAfterDays: z.number().int().min(1, 'Use at least 1 day.').max(3650),
  })
  .partial()

export const clinicRouter = Router()

clinicRouter.get('/clinic', requireSignedIn, async (req, res) => {
  res.json(await getClinic(tenantDbFor(req)))
})

clinicRouter.patch('/clinic', requirePermission('clinic.manage'), async (req, res) => {
  const changes = parseInput(profileBody, req.body)
  res.json(await updateClinic(tenantDbFor(req), requireAuthContext(req), changes, req.ip))
})

// The logo is sent as the raw image bytes (Content-Type image/*), not JSON, so it needs its own body parser.
const rawImage = express.raw({ type: ['image/*'], limit: LOGO_MAX_BYTES + 1 })

clinicRouter.post('/clinic/logo', requirePermission('clinic.manage'), rawImage, async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw badRequest('Send the logo as an image file.')
  res.json(await saveLogo(tenantDbFor(req), requireAuthContext(req), req.body, req.ip))
})

clinicRouter.delete('/clinic/logo', requirePermission('clinic.manage'), async (req, res) => {
  res.json(await removeLogo(tenantDbFor(req), requireAuthContext(req), req.ip))
})

clinicRouter.get('/clinic/logo', requireSignedIn, async (req, res) => {
  const logo = await readLogo(tenantDbFor(req))
  res.set({
    'Content-Type': logo.contentType,
    // Private (the logo belongs to one clinic) but cacheable; the client adds ?v=<logoVersion> to bust it.
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
  })
  res.send(logo.data)
})
