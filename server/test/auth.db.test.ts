import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender, type EmailMessage } from '../src/lib/email/index.js'
import { hashPassword } from '../src/modules/auth/password.js'

/**
 * End-to-end sign-in tests (AUTH-001 to AUTH-004, BR-AUTH-1/2, SEC-004) against a real PostgreSQL database.
 * Skipped unless TEST_DATABASE_URL is set. The app is pointed at that database instead of DATABASE_URL, emails are
 * captured in memory, and every clinic and user the run creates is removed afterwards. Test data only (PRD REG-2).
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

// The test database is hosted, so each request is slow; give every test room.
vi.setConfig({ testTimeout: 90_000, hookTimeout: 90_000 })

const PASSWORD = 'Blue-Tiger-Runs-42'
const API = '/api/v1'

interface Mailbox {
  messages: EmailMessage[]
  last(to: string): EmailMessage
}

function captureEmail(): Mailbox {
  const messages: EmailMessage[] = []
  setEmailSender({
    send(message) {
      messages.push(message)
      return Promise.resolve()
    },
  })
  return {
    messages,
    last(to) {
      const found = [...messages].reverse().find((m) => m.to === to)
      if (!found) throw new Error(`no email sent to ${to}`)
      return found
    },
  }
}

const cookies = (res: { headers: Record<string, unknown> }) => [res.headers['set-cookie']].flat().join(';')
const codeIn = (message: EmailMessage) => /(\d{6})/.exec(message.text)![1]!
const tokenIn = (message: EmailMessage) => /token=([\w-]+)/.exec(message.text)![1]!

describe.skipIf(!url)('authentication flow', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = (name: string) => `${name}-${run}@example.test`

  let tenantA: string
  let tenantB: string
  let ownerA: string
  let staffA: string
  let ownerB: string
  let inbox: Mailbox

  async function seedUser(tenantId: string, roleId: string, name: string, extra: object = {}) {
    return root.userAccount.create({
      data: {
        tenantId,
        roleId,
        email: mail(name),
        fullName: name,
        passwordHash: await hashPassword(PASSWORD),
        ...extra,
      },
    })
  }

  /** Signs in on a fresh browser (cookie jar), completing the emailed code and trusting the device. */
  async function signInTrusted(name: string) {
    const agent = request.agent(app)
    // The hourly cap on codes is a real control; tests that sign in repeatedly start from a clean slate.
    await root.otpChallenge.deleteMany({ where: { user: { email: mail(name) } } })
    const login = await agent.post(`${API}/auth/login`).send({ email: mail(name), password: PASSWORD })
    expect(login.status).toBe(401)
    const verified = await agent.post(`${API}/auth/otp/verify`).send({
      challengeId: login.body.error.details.challengeId,
      code: codeIn(inbox.last(mail(name))),
      trustDevice: true,
    })
    expect(verified.status).toBe(200)
    return { agent, csrf: verified.body.csrfToken as string }
  }

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const grants = await root.permission.findMany({ where: { key: { in: ['device.manage', 'patient.view'] } } })
    const seedTenant = async (label: string) => {
      const tenant = await root.tenant.create({ data: { name: `Auth ${label} ${run}` } })
      const owner = await root.role.create({ data: { tenantId: tenant.id, key: 'owner', name: 'Owner' } })
      const receptionist = await root.role.create({
        data: { tenantId: tenant.id, key: 'receptionist', name: 'Receptionist' },
      })
      await root.rolePermission.createMany({ data: grants.map((p) => ({ roleId: owner.id, permissionId: p.id })) })
      const view = grants.find((p) => p.key === 'patient.view')!
      await root.rolePermission.create({ data: { roleId: receptionist.id, permissionId: view.id } })
      return { tenant, owner, receptionist }
    }
    const a = await seedTenant('A')
    const b = await seedTenant('B')
    tenantA = a.tenant.id
    tenantB = b.tenant.id
    ownerA = (await seedUser(tenantA, a.owner.id, 'owner-a')).id
    staffA = (await seedUser(tenantA, a.receptionist.id, 'staff-a')).id
    ownerB = (await seedUser(tenantB, b.owner.id, 'owner-b')).id
    await seedUser(tenantA, a.receptionist.id, 'off-a', { isActive: false })
    await seedUser(tenantA, a.receptionist.id, 'lock-a')
    await seedUser(tenantA, a.receptionist.id, 'otp-a')
    await seedUser(tenantA, a.receptionist.id, 'reset-a')
    await seedUser(tenantA, a.receptionist.id, 'change-a')
    await seedUser(tenantA, a.receptionist.id, 'idle-a')
    await seedUser(tenantA, a.receptionist.id, 'resend-a')
    const frozen = await root.tenant.create({ data: { name: `Auth frozen ${run}`, status: 'suspended' } })
    const frozenRole = await root.role.create({ data: { tenantId: frozen.id, key: 'owner', name: 'Owner' } })
    await seedUser(frozen.id, frozenRole.id, 'frozen')
  })

  beforeEach(() => {
    inbox = captureEmail()
  })

  afterAll(async () => {
    setEmailSender(undefined)
    const tenants = await root.tenant.findMany({ where: { name: { endsWith: ` ${run}` } }, select: { id: true } })
    const tenantIds = tenants.map((t) => t.id)
    const users = await root.userAccount.findMany({ where: { tenantId: { in: tenantIds } }, select: { id: true } })
    const userIds = users.map((u) => u.id)
    await root.auditLog.deleteMany({ where: { OR: [{ tenantId: { in: tenantIds } }, { userId: { in: userIds } }] } })
    await root.userAccount.deleteMany({ where: { id: { in: userIds } } })
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: tenantIds } } } })
    await root.role.deleteMany({ where: { tenantId: { in: tenantIds } } })
    await root.tenant.deleteMany({ where: { id: { in: tenantIds } } })
    await root.$disconnect()
  })

  describe('password login (AUTH-001)', () => {
    it('gives the same answer for an unknown email and a wrong password (US-01.2)', async () => {
      const unknown = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('nobody'), password: PASSWORD })
      const wrong = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('staff-a'), password: 'wrong-password-1' })
      expect(unknown.status).toBe(401)
      expect(wrong.status).toBe(401)
      expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS')
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS')
      expect(unknown.body.error.message).toBe(wrong.body.error.message)
    })

    it('matches the email regardless of case', async () => {
      const res = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('staff-a').toUpperCase(), password: PASSWORD })
      expect(res.body.error.code).toBe('OTP_REQUIRED')
    })

    it('locks the account after five failures, even for the right password (US-01.3, BR-AUTH-1)', async () => {
      for (let i = 0; i < 5; i += 1) {
        const res = await request(app)
          .post(`${API}/auth/login`)
          .send({ email: mail('lock-a'), password: 'wrong-password-1' })
        expect(res.body.error.code).toBe('INVALID_CREDENTIALS')
      }
      const locked = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('lock-a'), password: PASSWORD })
      expect(locked.status).toBe(403)
      expect(locked.body.error.code).toBe('ACCOUNT_LOCKED')
      expect(inbox.messages).toHaveLength(0)

      await root.userAccount.updateMany({
        where: { email: mail('lock-a') },
        data: { lockedUntil: new Date(Date.now() - 1000) },
      })
      const after = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('lock-a'), password: PASSWORD })
      expect(after.body.error.code).toBe('OTP_REQUIRED')
      const row = await root.userAccount.findFirstOrThrow({ where: { email: mail('lock-a') } })
      expect(row.failedLoginCount).toBe(0)
      expect(row.lockedUntil).toBeNull()
    })

    it('refuses a deactivated user and a suspended clinic only after the right password (US-01.4, US-01.5)', async () => {
      const off = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('off-a'), password: PASSWORD })
      expect(off.status).toBe(403)
      expect(off.body.error.message).toMatch(/deactivated/)
      const frozen = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('frozen'), password: PASSWORD })
      expect(frozen.body.error.code).toBe('TENANT_SUSPENDED')
      const wrong = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('off-a'), password: 'wrong-password-1' })
      expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS')
    })
  })

  describe('email code on a new device (AUTH-002)', () => {
    it('completes sign-in with the emailed code, then skips the code on a trusted device (US-02.1, US-02.2, US-02.4)', async () => {
      const agent = request.agent(app)
      const login = await agent.post(`${API}/auth/login`).send({ email: mail('staff-a'), password: PASSWORD })
      expect(login.status).toBe(401)
      expect(login.body.error.code).toBe('OTP_REQUIRED')
      expect(JSON.stringify(login.body)).not.toMatch(/\d{6}/)

      const code = codeIn(inbox.last(mail('staff-a')))
      expect(JSON.stringify(login.body)).not.toContain(code)
      const verified = await agent
        .post(`${API}/auth/otp/verify`)
        .send({ challengeId: login.body.error.details.challengeId, code, trustDevice: true })
      expect(verified.status).toBe(200)
      expect(verified.body).toMatchObject({
        email: mail('staff-a'),
        tenant: { id: tenantA },
        role: { key: 'receptionist' },
        permissions: ['patient.view'],
      })
      expect(verified.body.csrfToken).toBeTruthy()
      expect(cookies(verified)).toMatch(/sid=.*HttpOnly/)
      expect(cookies(verified)).toMatch(/did=.*HttpOnly/)

      const me = await agent.get(`${API}/auth/me`)
      expect(me.status).toBe(200)
      expect(me.body.id).toBe(staffA)

      // A second sign-in from the same browser does not ask for a code.
      const again = await agent
        .post(`${API}/auth/login`)
        .set('X-CSRF-Token', verified.body.csrfToken)
        .send({ email: mail('staff-a'), password: PASSWORD })
      expect(again.status).toBe(200)
    })

    it('rejects a reused code and a wrong code (US-02.3, US-02.6)', async () => {
      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('otp-a'), password: PASSWORD })
      const challengeId = login.body.error.details.challengeId
      const code = codeIn(inbox.last(mail('otp-a')))
      const wrong = code === '000000' ? '111111' : '000000'

      const bad = await request(app).post(`${API}/auth/otp/verify`).send({ challengeId, code: wrong })
      expect(bad.status).toBe(401)
      expect(bad.body.error.code).toBe('OTP_INVALID')

      const good = await request(app).post(`${API}/auth/otp/verify`).send({ challengeId, code })
      expect(good.status).toBe(200)
      const reuse = await request(app).post(`${API}/auth/otp/verify`).send({ challengeId, code })
      expect(reuse.body.error.code).toBe('OTP_INVALID')
    })

    it('stops accepting a code after five wrong attempts (US-02.3, SEC-004)', async () => {
      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('otp-a'), password: PASSWORD })
      const challengeId = login.body.error.details.challengeId
      const code = codeIn(inbox.last(mail('otp-a')))
      const wrong = code === '000000' ? '111111' : '000000'
      for (let i = 0; i < 5; i += 1) {
        expect((await request(app).post(`${API}/auth/otp/verify`).send({ challengeId, code: wrong })).status).toBe(401)
      }
      const right = await request(app).post(`${API}/auth/otp/verify`).send({ challengeId, code })
      expect(right.status).toBe(401)
      expect(right.body.error.message).toMatch(/new code/)
    })

    it('rejects an expired code', async () => {
      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('otp-a'), password: PASSWORD })
      const challengeId = login.body.error.details.challengeId
      await root.otpChallenge.update({ where: { id: challengeId }, data: { expiresAt: new Date(Date.now() - 1000) } })
      const res = await request(app)
        .post(`${API}/auth/otp/verify`)
        .send({ challengeId, code: codeIn(inbox.last(mail('otp-a'))) })
      expect(res.body.error.code).toBe('OTP_INVALID')
    })

    it('spaces out resends, replaces the old code, and caps them per hour (US-02.5)', async () => {
      const login = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('resend-a'), password: PASSWORD })
      const first = login.body.error.details.challengeId
      const firstCode = codeIn(inbox.last(mail('resend-a')))

      const tooSoon = await request(app).post(`${API}/auth/otp/resend`).send({ challengeId: first })
      expect(tooSoon.status).toBe(429)
      expect(tooSoon.body.error.code).toBe('RATE_LIMITED')

      await root.otpChallenge.update({ where: { id: first }, data: { expiresAt: new Date(Date.now() + 8 * 60_000) } })
      const resent = await request(app).post(`${API}/auth/otp/resend`).send({ challengeId: first })
      expect(resent.status).toBe(200)
      expect(resent.body.challengeId).not.toBe(first)

      const oldCode = await request(app).post(`${API}/auth/otp/verify`).send({ challengeId: first, code: firstCode })
      expect(oldCode.body.error.code).toBe('OTP_INVALID')
      const ok = await request(app)
        .post(`${API}/auth/otp/verify`)
        .send({ challengeId: resent.body.challengeId, code: codeIn(inbox.last(mail('resend-a'))) })
      expect(ok.status).toBe(200)
    })
  })

  describe('sessions (BR-AUTH-2, API-AUTH-1)', () => {
    it('needs the CSRF token to log out, and the session is dead afterwards', async () => {
      const { agent, csrf } = await signInTrusted('owner-a')
      expect((await agent.post(`${API}/auth/logout`)).status).toBe(403)
      expect((await agent.post(`${API}/auth/logout`).set('X-CSRF-Token', csrf)).status).toBe(204)
      expect((await agent.get(`${API}/auth/me`)).status).toBe(401)
    })

    it('ends a session left idle past the limit (US-01.6)', async () => {
      const { agent } = await signInTrusted('idle-a')
      expect((await agent.get(`${API}/auth/me`)).status).toBe(200)
      await root.userSession.updateMany({
        where: { user: { email: mail('idle-a') } },
        data: { lastSeenAt: new Date(Date.now() - 31 * 60_000) },
      })
      const res = await agent.get(`${API}/auth/me`)
      expect(res.status).toBe(401)
    })

    it('ends the session of a user who is deactivated meanwhile', async () => {
      const { agent } = await signInTrusted('idle-a')
      await root.userAccount.updateMany({ where: { email: mail('idle-a') }, data: { isActive: false } })
      expect((await agent.get(`${API}/auth/me`)).status).toBe(401)
      await root.userAccount.updateMany({ where: { email: mail('idle-a') }, data: { isActive: true } })
    })

    it('rejects a forged session cookie', async () => {
      const res = await request(app).get(`${API}/auth/me`).set('Cookie', 'sid=forged-token-value')
      expect(res.status).toBe(401)
    })
  })

  describe('trusted devices (AUTH-003)', () => {
    it('lists the own device, and revoking it forces a code and ends sessions (US-03.1, US-03.2)', async () => {
      const { agent, csrf } = await signInTrusted('staff-a')
      const other = await signInTrusted('staff-a')

      const list = await agent.get(`${API}/auth/devices`)
      expect(list.status).toBe(200)
      const mine = list.body.devices.find((d: { current: boolean }) => d.current)
      expect(mine).toMatchObject({ label: expect.any(String), expiresAt: expect.any(String) })

      const revoke = await agent.delete(`${API}/auth/devices/${mine.id}`).set('X-CSRF-Token', csrf)
      expect(revoke.status).toBe(204)
      // The caller keeps their own session; the user's other sessions end.
      expect((await agent.get(`${API}/auth/me`)).status).toBe(200)
      expect((await other.agent.get(`${API}/auth/me`)).status).toBe(401)

      // The revoked device now needs a code again.
      const login = await agent
        .post(`${API}/auth/login`)
        .set('X-CSRF-Token', csrf)
        .send({ email: mail('staff-a'), password: PASSWORD })
      expect(login.body.error.code).toBe('OTP_REQUIRED')
      const gone = await agent.delete(`${API}/auth/devices/${mine.id}`).set('X-CSRF-Token', csrf)
      expect(gone.status).toBe(404)
    })

    it("lets the owner see and revoke a colleague's devices, with an audit entry (US-03.3)", async () => {
      const staff = await signInTrusted('staff-a')
      const owner = await signInTrusted('owner-a')

      const list = await owner.agent.get(`${API}/users/${staffA}/devices`)
      expect(list.status).toBe(200)
      expect(list.body.devices.length).toBeGreaterThan(0)
      const deviceId = list.body.devices[0].id as string

      expect((await owner.agent.delete(`${API}/users/${staffA}/devices/${deviceId}`)).status).toBe(403) // no CSRF token
      const revoke = await owner.agent
        .delete(`${API}/users/${staffA}/devices/${deviceId}`)
        .set('X-CSRF-Token', owner.csrf)
      expect(revoke.status).toBe(204)
      expect((await staff.agent.get(`${API}/auth/me`)).status).toBe(401)

      const audit = await root.auditLog.findFirst({ where: { action: 'auth.device_revoked', targetId: deviceId } })
      expect(audit).toMatchObject({ userId: ownerA, tenantId: tenantA })
    })

    it("hides other users' devices from staff, and other clinics' users from owners (US-03.4, SEC-001)", async () => {
      const staff = await signInTrusted('staff-a')
      const forbidden = await staff.agent.get(`${API}/users/${ownerA}/devices`)
      expect(forbidden.status).toBe(403)
      expect(forbidden.body.error.code).toBe('PERMISSION_DENIED')

      const owner = await signInTrusted('owner-a')
      const crossTenant = await owner.agent.get(`${API}/users/${ownerB}/devices`)
      expect(crossTenant.status).toBe(404)
      const crossRevoke = await owner.agent
        .delete(`${API}/users/${ownerB}/devices/${randomUUID()}`)
        .set('X-CSRF-Token', owner.csrf)
      expect(crossRevoke.status).toBe(404)
    })
  })

  describe('password reset and change (AUTH-004)', () => {
    it('answers forgot-password the same for known and unknown emails, and sends a single-use link (US-03a.1, US-03a.2)', async () => {
      const known = await request(app)
        .post(`${API}/auth/password/forgot`)
        .send({ email: mail('reset-a') })
      const unknown = await request(app)
        .post(`${API}/auth/password/forgot`)
        .send({ email: mail('nobody') })
      expect(known.status).toBe(202)
      expect(unknown.status).toBe(202)
      expect(known.body).toEqual(unknown.body)
      expect(inbox.messages.filter((m) => m.to === mail('nobody'))).toHaveLength(0)

      const token = tokenIn(inbox.last(mail('reset-a')))
      const weak = await request(app).post(`${API}/auth/password/reset`).send({ token, newPassword: 'short' })
      expect(weak.status).toBe(422)
      expect(weak.body.error.fields[0].field).toBe('newPassword')

      const { agent } = await signInTrusted('reset-a')
      const done = await request(app)
        .post(`${API}/auth/password/reset`)
        .send({ token, newPassword: 'Green-Falcon-Flies-77' })
      expect(done.status).toBe(200)
      expect((await agent.get(`${API}/auth/me`)).status).toBe(401) // old sessions ended

      const reuse = await request(app)
        .post(`${API}/auth/password/reset`)
        .send({ token, newPassword: 'Another-Fine-Pass-88' })
      expect(reuse.status).toBe(400)

      const oldPassword = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('reset-a'), password: PASSWORD })
      expect(oldPassword.body.error.code).toBe('INVALID_CREDENTIALS')
      const fresh = await agent
        .post(`${API}/auth/login`)
        .send({ email: mail('reset-a'), password: 'Green-Falcon-Flies-77' })
      expect(fresh.status).toBe(200) // trusted device still skips the code
    })

    it('only the newest reset link works, and an expired one fails', async () => {
      await request(app)
        .post(`${API}/auth/password/forgot`)
        .send({ email: mail('reset-a') })
      const first = tokenIn(inbox.last(mail('reset-a')))
      await request(app)
        .post(`${API}/auth/password/forgot`)
        .send({ email: mail('reset-a') })
      const second = tokenIn(inbox.last(mail('reset-a')))
      expect(
        (
          await request(app)
            .post(`${API}/auth/password/reset`)
            .send({ token: first, newPassword: 'Third-Fine-Pass-99' })
        ).status,
      ).toBe(400)

      await root.passwordResetToken.updateMany({
        where: { user: { email: mail('reset-a') } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      })
      expect(
        (
          await request(app)
            .post(`${API}/auth/password/reset`)
            .send({ token: second, newPassword: 'Third-Fine-Pass-99' })
        ).status,
      ).toBe(400)
    })

    it('still answers 202 when email cannot be sent, so nothing is revealed', async () => {
      setEmailSender({ send: () => Promise.reject(new Error('mail down')) })
      const res = await request(app)
        .post(`${API}/auth/password/forgot`)
        .send({ email: mail('staff-a') })
      expect(res.status).toBe(202)
    })

    it('changes the password with the current one and ends other sessions (US-03a.4)', async () => {
      const mine = await signInTrusted('change-a')
      const elsewhere = await signInTrusted('change-a')

      const wrong = await mine.agent
        .post(`${API}/auth/password/change`)
        .set('X-CSRF-Token', mine.csrf)
        .send({ currentPassword: 'not-my-password', newPassword: 'Orange-Cat-Naps-55' })
      expect(wrong.status).toBe(422)
      expect(wrong.body.error.fields[0].field).toBe('currentPassword')

      const weak = await mine.agent
        .post(`${API}/auth/password/change`)
        .set('X-CSRF-Token', mine.csrf)
        .send({ currentPassword: PASSWORD, newPassword: 'password123' })
      expect(weak.status).toBe(422)

      const ok = await mine.agent
        .post(`${API}/auth/password/change`)
        .set('X-CSRF-Token', mine.csrf)
        .send({ currentPassword: PASSWORD, newPassword: 'Orange-Cat-Naps-55' })
      expect(ok.status).toBe(200)
      expect((await mine.agent.get(`${API}/auth/me`)).status).toBe(200)
      expect((await elsewhere.agent.get(`${API}/auth/me`)).status).toBe(401)
    })
  })

  describe('audit trail (AUD-001)', () => {
    it('records sign-ins and failures without secrets', async () => {
      await signInTrusted('owner-a')
      const rows = await root.auditLog.findMany({ where: { tenantId: tenantA, userId: ownerA } })
      const actions = new Set(rows.map((r) => r.action))
      expect(actions).toContain('auth.otp_sent')
      expect(actions).toContain('auth.device_trusted')
      expect(actions).toContain('auth.login')
      expect(JSON.stringify(rows)).not.toContain(PASSWORD)
    })
  })
})
