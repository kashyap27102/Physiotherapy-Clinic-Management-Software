import express, { type RequestHandler } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { AuthContext } from '../src/auth/context.js'
import { PERMISSION_KEYS, isPermissionKey, type PermissionKey } from '../src/auth/permissionKeys.js'
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js'
import { requirePermission, requireSignedIn } from '../src/middleware/authorize.js'

/** Stands in for the session middleware: the test chooses who is "signed in" through a header. */
const fakeSession: RequestHandler = (req, _res, next) => {
  const raw = req.header('x-test-permissions')
  if (raw !== undefined) {
    const auth: AuthContext = {
      userId: '00000000-0000-4000-8000-000000000001',
      tenantId: '00000000-0000-4000-8000-0000000000aa',
      branchId: null,
      isSuperAdmin: false,
      permissions: new Set(raw.split(',').filter(isPermissionKey)),
    }
    req.auth = auth
  }
  next()
}

function buildApp() {
  const app = express()
  app.use(fakeSession)
  app.get('/any', requireSignedIn, (_req, res) => void res.json({ ok: true }))
  app.get('/payments', requirePermission('payment.record'), (_req, res) => void res.json({ ok: true }))
  app.get('/both', requirePermission('payment.record', 'ledger.view'), (_req, res) => void res.json({ ok: true }))
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}

const app = buildApp()
const as = (permissions: PermissionKey[]) => ['x-test-permissions', permissions.join(',')] as const

describe('requirePermission', () => {
  it('answers 401 when nobody is signed in', async () => {
    const res = await request(app).get('/payments')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHENTICATED')
    expect(res.body.error.requestId).toBeDefined()
  })

  it('answers 403 PERMISSION_DENIED when the key is missing', async () => {
    const res = await request(app)
      .get('/payments')
      .set(...as(['patient.view']))
    expect(res.status).toBe(403)
    expect(res.body.error.code).toBe('PERMISSION_DENIED')
  })

  it('lets a user with the key through', async () => {
    const res = await request(app)
      .get('/payments')
      .set(...as(['payment.record']))
    expect(res.status).toBe(200)
  })

  it('requires every listed key', async () => {
    const one = await request(app)
      .get('/both')
      .set(...as(['payment.record']))
    expect(one.status).toBe(403)
    const both = await request(app)
      .get('/both')
      .set(...as(['payment.record', 'ledger.view']))
    expect(both.status).toBe(200)
  })

  it('denies a user with an empty permission set', async () => {
    const res = await request(app).get('/payments').set('x-test-permissions', '')
    expect(res.status).toBe(403)
  })

  it('ignores unknown keys supplied by a caller', async () => {
    const res = await request(app).get('/payments').set('x-test-permissions', 'payment.record.all,*')
    expect(res.status).toBe(403)
  })

  it('refuses to guard a route with no permission at all', () => {
    expect(() => requirePermission()).toThrow(/at least one/)
  })
})

describe('requireSignedIn', () => {
  it('answers 401 without a session and 200 with one', async () => {
    expect((await request(app).get('/any')).status).toBe(401)
    expect((await request(app).get('/any').set('x-test-permissions', '')).status).toBe(200)
  })
})

describe('permission catalogue', () => {
  it('has no duplicates', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length)
  })
})
