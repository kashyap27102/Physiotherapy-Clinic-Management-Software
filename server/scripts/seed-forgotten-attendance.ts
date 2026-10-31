// Adds one fictional patient to test back-dated attendance by hand (VIS-001, permission visit.backdate): registered on
// 7 October 2026, with an active episode that began the same day and no visits at all, as if the front desk forgot to
// mark attendance for the whole stretch since.
//
//   npm run seed:forgotten-attendance                    uses your clinic if it is the only one that is not test data
//   npm run seed:forgotten-attendance -- "Clinic name"   picks a clinic by name
//   npm run seed:forgotten-attendance -- --reset         removes the patient this script added (only if it has no visits)
//
// Safe to run again: it does nothing when the patient already exists. Refuses to run in production. Made-up name and
// number; development data only (PRD REG-2).
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { dateOnly, indiaToday } from '../src/modules/patients/patientRules.js'

if (process.env['NODE_ENV'] === 'production') {
  console.error('Refusing to seed sample data in production.')
  process.exit(1)
}
if (!process.env['DATABASE_URL']) {
  console.error('DATABASE_URL is not set. Run through npm so .env is loaded: npm run seed:forgotten-attendance')
  process.exit(1)
}

const NAME = 'Mansi Trivedi (forgot attendance)'
const PHONE = '9000000007'
/** 7 October 2026, 10:30 India time. */
const STARTED = new Date('2026-10-07T10:30:00+05:30')

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })

const looksLikeTestData = (name: string) => /\s[0-9a-f]{8}$/i.test(name) || name.includes('SHOTS-')

const args = process.argv.slice(2)
const reset = args.includes('--reset')
const requested = args.find((arg) => !arg.startsWith('--'))
const tenants = await db.tenant.findMany({ select: { id: true, name: true }, orderBy: { createdAt: 'asc' } })
const candidates = requested
  ? tenants.filter((t) => t.name.toLowerCase() === requested.toLowerCase())
  : tenants.filter((t) => !looksLikeTestData(t.name))

if (candidates.length !== 1) {
  console.error(
    candidates.length === 0
      ? `No clinic found${requested ? ` named "${requested}"` : ' that is not test data'}.`
      : 'More than one clinic could be meant. Say which: npm run seed:forgotten-attendance -- "Clinic name"',
  )
  for (const t of tenants) console.error(`  ${t.name}${looksLikeTestData(t.name) ? '  (test data)' : ''}`)
  await db.$disconnect()
  process.exit(1)
}

const tenant = candidates[0]!
const existing = await db.patient.findFirst({
  where: { tenantId: tenant.id, phone: PHONE },
  select: { id: true, _count: { select: { visits: true } } },
})

if (reset) {
  if (!existing) console.log('Nothing to remove.')
  else if (existing._count.visits > 0) console.log('That patient already has visits, so it was left alone.')
  else {
    await db.episode.deleteMany({ where: { tenantId: tenant.id, patientId: existing.id } })
    await db.patient.delete({ where: { id: existing.id } })
    console.log('Removed the sample patient and their episode.')
  }
  await db.$disconnect()
  process.exit(0)
}

if (existing) {
  console.log(`${tenant.name}: "${NAME}" already exists (${existing._count.visits} visit(s)). Nothing added.`)
  await db.$disconnect()
  process.exit(0)
}

const branch = await db.branch.findFirst({ where: { tenantId: tenant.id, isActive: true }, orderBy: { code: 'asc' } })
const people = await db.userAccount.findMany({
  where: { tenantId: tenant.id, isActive: true },
  select: { id: true, branchId: true, role: { select: { key: true } } },
})
const owner = people.find((p) => p.role?.key === 'owner')
if (!branch || !owner) {
  console.error(`"${tenant.name}" needs an active branch and an owner first. Finish the setup step in the app.`)
  await db.$disconnect()
  process.exit(1)
}
const registrar = people.find((p) => p.role?.key === 'receptionist' && p.branchId === branch.id)?.id ?? owner.id

const today = indiaToday()
const patient = await db.patient.create({
  data: {
    tenantId: tenant.id,
    registeredBranchId: branch.id,
    createdById: registrar,
    fullName: NAME,
    phone: PHONE,
    ageYears: 38,
    ageRecordedOn: dateOnly(today.year, today.month, today.day),
    gender: 'female',
    address: 'Sector 5, Gandhinagar',
    notes: 'Sample patient for testing back-dated attendance. Registered 7 Oct, no visits marked yet.',
    status: 'active',
    createdAt: STARTED,
  },
})
await db.episode.create({
  data: {
    tenantId: tenant.id,
    patientId: patient.id,
    startedBranchId: branch.id,
    status: 'active',
    startedAt: STARTED,
  },
})

console.log(
  `${tenant.name}: added "${NAME}" (phone ${PHONE}) at ${branch.name}, registered and episode started 7 Oct 2026.`,
)
await db.$disconnect()
