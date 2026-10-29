import { PrismaPg } from '@prisma/adapter-pg'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { setEmailSender } from '../src/lib/email/index.js'
import { addAndSignInStaff, API, captureEmail, patch, post, registerClinic, type Session } from './helpers/clinic.js'

/**
 * Patients (PAT-001 to PAT-005) end to end against TEST_DATABASE_URL, with a second clinic to prove isolation
 * (SEC-001). Skipped without it. Everything the run creates is removed afterwards. Test data only (PRD REG-2).
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

vi.setConfig({ testTimeout: 180_000, hookTimeout: 180_000 })

interface Person {
  fullName: string
  phone: string
  age?: number
  dateOfBirth?: string
  gender: string
  [key: string]: unknown
}

describe.skipIf(!url)('patients', () => {
  let root: PrismaClient
  const app = createApp()
  const run = randomUUID().slice(0, 8)
  const mail = captureEmail()
  const env = { app, run, last: mail.last }

  let ownerA: Session
  let ownerB: Session
  let branch1: string
  let branch2: string
  let clinicB: string
  let front1: Session // receptionist at branch 1
  let front2: Session // receptionist at branch 2
  let physio1: Session // physiotherapist at branch 1
  let front1Id: string
  let front2Id: string

  const phoneOf = (n: number) => `98${String(n).padStart(8, '0')}`
  let counter = 0
  /** A unique, valid mobile number per call, so tests do not trip the duplicate warning by accident. */
  const freshPhone = () => phoneOf(10_000_000 + run.charCodeAt(0) * 1000 + ++counter)
  // Unrelated names, so the duplicate check (which compares names) does not fire by accident.
  const FIRST = [
    'Anil',
    'Bhavna',
    'Chirag',
    'Divya',
    'Eshaan',
    'Farah',
    'Gaurav',
    'Hema',
    'Irfan',
    'Jaya',
    'Karan',
    'Lata',
    'Manoj',
    'Nisha',
    'Omkar',
    'Pallavi',
  ]
  const LAST = ['Kapoor', 'Iyer', 'Shah', 'Nair', 'Verma', 'Khan', 'Malhotra', 'Pillai', 'Qureshi', 'Reddy', 'Bedi']
  const nextName = () => `${FIRST[counter % FIRST.length]} ${LAST[(counter * 5) % LAST.length]}`
  const person = (extra: Partial<Person> = {}): Person => ({
    phone: freshPhone(),
    fullName: nextName(),
    age: 34,
    gender: 'female',
    ...extra,
  })
  const register = async (s: Session, body: Person, confirm = false) =>
    s.agent
      .post(`${API}/patients${confirm ? '?confirmDuplicate=true' : ''}`)
      .set('X-CSRF-Token', s.csrf)
      .send(body)
  const search = (s: Session, q: string, extra = '') =>
    s.agent.get(`${API}/patients?q=${encodeURIComponent(q)}${extra}`)

  beforeAll(async () => {
    root = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) })
    const a = await registerClinic(env, 'A', 'PA1')
    const b = await registerClinic(env, 'B', 'PB1')
    ownerA = a.owner
    branch1 = a.branchId
    ownerB = b.owner
    clinicB = b.branchId
    branch2 = (await post(ownerA, '/branches', { name: 'A Second', code: 'PA2' })).body.id as string
    front1 = await addAndSignInStaff(env, ownerA, 'front1', 'receptionist', branch1)
    front2 = await addAndSignInStaff(env, ownerA, 'front2', 'receptionist', branch2)
    physio1 = await addAndSignInStaff(env, ownerA, 'physio1', 'physiotherapist', branch1)
    front1Id = (await front1.agent.get(`${API}/auth/me`)).body.id as string
    front2Id = (await front2.agent.get(`${API}/auth/me`)).body.id as string
  })

  afterAll(async () => {
    setEmailSender(undefined)
    const tenants = await root.tenant.findMany({ where: { name: { endsWith: ` ${run}` } }, select: { id: true } })
    const ids = tenants.map((t) => t.id)
    await root.auditLog.deleteMany({ where: { tenantId: { in: ids } } })
    await root.patient.deleteMany({ where: { tenantId: { in: ids } } })
    await root.userAccount.deleteMany({ where: { tenantId: { in: ids } } })
    await root.rolePermission.deleteMany({ where: { role: { tenantId: { in: ids } } } })
    await root.role.deleteMany({ where: { tenantId: { in: ids } } })
    await root.branch.deleteMany({ where: { tenantId: { in: ids } } })
    await root.subscription.deleteMany({ where: { tenantId: { in: ids } } })
    await root.tenant.deleteMany({ where: { id: { in: ids } } })
    await root.pendingRegistration.deleteMany({ where: { email: { endsWith: `-${run}@example.test` } } })
    await root.$disconnect()
  })

  describe('registration (PAT-001, US-08)', () => {
    it("creates a patient with the four mandatory fields at the user's own branch", async () => {
      const res = await register(front1, {
        fullName: '  Anita   Rao ',
        phone: '+91 98765-43210',
        age: 41,
        gender: 'female',
      })
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        fullName: 'Anita Rao',
        phone: '9876543210',
        phoneContactType: 'self',
        age: 41,
        gender: 'female',
        dateOfBirth: null,
        status: 'active',
        registeredBranch: 'A Main',
        activeEpisodeId: null,
        balance: { amount: '0.00', state: 'zero' },
      })
      const audit = await root.auditLog.findFirst({ where: { action: 'patient.created', targetId: res.body.id } })
      expect(audit).toMatchObject({ userId: front1Id, branchId: branch1 })
    })

    it('names every missing or invalid field and saves nothing (US-08.2)', async () => {
      const res = await register(front1, { fullName: '', phone: '12345', gender: 'robot' } as unknown as Person)
      expect(res.status).toBe(422)
      expect(res.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual([
        'age',
        'fullName',
        'gender',
        'phone',
      ])
      expect((await register(front1, person({ age: 140 }))).status).toBe(422)
      expect((await register(front1, person({ email: 'not-an-email' }))).status).toBe(422)
    })

    it('derives the age from a date of birth, and refuses impossible ones (US-08.4)', async () => {
      const year = new Date().getUTCFullYear() - 30
      const res = await register(front1, person({ age: undefined, dateOfBirth: `${year}-01-01` }))
      expect(res.status).toBe(201)
      expect(res.body.dateOfBirth).toBe(`${year}-01-01`)
      expect(res.body.age).toBeGreaterThanOrEqual(29)
      expect(res.body.age).toBeLessThanOrEqual(30)

      const both = await register(front1, person({ age: 70, dateOfBirth: `${year}-01-01` }))
      expect(both.body.age).toBeLessThanOrEqual(30) // the date of birth wins over the age typed

      expect((await register(front1, person({ age: undefined, dateOfBirth: '2999-01-01' }))).status).toBe(422)
      expect((await register(front1, person({ age: undefined, dateOfBirth: '2020-02-31' }))).status).toBe(422)
      expect((await register(front1, person({ age: undefined, dateOfBirth: '1800-01-01' }))).status).toBe(422)
    })

    it("marks a guardian's number as such and keeps optional details (US-08.5)", async () => {
      const res = await register(
        front1,
        person({
          phoneContactType: 'guardian',
          address: '12 FC Road',
          occupation: 'Student',
          notes: 'Knee pain after football',
          email: 'Kid@Example.com',
        }),
      )
      expect(res.status).toBe(201)
      expect(res.body).toMatchObject({
        phoneContactType: 'guardian',
        address: '12 FC Road',
        occupation: 'Student',
        email: 'kid@example.com',
      })
    })

    it('needs an owner to choose the branch, since owners work across branches', async () => {
      const none = await register(ownerA, person())
      expect(none.status).toBe(422)
      expect(none.body.error.fields[0].field).toBe('branchId')
      const ok = await register(ownerA, person({ branchId: branch2 }))
      expect(ok.status).toBe(201)
      expect(ok.body.registeredBranch).toBe('A Second')
      expect((await register(ownerA, person({ branchId: clinicB }))).status).toBe(422) // another clinic's branch
      // Staff cannot register somewhere else by sending a branch.
      const sneaky = await register(front1, person({ branchId: branch2 }))
      expect(sneaky.body.registeredBranch).toBe('A Main')
    })

    it('is not available without the register permission (physiotherapist default)', async () => {
      const res = await register(physio1, person())
      expect(res.status).toBe(403)
      expect(res.body.error.code).toBe('PERMISSION_DENIED')
    })
  })

  describe('possible duplicates (BR-PAT-2, US-08.3)', () => {
    it('warns about the same phone number and lets the user go ahead', async () => {
      const first = await register(front1, person({ fullName: `Mohan Joshi` }))
      const phone = first.body.phone as string

      const warned = await register(front1, person({ fullName: `Sunita Joshi`, phone }))
      expect(warned.status).toBe(409)
      expect(warned.body.error.code).toBe('DUPLICATE_PATIENT_WARNING')
      expect(warned.body.error.details.candidates).toHaveLength(1)
      expect(warned.body.error.details.candidates[0]).toMatchObject({ id: first.body.id, phone })

      const confirmed = await register(front1, person({ fullName: `Sunita Joshi`, phone }), true)
      expect(confirmed.status).toBe(201)
    })

    it('warns about a very similar name even with a different number, but not about a different person', async () => {
      const first = await register(front1, person({ fullName: `Rajendra Deshpande` }))
      const similar = await register(front1, person({ fullName: `Rajendra Deshpandey` }))
      expect(similar.status).toBe(409)
      expect(similar.body.error.details.candidates.map((c: { id: string }) => c.id)).toContain(first.body.id)

      const different = await register(front1, person({ fullName: `Kavita Menon` }))
      expect(different.status).toBe(201)
    })

    it('never mentions patients of another clinic', async () => {
      const a = await register(front1, person({ fullName: `Shared Name` }))
      const sameInB = await register(
        ownerB,
        person({ fullName: `Shared Name`, phone: a.body.phone, branchId: clinicB }),
      )
      expect(sameInB.status).toBe(201) // no warning: clinic A's patient is invisible to clinic B
    })
  })

  describe('search (PAT-002, PAT-005, US-09, US-11)', () => {
    let target: { id: string; phone: string; name: string }

    beforeAll(async () => {
      const name = 'Zubin Fernandes'
      const res = await register(front1, person({ fullName: name, age: 52, gender: 'male' }))
      target = { id: res.body.id as string, phone: res.body.phone as string, name }
      await register(front1, person({ fullName: 'Zoya Fernandes' }), true)
    })

    it('finds by part of the phone number, four digits or more (US-09.1)', async () => {
      const res = await search(front1, target.phone.slice(2, 8))
      expect(res.status).toBe(200)
      expect(res.body.items.map((p: { id: string }) => p.id)).toContain(target.id)
      expect((await search(front1, target.phone.slice(0, 3))).body).toMatchObject({ items: [], total: 0 })
      expect((await search(front1, `+91 ${target.phone}`)).body.items[0].id).toBe(target.id)
    })

    it('finds by part of the name in any letter case, and by several words (US-09.2)', async () => {
      const lower = await search(front1, `zubin fern`)
      expect(lower.body.items.map((p: { fullName: string }) => p.fullName)).toContain(target.name)
      const both = await search(front1, 'FERNANDES')
      expect(both.body.total).toBe(2)
      const narrow = await search(front1, `fernandes zubin`)
      expect(narrow.body.items.map((p: { id: string }) => p.id)).toEqual([target.id])
    })

    it('shows what the list needs, with the balance only to those who may see it (US-09.3)', async () => {
      const row = (await search(front1, target.name)).body.items[0]
      expect(row).toMatchObject({
        id: target.id,
        fullName: target.name,
        phone: target.phone,
        age: 52,
        gender: 'male',
        lastVisitAt: null,
        lastVisitBranch: null,
        balance: { state: 'zero' },
      })
      // The physiotherapist role has no ledger.view by default.
      expect((await search(physio1, target.name)).body.items[0].balance).toBeNull()
    })

    it('pages the results (US-09.4)', async () => {
      const page1 = await search(front1, '', '&pageSize=3&page=1')
      const page2 = await search(front1, '', '&pageSize=3&page=2')
      expect(page1.body.items).toHaveLength(3)
      expect(page1.body.total).toBeGreaterThan(3)
      expect(page2.body.items.map((p: { id: string }) => p.id)).not.toContain(page1.body.items[0].id)
      expect((await search(front1, '', '&pageSize=500')).status).toBe(422)
    })

    it('filters by registering branch, gender, contact type and registration date, and sorts', async () => {
      const atBranch2 = await register(front2, person({ fullName: 'Yamini Gokhale', gender: 'female' }))
      const onlyBranch2 = await search(ownerA, '', `&branchId=${branch2}&pageSize=50`)
      expect(onlyBranch2.status).toBe(200)
      const ids = onlyBranch2.body.items.map((p: { id: string }) => p.id)
      expect(ids).toContain(atBranch2.body.id)
      expect(ids).not.toContain(target.id) // registered at branch 1
      expect(onlyBranch2.body.items[0].registeredBranch).toEqual({ id: branch2, name: 'A Second' })
      // Another clinic's branch matches nothing rather than leaking anything.
      expect((await search(ownerA, '', `&branchId=${clinicB}`)).body.total).toBe(0)

      const men = await search(front1, 'Fernandes', '&gender=male')
      expect(men.body.items.map((p: { id: string }) => p.id)).toEqual([target.id])
      const guardians = await search(front1, '', '&phoneContactType=guardian&pageSize=50')
      expect(guardians.body.items.every((p: { phoneContactType: string }) => p.phoneContactType === 'guardian')).toBe(
        true,
      )

      const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
      expect((await search(front1, target.name, `&registeredFrom=${today}&registeredTo=${today}`)).body.total).toBe(1)
      expect((await search(front1, target.name, '&registeredTo=2020-01-01')).body.total).toBe(0)
      const backwards = await search(front1, '', `&registeredFrom=${today}&registeredTo=2020-01-01`)
      expect(backwards.status).toBe(422)
      expect((await search(front1, '', '&registeredFrom=2026-02-31')).status).toBe(422)

      const az = (await search(front1, 'Fernandes', '&sort=name')).body.items.map(
        (p: { fullName: string }) => p.fullName,
      )
      expect(az).toEqual(['Zoya Fernandes', 'Zubin Fernandes'])
      const za = (await search(front1, 'Fernandes', '&sort=name_desc')).body.items.map(
        (p: { fullName: string }) => p.fullName,
      )
      expect(za).toEqual(['Zubin Fernandes', 'Zoya Fernandes'])
      expect((await search(front1, '', '&sort=random')).status).toBe(422)
    })

    it('lists recent patients when nothing is typed', async () => {
      const res = await front1.agent.get(`${API}/patients`)
      expect(res.status).toBe(200)
      expect(res.body.items.length).toBeGreaterThan(0)
    })

    it('shows a patient registered at another branch with full access (US-11.1)', async () => {
      const found = await search(front2, target.name) // front2 works at branch 2, the patient was registered at branch 1
      expect(found.body.items.map((p: { id: string }) => p.id)).toEqual([target.id])
      const opened = await front2.agent.get(`${API}/patients/${target.id}`)
      expect(opened.status).toBe(200)
      expect(opened.body.registeredBranch).toBe('A Main')
    })

    it("never shows another clinic's patients (US-11.4)", async () => {
      expect((await search(ownerB, target.name)).body.total).toBe(0)
      expect((await search(ownerB, target.phone)).body.total).toBe(0)
      expect((await ownerB.agent.get(`${API}/patients/${target.id}`)).status).toBe(404)
    })

    it('needs the view permission', async () => {
      const anonymous = await (await import('supertest')).default(app).get(`${API}/patients`)
      expect(anonymous.status).toBe(401)
    })
  })

  describe('profile (PAT-003, US-10, US-11.5)', () => {
    it("opens with the details and audits every view with the viewer's own branch", async () => {
      const made = await register(front1, person({ fullName: `Viewed Person`, address: 'Baner' }))
      const id = made.body.id as string

      const opened = await front2.agent.get(`${API}/patients/${id}`)
      expect(opened.body).toMatchObject({ id, fullName: `Viewed Person`, address: 'Baner', balance: { state: 'zero' } })
      await front2.agent.get(`${API}/patients/${id}`)

      const views = await root.auditLog.findMany({ where: { action: 'patient.viewed', targetId: id } })
      expect(views).toHaveLength(2)
      expect(views[0]).toMatchObject({ userId: front2Id, branchId: branch2 })
    })

    it('hides the balance from roles without ledger.view (US-10.3)', async () => {
      const made = await register(front1, person())
      const asPhysio = await physio1.agent.get(`${API}/patients/${made.body.id}`)
      expect(asPhysio.status).toBe(200)
      expect(asPhysio.body.balance).toBeNull()
    })

    it("answers 404 for an unknown id, a malformed id, or another clinic's patient", async () => {
      expect((await front1.agent.get(`${API}/patients/${randomUUID()}`)).status).toBe(404)
      expect((await front1.agent.get(`${API}/patients/not-an-id`)).status).toBe(422)
    })
  })

  describe('editing (PAT-004, US-11a)', () => {
    it('changes details and records the old and new values (US-11a.1)', async () => {
      const made = await register(front1, person({ fullName: `Edit Me`, address: 'Old Street', notes: 'first' }))
      const id = made.body.id as string
      const newPhone = freshPhone()

      const edited = await patch(front2, `/patients/${id}`, {
        phone: ` ${newPhone.slice(0, 5)} ${newPhone.slice(5)} `,
        address: 'New Street',
        notes: '',
        phoneContactType: 'guardian',
      })
      expect(edited.status).toBe(200)
      expect(edited.body).toMatchObject({
        phone: newPhone,
        address: 'New Street',
        notes: null,
        phoneContactType: 'guardian',
      })

      const audit = await root.auditLog.findFirst({ where: { action: 'patient.updated', targetId: id } })
      expect(audit).toMatchObject({ userId: front2Id, branchId: branch2 })
      expect(audit?.details).toEqual({
        before: { phone: made.body.phone, address: 'Old Street', notes: 'first', phoneContactType: 'self' },
        after: { phone: newPhone, address: 'New Street', notes: null, phoneContactType: 'guardian' },
      })
    })

    it('records nothing when nothing changed', async () => {
      const made = await register(front1, person())
      const id = made.body.id as string
      expect((await patch(front1, `/patients/${id}`, { fullName: made.body.fullName })).status).toBe(200)
      expect(await root.auditLog.count({ where: { action: 'patient.updated', targetId: id } })).toBe(0)
    })

    it('warns when the new phone belongs to another patient, and proceeds once confirmed (US-11a.2)', async () => {
      const first = await register(front1, person({ fullName: `Lalit Wagle` }))
      const second = await register(front1, person({ fullName: `Mira Kulkarni` }))
      const clash = await patch(front1, `/patients/${second.body.id}`, { phone: first.body.phone })
      expect(clash.status).toBe(409)
      expect(clash.body.error.code).toBe('DUPLICATE_PATIENT_WARNING')
      expect(clash.body.error.details.candidates.map((c: { id: string }) => c.id)).toEqual([first.body.id])

      const sure = await front1.agent
        .patch(`${API}/patients/${second.body.id}?confirmDuplicate=true`)
        .set('X-CSRF-Token', front1.csrf)
        .send({ phone: first.body.phone })
      expect(sure.status).toBe(200)

      // Saving a patient with their own phone number is not a duplicate of themselves.
      expect(
        (await patch(front1, `/patients/${first.body.id}`, { phone: first.body.phone, notes: 'same phone' })).status,
      ).toBe(200)
    })

    it('keeps age and date of birth consistent when either is edited (BR-PAT-3)', async () => {
      const made = await register(front1, person({ age: 40 }))
      const id = made.body.id as string
      const year = new Date().getUTCFullYear() - 20
      const withDob = await patch(front1, `/patients/${id}`, { dateOfBirth: `${year}-06-15` })
      expect(withDob.body.dateOfBirth).toBe(`${year}-06-15`)
      expect(withDob.body.age).toBeGreaterThanOrEqual(19)
      expect(withDob.body.age).toBeLessThanOrEqual(20)

      const typedAge = await patch(front1, `/patients/${id}`, { age: 25 })
      expect(typedAge.body).toMatchObject({ age: 25, dateOfBirth: null })

      const cleared = await patch(front1, `/patients/${id}`, { dateOfBirth: `${year}-06-15` })
      const afterClear = await patch(front1, `/patients/${id}`, { dateOfBirth: null })
      expect(afterClear.body.dateOfBirth).toBeNull()
      expect(afterClear.body.age).toBe(cleared.body.age) // the age they have today is kept
    })

    it('validates edits like registration', async () => {
      const made = await register(front1, person())
      const bad = await patch(front1, `/patients/${made.body.id}`, {
        phone: '123',
        age: 400,
        gender: 'x',
        fullName: ' ',
      })
      expect(bad.status).toBe(422)
      expect(bad.body.error.fields.map((f: { field: string }) => f.field).sort()).toEqual([
        'age',
        'fullName',
        'gender',
        'phone',
      ])
    })

    it('needs the edit permission, and another clinic cannot reach the patient (US-11a.3, SEC-001)', async () => {
      const made = await register(front1, person())
      const id = made.body.id as string
      const denied = await patch(physio1, `/patients/${id}`, { notes: 'sneaky' })
      expect(denied.status).toBe(403)
      expect((await patch(ownerB, `/patients/${id}`, { notes: 'hijack' })).status).toBe(404)
      expect((await front1.agent.get(`${API}/patients/${id}`)).body.notes).toBeNull()
    })
  })
})
