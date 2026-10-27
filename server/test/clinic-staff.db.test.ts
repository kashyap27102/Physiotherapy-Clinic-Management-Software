import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender, type EmailMessage } from '../src/lib/email/index.js'

/**
 * Clinic profile, branches, staff and role permissions (TEN-001, TEN-002, USR-001, USR-002) end to end against
 * TEST_DATABASE_URL, with a second clinic to prove isolation (SEC-001). Skipped without it. Test data only.
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

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 })

const API = '/api/v1'
const PASSWORD = 'Quiet-River-Bends-31'
const STAFF_PASSWORD = 'Amber-Lantern-Glows-52'
/** A real 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

interface Session {
  agent: ReturnType<typeof request.agent>
  csrf: string
}

describe.skipIf(!url)('clinic profile, branches, staff and roles', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = (name: string) => `${name}-${run}@example.test`.toLowerCase()
  const clinic = (name: string) => `Staff ${name} ${run}`
  let inbox: EmailMessage[]

  let ownerA: Session
  let ownerB: Session
  let branchA: string
  let branchA2: string
  let branchB: string

  const lastMail = (to: string) => {
    const found = [...inbox].reverse().find((m) => m.to === to)
    if (!found) throw new Error(`no email to ${to}`)
    return found
  }
  const codeIn = (m: EmailMessage) => /(\d{6})/.exec(m.text)![1]!
  const tokenIn = (m: EmailMessage) => /token=([\w-]+)/.exec(m.text)![1]!
  const post = (s: Session, path: string, body?: object) =>
    s.agent
      .post(`${API}${path}`)
      .set('X-CSRF-Token', s.csrf)
      .send(body ?? {})
  const patch = (s: Session, path: string, body: object) =>
    s.agent.patch(`${API}${path}`).set('X-CSRF-Token', s.csrf).send(body)
  const put = (s: Session, path: string, body: object) =>
    s.agent.put(`${API}${path}`).set('X-CSRF-Token', s.csrf).send(body)

  /** Registers a clinic through the real flow and adds its first branch, as an owner would. */
  async function registerClinic(name: string): Promise<{ session: Session; branchId: string }> {
    const agent = request.agent(app)
    const started = await agent.post(`${API}/auth/register`).send({
      clinicName: clinic(name),
      fullName: `Owner ${name}`,
      email: mail(`owner-${name}`),
      phone: '9876543210',
      password: PASSWORD,
      acceptTerms: true,
    })
    const verified = await agent.post(`${API}/auth/register/verify`).send({
      registrationId: started.body.registrationId,
      code: codeIn(lastMail(mail(`owner-${name}`))),
    })
    const session = { agent, csrf: verified.body.csrfToken as string }
    const branch = await post(session, '/branches', { name: `${name} Main`, code: name === 'A' ? 'AAA' : 'BBB' })
    return { session, branchId: branch.body.id as string }
  }

  /** Signs in as an invited staff member on a fresh browser (password step, then the emailed code). */
  async function signIn(name: string, password = STAFF_PASSWORD): Promise<Session> {
    const agent = request.agent(app)
    const login = await agent.post(`${API}/auth/login`).send({ email: mail(name), password })
    expect(login.body.error.code).toBe('OTP_REQUIRED')
    const verified = await agent.post(`${API}/auth/otp/verify`).send({
      challengeId: login.body.error.details.challengeId,
      code: codeIn(lastMail(mail(name))),
    })
    expect(verified.status).toBe(200)
    return { agent, csrf: verified.body.csrfToken as string }
  }

  /** Invites staff and completes the invitation, so they can sign in. */
  async function addStaff(name: string, role: string, branchId: string, owner = ownerA) {
    const created = await post(owner, '/users', { fullName: `Staff ${name}`, email: mail(name), role, branchId })
    expect(created.status).toBe(201)
    const accepted = await request(app)
      .post(`${API}/auth/invitation/accept`)
      .send({ token: tokenIn(lastMail(mail(name))), newPassword: STAFF_PASSWORD })
    expect(accepted.status).toBe(200)
    return created.body.staff.id as string
  }

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    inbox = []
    setEmailSender({
      send(message) {
        inbox.push(message)
        return Promise.resolve()
      },
    })
    const a = await registerClinic('A')
    const b = await registerClinic('B')
    ownerA = a.session
    branchA = a.branchId
    ownerB = b.session
    branchB = b.branchId
    const second = await post(ownerA, '/branches', { name: 'A Second', code: 'AA2' })
    branchA2 = second.body.id as string
  })

  beforeEach(() => {
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
    const ids = tenants.map((t) => t.id)
    await root.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
    await root.userAccount.deleteMany({ where: { tenantId: { in: ids } } })
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: ids } } } })
    await root.role.deleteMany({ where: { tenantId: { in: ids } } })
    await root.branch.deleteMany({ where: { tenantId: { in: ids } } })
    await root.subscription.deleteMany({ where: { tenantId: { in: ids } } })
    await root.tenant.deleteMany({ where: { id: { in: ids } } }) // logo rows cascade
    await root.pendingRegistration.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } })
    await root.$disconnect()
  })

  describe('clinic profile (TEN-001)', () => {
    it('shows and updates the profile, clears a field, and audits before and after', async () => {
      const before = await ownerA.agent.get(`${API}/clinic`)
      expect(before.body).toMatchObject({
        name: clinic('A'),
        phone: '9876543210',
        logoVersion: null,
        inactiveAfterDays: 30,
      })

      const updated = await patch(ownerA, '/clinic', {
        name: `${clinic('A')}`,
        address: '12 FC Road, Pune',
        registrationDetails: 'Reg. no. MH/1234',
        phone: '',
        inactiveAfterDays: 45,
      })
      expect(updated.status).toBe(200)
      expect(updated.body).toMatchObject({
        address: '12 FC Road, Pune',
        registrationDetails: 'Reg. no. MH/1234',
        phone: null,
        inactiveAfterDays: 45,
      })

      const audit = await root.auditLog.findFirst({ where: { action: 'clinic.updated', targetId: updated.body.id } })
      expect(audit?.details).toMatchObject({
        before: { phone: '9876543210' },
        after: { phone: null, inactiveAfterDays: 45 },
      })

      expect((await patch(ownerA, '/clinic', { name: 'x' })).status).toBe(422)
      expect((await patch(ownerA, '/clinic', { inactiveAfterDays: 0 })).status).toBe(422)
    })

    it('never lets a request change another clinic or the clinic status', async () => {
      const res = await patch(ownerA, '/clinic', { status: 'suspended', id: randomUUID(), tenantId: randomUUID() })
      expect(res.status).toBe(200)
      const tenant = await root.tenant.findFirstOrThrow({ where: { name: clinic('A') } })
      expect(tenant.status).toBe('active')
      const b = await ownerB.agent.get(`${API}/clinic`)
      expect(b.body.name).toBe(clinic('B'))
    })

    it('accepts a real image logo, serves it back, and removes it (US-04a.2)', async () => {
      const up = await ownerA.agent
        .post(`${API}/clinic/logo`)
        .set('X-CSRF-Token', ownerA.csrf)
        .set('Content-Type', 'image/png')
        .send(PNG)
      expect(up.status).toBe(200)
      expect(up.body.logoVersion).toMatch(/^\d+$/)

      const got = await ownerA.agent
        .get(`${API}/clinic/logo`)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = []
          res.on('data', (c: Buffer) => chunks.push(c))
          res.on('end', () => cb(null, Buffer.concat(chunks)))
        })
      expect(got.status).toBe(200)
      expect(got.headers['content-type']).toBe('image/png')
      expect(Buffer.from(got.body as Buffer).equals(PNG)).toBe(true)

      // Clinic B has no logo and cannot see A's.
      expect((await ownerB.agent.get(`${API}/clinic/logo`)).status).toBe(404)

      const gone = await ownerA.agent.delete(`${API}/clinic/logo`).set('X-CSRF-Token', ownerA.csrf)
      expect(gone.body.logoVersion).toBeNull()
      expect((await ownerA.agent.get(`${API}/clinic/logo`)).status).toBe(404)
    })

    it('rejects non-images, wrong types and oversized logos with a reason', async () => {
      const send = (type: string, body: Buffer) =>
        ownerA.agent.post(`${API}/clinic/logo`).set('X-CSRF-Token', ownerA.csrf).set('Content-Type', type).send(body)
      const fake = await send('image/png', Buffer.from('this is not an image at all'))
      expect(fake.status).toBe(400)
      expect(fake.body.error.message).toMatch(/PNG, JPEG or WebP/)
      expect((await send('text/plain', PNG)).status).toBe(400)
      const big = await send('image/png', Buffer.concat([PNG, Buffer.alloc(210 * 1024)]))
      expect(big.status).toBe(413)
    })
  })

  describe('branches (TEN-002)', () => {
    it('edits a branch, refuses a duplicate code, and answers 404 for another clinic', async () => {
      const edited = await patch(ownerA, `/branches/${branchA2}`, {
        name: 'A Second Floor',
        code: 'aa3',
        phone: '020 1234 5678',
      })
      expect(edited.status).toBe(200)
      expect(edited.body).toMatchObject({
        name: 'A Second Floor',
        code: 'AA3',
        phone: '020 1234 5678',
        codeLocked: false,
      })

      const dup = await patch(ownerA, `/branches/${branchA2}`, { code: 'AAA' })
      expect(dup.status).toBe(422)
      expect(dup.body.error.fields[0].field).toBe('code')

      expect((await patch(ownerB, `/branches/${branchA2}`, { name: 'Hijack' })).status).toBe(404)
      expect((await post(ownerB, `/branches/${branchA}/deactivate`)).status).toBe(404)
      const list = await ownerB.agent.get(`${API}/branches`)
      expect(list.body.branches.map((b: { id: string }) => b.id)).toEqual([branchB])
    })

    it('refuses to deactivate a branch that still has staff, or the last active branch (US-05.5)', async () => {
      const staffId = await addStaff('branchy', 'receptionist', branchA2)
      const blocked = await post(ownerA, `/branches/${branchA2}/deactivate`)
      expect(blocked.status).toBe(409)
      expect(blocked.body.error.code).toBe('BRANCH_HAS_STAFF')
      expect(blocked.body.error.details.staffCount).toBe(1)

      await post(ownerA, `/users/${staffId}/deactivate`) // inactive staff do not block
      expect((await post(ownerA, `/branches/${branchA2}/deactivate`)).body.isActive).toBe(false)
      expect((await post(ownerA, `/branches/${branchA2}/reactivate`)).body.isActive).toBe(true)

      const last = await post(ownerB, `/branches/${branchB}/deactivate`)
      expect(last.status).toBe(409)
      expect(last.body.error.code).toBe('LAST_BRANCH')
    })
  })

  describe('staff (USR-001)', () => {
    it('invites staff with one branch, lets them set a password, and gives them the role defaults', async () => {
      const created = await post(ownerA, '/users', {
        fullName: 'Riya Desai',
        email: mail('riya').toUpperCase(),
        role: 'receptionist',
        branchId: branchA,
      })
      expect(created.status).toBe(201)
      expect(created.body.invitationSent).toBe(true)
      expect(created.body.staff).toMatchObject({
        fullName: 'Riya Desai',
        email: mail('riya'),
        role: { key: 'receptionist' },
        branch: { id: branchA },
        isActive: true,
        invited: true,
      })

      const invite = lastMail(mail('riya'))
      expect(invite.subject).toMatch(/invited to/)
      expect(invite.text).toContain(clinic('A'))

      // Nothing works until the link is used.
      const early = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('riya'), password: STAFF_PASSWORD })
      expect(early.body.error.code).toBe('INVALID_CREDENTIALS')

      const weak = await request(app)
        .post(`${API}/auth/invitation/accept`)
        .send({ token: tokenIn(invite), newPassword: 'short' })
      expect(weak.status).toBe(422)
      const ok = await request(app)
        .post(`${API}/auth/invitation/accept`)
        .send({ token: tokenIn(invite), newPassword: STAFF_PASSWORD })
      expect(ok.status).toBe(200)
      const reuse = await request(app)
        .post(`${API}/auth/invitation/accept`)
        .send({ token: tokenIn(invite), newPassword: STAFF_PASSWORD })
      expect(reuse.status).toBe(400)

      const riya = await signIn('riya')
      const me = await riya.agent.get(`${API}/auth/me`)
      expect(me.body).toMatchObject({ role: { key: 'receptionist' }, branch: { id: branchA }, needsSetup: false })
      expect(me.body.permissions).toContain('payment.record')
      expect(me.body.permissions).not.toContain('refund.process')

      // US-06.6: staff cannot reach staff management, roles or the clinic profile.
      expect((await riya.agent.get(`${API}/users`)).status).toBe(403)
      expect((await riya.agent.get(`${API}/roles`)).status).toBe(403)
      expect((await patch(riya, '/clinic', { name: 'Hijacked' })).status).toBe(403)
      expect((await post(riya, '/branches', { name: 'Evil', code: 'EVL' })).status).toBe(403)
    })

    it('validates the invite: branch, role, duplicate email', async () => {
      const bad = await post(ownerA, '/users', { fullName: 'X', email: 'nope', role: 'owner', branchId: 'nope' })
      expect(bad.status).toBe(422)
      expect(bad.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual([
        'branchId',
        'email',
        'fullName',
        'role',
      ])

      const foreign = await post(ownerA, '/users', {
        fullName: 'Tina',
        email: mail('tina'),
        role: 'physiotherapist',
        branchId: branchB,
      })
      expect(foreign.status).toBe(422)
      expect(foreign.body.error.fields[0].field).toBe('branchId')

      const taken = await post(ownerA, '/users', {
        fullName: 'Dup',
        email: mail('owner-A'),
        role: 'receptionist',
        branchId: branchA,
      })
      expect(taken.status).toBe(422)
      expect(taken.body.error.fields[0].field).toBe('email')
    })

    it('still creates the account when the invitation email fails, and the owner can resend it', async () => {
      setEmailSender({ send: () => Promise.reject(new Error('mail down')) })
      const created = await post(ownerA, '/users', {
        fullName: 'Mona',
        email: mail('mona'),
        role: 'physiotherapist',
        branchId: branchA,
      })
      expect(created.status).toBe(201)
      expect(created.body.invitationSent).toBe(false)
      const id = created.body.staff.id as string

      setEmailSender({ send: (m) => (inbox.push(m), Promise.resolve()) })
      expect((await post(ownerA, `/users/${id}/resend-invitation`)).status).toBe(204)
      const first = tokenIn(lastMail(mail('mona')))
      expect((await post(ownerA, `/users/${id}/resend-invitation`)).status).toBe(204)
      const second = tokenIn(lastMail(mail('mona')))
      expect(second).not.toBe(first)
      const old = await request(app)
        .post(`${API}/auth/invitation/accept`)
        .send({ token: first, newPassword: STAFF_PASSWORD })
      expect(old.status).toBe(400) // only the newest invitation works
      expect(
        (await request(app).post(`${API}/auth/invitation/accept`).send({ token: second, newPassword: STAFF_PASSWORD }))
          .status,
      ).toBe(200)

      await signIn('mona')
      expect((await post(ownerA, `/users/${id}/resend-invitation`)).status).toBe(409) // already signed in
    })

    it('edits name, role and branch, keeps the owner fixed, and audits the change (US-06.5)', async () => {
      const id = await addStaff('edit', 'receptionist', branchA)
      const moved = await patch(ownerA, `/users/${id}`, {
        fullName: 'Edited Name',
        role: 'physiotherapist',
        branchId: branchA2,
      })
      expect(moved.status).toBe(200)
      expect(moved.body).toMatchObject({
        fullName: 'Edited Name',
        role: { key: 'physiotherapist' },
        branch: { id: branchA2 },
      })

      const audit = await root.auditLog.findFirst({ where: { action: 'user.updated', targetId: id } })
      expect(audit?.details).toMatchObject({ before: { role: 'receptionist' }, after: { role: 'physiotherapist' } })

      const owner = (await ownerA.agent.get(`${API}/auth/me`)).body.id as string
      const fixed = await patch(ownerA, `/users/${owner}`, { role: 'receptionist' })
      expect(fixed.status).toBe(422)
      expect((await patch(ownerA, `/users/${owner}`, { fullName: 'Owner Renamed' })).status).toBe(200)

      expect((await patch(ownerA, `/users/${id}`, { branchId: branchB })).status).toBe(422)
      expect((await patch(ownerB, `/users/${id}`, { fullName: 'Hijack' })).status).toBe(404)
    })

    it("lists with filters, and a clinic never sees another clinic's staff", async () => {
      const id = await addStaff('listed', 'physiotherapist', branchA2)
      const all = await ownerA.agent.get(`${API}/users`)
      expect(all.body.staff.some((s: { id: string }) => s.id === id)).toBe(true)
      const filtered = await ownerA.agent.get(`${API}/users?role=physiotherapist&branchId=${branchA2}&active=true`)
      expect(filtered.body.staff.every((s: { role: { key: string } }) => s.role.key === 'physiotherapist')).toBe(true)
      expect(filtered.body.staff.some((s: { id: string }) => s.id === id)).toBe(true)

      const emails = (await ownerB.agent.get(`${API}/users`)).body.staff.map((s: { email: string }) => s.email)
      expect(emails).toEqual([mail('owner-B')])
    })

    it('deactivates (ending their sessions at once), reactivates, and protects the last owner (US-06.3, US-06.4)', async () => {
      const id = await addStaff('gone', 'receptionist', branchA)
      const staff = await signIn('gone')
      expect((await staff.agent.get(`${API}/auth/me`)).status).toBe(200)

      const off = await post(ownerA, `/users/${id}/deactivate`)
      expect(off.body.isActive).toBe(false)
      expect((await staff.agent.get(`${API}/auth/me`)).status).toBe(401)
      const refused = await request(app)
        .post(`${API}/auth/login`)
        .send({ email: mail('gone'), password: STAFF_PASSWORD })
      expect(refused.status).toBe(403)
      expect(refused.body.error.message).toMatch(/deactivated/)

      expect((await post(ownerA, `/users/${id}/reactivate`)).body.isActive).toBe(true)

      const owner = (await ownerA.agent.get(`${API}/auth/me`)).body.id as string
      const last = await post(ownerA, `/users/${owner}/deactivate`)
      expect(last.status).toBe(409)
      expect(last.body.error.code).toBe('LAST_OWNER')
      expect((await post(ownerB, `/users/${id}/deactivate`)).status).toBe(404)
    })
  })

  describe('roles and permissions (USR-002)', () => {
    it('lists the three roles with their defaults and the permission catalogue', async () => {
      const roles = await ownerA.agent.get(`${API}/roles`)
      expect(roles.body.roles.map((r: { key: string }) => r.key)).toEqual(['owner', 'receptionist', 'physiotherapist'])
      const owner = roles.body.roles[0]
      expect(owner.editable).toBe(false)
      expect(owner.permissions).not.toContain('platform.admin')
      expect(roles.body.roles[1].permissions).toContain('payment.record')

      const catalogue = await ownerA.agent.get(`${API}/permissions`)
      expect(catalogue.body.permissions.length).toBeGreaterThan(15)
      expect(catalogue.body.permissions.map((p: { key: string }) => p.key)).not.toContain('platform.admin')
    })

    it('applies a change on the next request, audits it, and refuses the owner role and bad keys (US-07)', async () => {
      await addStaff('perm', 'receptionist', branchA)
      const staff = await signIn('perm')
      const roles = (await ownerA.agent.get(`${API}/roles`)).body.roles as {
        id: string
        key: string
        permissions: string[]
      }[]
      const receptionist = roles.find((r) => r.key === 'receptionist')!
      const owner = roles.find((r) => r.key === 'owner')!
      expect((await staff.agent.get(`${API}/auth/me`)).body.permissions).not.toContain('refund.process')

      const add = await put(ownerA, `/roles/${receptionist.id}/permissions`, {
        permissions: [...receptionist.permissions, 'refund.process'],
      })
      expect(add.status).toBe(200)
      expect(add.body.permissions).toContain('refund.process')
      // US-07.3: no new sign-in needed.
      expect((await staff.agent.get(`${API}/auth/me`)).body.permissions).toContain('refund.process')

      const audit = await root.auditLog.findFirst({
        where: { action: 'role.permissions_changed', targetId: receptionist.id },
      })
      expect(audit?.details).toMatchObject({ role: 'receptionist', added: ['refund.process'], removed: [] })

      expect((await put(ownerA, `/roles/${owner.id}/permissions`, { permissions: [] })).status).toBe(403)
      expect((await put(ownerA, `/roles/${receptionist.id}/permissions`, { permissions: ['made.up'] })).status).toBe(
        422,
      )
      expect(
        (await put(ownerA, `/roles/${receptionist.id}/permissions`, { permissions: ['platform.admin'] })).status,
      ).toBe(422)
      expect((await put(ownerB, `/roles/${receptionist.id}/permissions`, { permissions: [] })).status).toBe(404)
      expect((await staff.agent.get(`${API}/roles`)).status).toBe(403)

      // Put the default back so later tests start from it.
      await put(ownerA, `/roles/${receptionist.id}/permissions`, { permissions: receptionist.permissions })
    })

    it('warns before leaving only the owner able to take payments, and applies it once confirmed (US-07.4)', async () => {
      const roles = (await ownerA.agent.get(`${API}/roles`)).body.roles as {
        id: string
        key: string
        permissions: string[]
      }[]
      const receptionist = roles.find((r) => r.key === 'receptionist')!
      const without = receptionist.permissions.filter((p) => p !== 'payment.record')

      // Physiotherapists do not hold payment.record by default, so removing it here leaves only the owner.
      const warned = await put(ownerA, `/roles/${receptionist.id}/permissions`, { permissions: without })
      expect(warned.status).toBe(409)
      expect(warned.body.error.code).toBe('PERMISSION_WARNING')
      expect(warned.body.error.details.warnings).toEqual([
        { permission: 'payment.record', message: 'After this change only the owner could record payments.' },
      ])
      const unchanged = (await ownerA.agent.get(`${API}/roles`)).body.roles.find(
        (r: { key: string }) => r.key === 'receptionist',
      )
      expect(unchanged.permissions).toContain('payment.record')

      const confirmed = await put(ownerA, `/roles/${receptionist.id}/permissions`, {
        permissions: without,
        confirmWarnings: true,
      })
      expect(confirmed.status).toBe(200)
      expect(confirmed.body.permissions).not.toContain('payment.record')
      const audit = await root.auditLog.findFirst({
        where: { action: 'role.permissions_changed', targetId: receptionist.id },
        orderBy: { createdAt: 'desc' },
      })
      expect(audit?.details).toMatchObject({ removed: ['payment.record'], confirmedWarnings: ['payment.record'] })

      // Once another staff role holds it there is nothing to warn about.
      const physio = roles.find((r) => r.key === 'physiotherapist')!
      await put(ownerA, `/roles/${physio.id}/permissions`, { permissions: [...physio.permissions, 'payment.record'] })
      const quiet = await put(ownerA, `/roles/${receptionist.id}/permissions`, {
        permissions: [...without, 'ledger.view'],
      })
      expect(quiet.status).toBe(200)
    })
  })
})
