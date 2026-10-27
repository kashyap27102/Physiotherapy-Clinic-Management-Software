import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLE_TEMPLATES } from '../src/auth/roleTemplates.js'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender, type EmailMessage } from '../src/lib/email/index.js'

/**
 * Clinic self-registration (TEN-001 revised) and the first-branch setup step (TEN-002), end to end against
 * TEST_DATABASE_URL. Skipped without it. Everything the run creates is removed afterwards (test data only, REG-2).
 */
const url = process.env['TEST_DATABASE_URL']

vi.mock('../src/db/prisma.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/db/prisma.js')>()
  const testUrl = process.env['TEST_DATABASE_URL']
  if (!testUrl) return actual
  const { PrismaPg: Adapter } = await import('@prisma/adapter-pg')
  const { PrismaClient: Client } = await import('../src/generated/prisma/client.js')
  const client = new Client({ adapter: new Adapter({ connectionString: testUrl }) })
  return { ...actual, getPrisma: () => client }
})

vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 })

const API = '/api/v1'
const PASSWORD = 'Quiet-River-Bends-31'

describe.skipIf(!url)('clinic self-registration', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = (name: string) => `${name}-${run}@example.test`
  const clinic = (name: string) => `Reg ${name} ${run}`
  let inbox: EmailMessage[]

  const codeFor = (to: string) => {
    const message = [...inbox].reverse().find((m) => m.to === to)
    if (!message) throw new Error(`no email to ${to}`)
    return /(\d{6})/.exec(message.text)?.[1] ?? ''
  }

  const form = (name: string, extra: object = {}) => ({
    clinicName: clinic(name),
    fullName: `Owner ${name}`,
    email: mail(name),
    phone: '+91 98765 43210',
    password: PASSWORD,
    acceptTerms: true,
    ...extra,
  })

  beforeAll(() => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
  })

  beforeEach(() => {
    inbox = []
    setEmailSender({
      send(message) {
        inbox.push(message)
        return Promise.resolve()
      },
    })
  })

  afterAll(async () => {
    setEmailSender(undefined)
    const tenants = await root.tenant.findMany({ where: { name: { endsWith: ` ${run}` } }, select: { id: true } })
    const tenantIds = tenants.map((t) => t.id)
    await root.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.userAccount.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: tenantIds } } } })
    await root.role.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.branch.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.subscription.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    await root.pendingRegistration.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } })
    await root.$disconnect()
  })

  it('creates the clinic, trial, roles and owner after the emailed code, then requires a first branch', async () => {
    const agent = request.agent(app)
    const started = await agent.post(`${API}/auth/register`).send(form('happy'))
    expect(started.status).toBe(202)
    const { registrationId } = started.body as { registrationId: string }
    expect(await root.tenant.count({ where: { name: clinic('happy') } })).toBe(0) // nothing before the code

    const verified = await agent
      .post(`${API}/auth/register/verify`)
      .send({ registrationId, code: codeFor(mail('happy')), trustDevice: true })
    expect(verified.status).toBe(201)
    expect(verified.body).toMatchObject({
      email: mail('happy'),
      fullName: 'Owner happy',
      role: { key: 'owner' },
      tenant: { name: clinic('happy') },
      branch: null,
      needsSetup: true,
    })
    expect(verified.body.permissions).toEqual([...ROLE_TEMPLATES.owner.permissions].sort())
    const csrf = verified.body.csrfToken as string

    const tenant = await root.tenant.findFirstOrThrow({
      where: { name: clinic('happy') },
      include: { subscriptions: true, roles: { include: { _count: { select: { permissions: true } } } } },
    })
    expect(tenant.phone).toBe('9876543210')
    expect(tenant.subscriptions[0]).toMatchObject({ status: 'trial' })
    const trialDays = (tenant.subscriptions[0]!.trialEndsOn!.getTime() - Date.now()) / 86_400_000
    expect(trialDays).toBeGreaterThan(12.9)
    expect(trialDays).toBeLessThan(14.1)
    const counts = Object.fromEntries(tenant.roles.map((r) => [r.key, r._count.permissions]))
    expect(counts).toEqual({
      owner: ROLE_TEMPLATES.owner.permissions.length,
      receptionist: ROLE_TEMPLATES.receptionist.permissions.length,
      physiotherapist: ROLE_TEMPLATES.physiotherapist.permissions.length,
    })

    // The same code cannot create a second clinic.
    const again = await request(app)
      .post(`${API}/auth/register/verify`)
      .send({ registrationId, code: codeFor(mail('happy')) })
    expect(again.body.error.code).toBe('OTP_INVALID')

    // Setup step (TEN-002): first branch.
    const noToken = await agent.post(`${API}/branches`).send({ name: 'Main', code: 'main' })
    expect(noToken.status).toBe(403)
    const branch = await agent
      .post(`${API}/branches`)
      .set('X-CSRF-Token', csrf)
      .send({ name: 'Pune Main', code: 'pun', address: 'FC Road' })
    expect(branch.status).toBe(201)
    expect(branch.body).toMatchObject({ name: 'Pune Main', code: 'PUN', address: 'FC Road', phone: null })

    const duplicate = await agent.post(`${API}/branches`).set('X-CSRF-Token', csrf).send({ name: 'Other', code: 'PUN' })
    expect(duplicate.status).toBe(422)
    expect(duplicate.body.error.fields[0].field).toBe('code')

    const me = await agent.get(`${API}/auth/me`)
    expect(me.body.needsSetup).toBe(false)
    const list = await agent.get(`${API}/branches`)
    expect(list.body.branches).toHaveLength(1)

    const audit = await root.auditLog.findMany({ where: { tenantId: tenant.id } })
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['tenant.registered', 'branch.created', 'auth.login']),
    )
  })

  it('answers the same for an email that already has an account, and that id never verifies', async () => {
    const agent = request.agent(app)
    const first = await agent.post(`${API}/auth/register`).send(form('taken'))
    await agent.post(`${API}/auth/register/verify`).send({
      registrationId: first.body.registrationId,
      code: codeFor(mail('taken')),
    })
    inbox = []

    const second = await request(app)
      .post(`${API}/auth/register`)
      .send(form('taken', { clinicName: clinic('taken again'), email: mail('taken').toUpperCase() }))
    expect(second.status).toBe(202)
    expect(second.body.registrationId).toMatch(/^[0-9a-f-]{36}$/)
    expect(inbox).toHaveLength(1)
    expect(inbox[0]!.subject).toMatch(/already have an account/)
    expect(inbox[0]!.text).not.toMatch(/\b\d{6}\b/)

    const resend = await request(app)
      .post(`${API}/auth/register/resend`)
      .send({ registrationId: second.body.registrationId })
    expect(resend.status).toBe(200)
    const verify = await request(app)
      .post(`${API}/auth/register/verify`)
      .send({ registrationId: second.body.registrationId, code: '123456' })
    expect(verify.body.error.code).toBe('OTP_INVALID')
    expect(await root.tenant.count({ where: { name: clinic('taken again') } })).toBe(0)
  })

  it('validates the form: weak password, bad mobile, terms not accepted', async () => {
    const res = await request(app)
      .post(`${API}/auth/register`)
      .send(form('invalid', { phone: '12345', acceptTerms: false }))
    expect(res.status).toBe(422)
    expect(res.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual(['acceptTerms', 'phone'])

    const weak = await request(app)
      .post(`${API}/auth/register`)
      .send(form('invalid', { password: 'password123' }))
    expect(weak.status).toBe(422)
    expect(weak.body.error.fields[0].field).toBe('password')
    expect(inbox).toHaveLength(0)
  })

  it('limits wrong codes and spaces out resends', async () => {
    const started = await request(app).post(`${API}/auth/register`).send(form('limits'))
    const { registrationId } = started.body as { registrationId: string }
    const code = codeFor(mail('limits'))
    const wrong = code === '000000' ? '111111' : '000000'

    const soon = await request(app).post(`${API}/auth/register/resend`).send({ registrationId })
    expect(soon.status).toBe(429)

    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post(`${API}/auth/register/verify`).send({ registrationId, code: wrong })
      expect(res.body.error.code).toBe('OTP_INVALID')
    }
    const locked = await request(app).post(`${API}/auth/register/verify`).send({ registrationId, code })
    expect(locked.body.error.message).toMatch(/new code/)

    // A resend after the wait gives a fresh code and fresh attempts.
    await root.pendingRegistration.update({
      where: { id: registrationId },
      data: { lastSentAt: new Date(Date.now() - 60_000) },
    })
    const resent = await request(app).post(`${API}/auth/register/resend`).send({ registrationId })
    expect(resent.status).toBe(200)
    const ok = await request(app)
      .post(`${API}/auth/register/verify`)
      .send({ registrationId, code: codeFor(mail('limits')) })
    expect(ok.status).toBe(201)
  })
})
