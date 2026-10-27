import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from '../src/app.js'
import { csrfProtection } from '../src/middleware/session.js'
import { errorHandler } from '../src/middleware/errorHandler.js'
import { createAuthRouter, defaultAuthLimits } from '../src/modules/auth/auth.routes.js'
import { describeDevice } from '../src/modules/auth/deviceLabel.js'
import { hashPassword, passwordProblem, verifyPassword } from '../src/modules/auth/password.js'
import { hashOtp, hashToken, newOtpCode, newToken, safeEqual } from '../src/modules/auth/tokens.js'

/** Ordinary tests: no database. The full sign-in flow is in auth.db.test.ts. */

describe('password hashing (PRD SEC-002)', () => {
  it('stores an Argon2id string and verifies only the right password', async () => {
    const stored = await hashPassword('correct horse battery')
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/)
    expect(stored).not.toContain('correct horse')
    expect(await verifyPassword('correct horse battery', stored)).toBe(true)
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false)
  })

  it('salts every hash and rejects malformed stored values', async () => {
    expect(await hashPassword('same password here')).not.toBe(await hashPassword('same password here'))
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false)
    expect(await verifyPassword('x', '$bcrypt$v=1$m=1,t=1,p=1$a$b')).toBe(false)
  })
})

describe('password policy (AUTH-001 validation)', () => {
  it('requires 10 characters', () => {
    expect(passwordProblem('Short1!')).toMatch(/at least 10/)
    expect(passwordProblem('long-enough-1')).toBeNull()
  })

  it('refuses common, repetitive and email-like passwords', () => {
    expect(passwordProblem('Password123')).toMatch(/too common/)
    expect(passwordProblem('aaaaaaaaaaaa')).toMatch(/repetitive/)
    expect(passwordProblem('Me@Example.com', 'me@example.com')).toMatch(/email/)
  })
})

describe('tokens and codes', () => {
  it('makes unique url-safe tokens and hashes them one way', () => {
    const a = newToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newToken()).not.toBe(a)
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/)
    expect(hashToken(a)).not.toContain(a)
  })

  it('makes six-digit codes with leading zeros kept, bound to their challenge', () => {
    for (let i = 0; i < 200; i += 1) expect(newOtpCode()).toMatch(/^\d{6}$/)
    expect(hashOtp('challenge-1', '123456')).not.toBe(hashOtp('challenge-2', '123456'))
    expect(safeEqual(hashOtp('c', '000001'), hashOtp('c', '000001'))).toBe(true)
    expect(safeEqual(hashOtp('c', '000001'), hashOtp('c', '000002'))).toBe(false)
  })
})

describe('device labels (US-03.1)', () => {
  it('names the browser and system', () => {
    expect(
      describeDevice('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'),
    ).toBe('Chrome on Windows')
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Safari/604.1')).toBe(
      'Safari on iOS',
    )
    expect(describeDevice(undefined)).toBe('Unknown device')
  })
})

describe('anonymous access to auth routes', () => {
  const app = createApp()

  it('refuses /auth/me, logout, devices and password change without a session', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/auth/me'],
      ['post', '/api/v1/auth/logout'],
      ['get', '/api/v1/auth/devices'],
      ['delete', '/api/v1/auth/devices/6f9619ff-8b86-d011-b42d-00c04fc964ff'],
      ['post', '/api/v1/auth/password/change'],
      ['get', '/api/v1/users/6f9619ff-8b86-d011-b42d-00c04fc964ff/devices'],
    ] as const) {
      const res = await request(app)[method](path)
      expect(res.status, `${method} ${path}`).toBe(401)
      expect(res.body.error.code).toBe('UNAUTHENTICATED')
    }
  })

  it('validates login input before touching the database', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email', password: '' })
    expect(res.status).toBe(422)
    expect(res.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual(['email', 'password'])
  })

  it('validates OTP and reset input', async () => {
    const otp = await request(app).post('/api/v1/auth/otp/verify').send({ challengeId: 'nope', code: '12' })
    expect(otp.status).toBe(422)
    const reset = await request(app).post('/api/v1/auth/password/reset').send({ token: 'short', newPassword: 'x' })
    expect(reset.status).toBe(422)
  })
})

describe('CSRF protection (PRD SEC-005)', () => {
  function appWithSession(csrfToken: string | undefined) {
    const app = express()
    app.use((req, _res, next) => {
      if (csrfToken) req.authSession = { id: 's1', csrfToken }
      next()
    })
    app.use(csrfProtection)
    app.get('/read', (_req, res) => void res.json({ ok: true }))
    app.post('/write', (_req, res) => void res.json({ ok: true }))
    app.use(errorHandler)
    return app
  }

  it('lets reads through and requires the token on signed-in writes', async () => {
    const app = appWithSession('token-token-token')
    expect((await request(app).get('/read')).status).toBe(200)
    expect((await request(app).post('/write')).status).toBe(403)
    expect((await request(app).post('/write').set('X-CSRF-Token', 'wrong-token-token-')).status).toBe(403)
    expect((await request(app).post('/write').set('X-CSRF-Token', 'token-token-token')).status).toBe(200)
  })

  it('refuses writes from a foreign origin even when anonymous', async () => {
    const app = appWithSession(undefined)
    expect((await request(app).post('/write').set('Origin', 'https://evil.example')).status).toBe(403)
    expect((await request(app).post('/write').set('Origin', 'http://localhost:5173')).status).toBe(200)
    expect((await request(app).post('/write')).status).toBe(200)
  })
})

describe('rate limits on auth endpoints (PRD SEC-004)', () => {
  it('answers 429 RATE_LIMITED once the per-IP limit is passed', async () => {
    const app = express()
    app.use(express.json())
    app.use(createAuthRouter({ ...defaultAuthLimits, login: 3, forgot: 2, otpResend: 2 }))
    app.use(errorHandler)

    const statuses: number[] = []
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await request(app).post('/auth/login').send({ email: 'x', password: '' })).status)
    }
    expect(statuses).toEqual([422, 422, 422, 429, 429])
    const limited = await request(app).post('/auth/login').send({})
    expect(limited.body.error.code).toBe('RATE_LIMITED')

    const forgot = []
    for (let i = 0; i < 3; i += 1) forgot.push((await request(app).post('/auth/password/forgot').send({})).status)
    expect(forgot).toEqual([422, 422, 429])
  })
})
